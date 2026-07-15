/**
 * Cuaderno de trabajo diario — núcleo puro.
 *
 * Las tareas automáticas NO se materializan en DB: se calculan en tiempo real
 * desde señales normalizadas de los módulos (banco, tesorería, cartera, clientes,
 * alertas). Cada tarea automática tiene un `task_key` estable SIN fecha, para que
 * las interacciones del usuario (completar / ignorar hoy / posponer) se persistan
 * una sola vez por clave (upsert) y la tarea reaparezca al día siguiente salvo que
 * tenga una regla de ignorar/snooze vigente.
 *
 * Módulo puro y determinista: sin fetch, sin Date.now() implícito (el "hoy" se
 * pasa como parámetro). Testeable de punta a punta.
 */

import type { ModuleKey } from "@/lib/auth/module-permissions";
import type {
  DailyTask,
  DailyTaskPriority,
  DailyTaskStatus,
} from "@/lib/daily-tasks/daily-tasks-types";

// ─── Orígenes ───────────────────────────────────────────────────────────────

export type WorkbookOrigin =
  | "banco"
  | "conciliacion"
  | "tesoreria"
  | "cartera"
  | "cliente"
  | "alerta"
  | "manual";

/** Etiqueta corta y no técnica para el badge de origen. */
export const WORKBOOK_ORIGIN_LABELS: Record<WorkbookOrigin, string> = {
  banco: "Banco",
  conciliacion: "Banco",
  tesoreria: "Tesorería",
  cartera: "Cartera",
  cliente: "Clientes",
  alerta: "Alertas",
  manual: "Manual",
};

/** Módulo de permisos que respalda cada origen (para gating + persistencia). */
const ORIGIN_MODULE: Record<WorkbookOrigin, ModuleKey> = {
  banco: "bank_movements",
  conciliacion: "bank_movements",
  tesoreria: "tesoreria",
  cartera: "cartera",
  cliente: "clientes",
  alerta: "hoy",
  manual: "manual",
};

/** Orden de desempate por origen (menor = más arriba). */
const ORIGIN_RANK: Record<WorkbookOrigin, number> = {
  conciliacion: 0,
  tesoreria: 1,
  cartera: 2,
  cliente: 3,
  alerta: 4,
  banco: 5,
  manual: 6,
};

const PRIORITY_RANK: Record<DailyTaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Entradas normalizadas del generador ──────────────────────────────────────

export type AutoBankInput = {
  /** Movimientos pendientes con alguna sugerencia de conciliación. */
  withSuggestion: number;
  high: number;
  medium: number;
  low: number;
  /** Total de movimientos pendientes (con o sin sugerencia). */
  pending: number;
};

export type AutoTreasuryPayment = {
  name: string;
  amount: number;
  currency: string;
  dueDate: string; // YYYY-MM-DD
};

export type AutoClient = {
  name: string;
  overdue?: number;
  currency?: string;
};

export type AutoCurrencyAmount = { currency: string; amount: number };

export type AutomaticTaskInput = {
  /** "Hoy" en formato YYYY-MM-DD. */
  today: string;
  bank?: AutoBankInput;
  /** Pagos que vencen exactamente hoy. */
  treasuryDueToday?: AutoTreasuryPayment[];
  /** Pagos que vencen en los próximos días (típ. 1..3). */
  treasuryUpcoming?: AutoTreasuryPayment[];
  /** Clientes con deuda vencida, idealmente ordenados por monto desc. */
  overdueClients?: AutoClient[];
  /** Monto vencido total por moneda. */
  overdueByCurrency?: AutoCurrencyAmount[];
  /** Clientes con riesgo alto. */
  criticalClients?: AutoClient[];
  /** Alertas activas (no leídas). */
  alerts?: { active: number; critical: number };
};

/** Umbral para elevar "movimientos pendientes" a prioridad alta. */
export const BANK_PENDING_HIGH_THRESHOLD = 25;
/** Monto vencido que eleva "cartera vencida" a prioridad alta (equivalente simple). */
export const OVERDUE_HIGH_AMOUNT = 100_000;
/** Cantidad de clientes vencidos que eleva a prioridad alta. */
export const OVERDUE_HIGH_CLIENT_COUNT = 5;

// ─── Tarea automática generada ────────────────────────────────────────────────

export type GeneratedTask = {
  task_key: string;
  origin: WorkbookOrigin;
  moduleKey: ModuleKey;
  priority: DailyTaskPriority;
  title: string;
  reason: string;
  impact: string;
  actionLabel: string;
  actionUrl: string;
  /** Acción secundaria del menú (ej. "Ignorar por hoy" / "Posponer"). */
  secondaryLabel: string;
  dueLabel?: string;
};

// ─── Helpers de formato (no técnicos, es-UY) ──────────────────────────────────

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

const MONEY_FMT = new Intl.NumberFormat("es-UY", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatWorkbookMoney(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "USD" : "$";
  return `${symbol} ${MONEY_FMT.format(Math.round(amount))}`;
}

function joinCurrencyAmounts(items: AutoCurrencyAmount[]): string {
  return items
    .filter((i) => i.amount > 0)
    .map((i) => formatWorkbookMoney(i.amount, i.currency))
    .join(" + ");
}

function topNames(clients: AutoClient[], n: number): string {
  const names = clients.slice(0, n).map((c) => c.name.trim()).filter(Boolean);
  return names.join(", ");
}

// ─── Prioridad central (Fase 9) ───────────────────────────────────────────────

export type PrioritySignal =
  | { kind: "bank_reconciliation"; high: number }
  | { kind: "bank_pending"; pending: number }
  | { kind: "treasury_due_today" }
  | { kind: "treasury_upcoming" }
  | { kind: "portfolio_overdue"; clients: number; totalOverdue: number }
  | { kind: "clients_critical"; count: number }
  | { kind: "alerts_active"; critical: number };

/**
 * Regla única de prioridad para tareas automáticas.
 * Alta: conciliación high, pagos hoy, deuda vencida relevante, alertas críticas,
 * muchos clientes críticos. Media: el resto operativo.
 */
export function calculateDailyTaskPriority(signal: PrioritySignal): DailyTaskPriority {
  switch (signal.kind) {
    case "bank_reconciliation":
      return signal.high > 0 ? "high" : "medium";
    case "bank_pending":
      return signal.pending >= BANK_PENDING_HIGH_THRESHOLD ? "high" : "medium";
    case "treasury_due_today":
      return "high";
    case "treasury_upcoming":
      return "medium";
    case "portfolio_overdue":
      return signal.clients >= OVERDUE_HIGH_CLIENT_COUNT ||
        signal.totalOverdue >= OVERDUE_HIGH_AMOUNT
        ? "high"
        : "medium";
    case "clients_critical":
      return signal.count >= 3 ? "high" : "medium";
    case "alerts_active":
      return signal.critical > 0 ? "high" : "medium";
    default:
      return "medium";
  }
}

// ─── Generador de tareas automáticas (Fase 3) ─────────────────────────────────

export function generateAutomaticTasks(input: AutomaticTaskInput): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const make = (
    origin: WorkbookOrigin,
    partial: Omit<GeneratedTask, "origin" | "moduleKey">
  ): GeneratedTask => ({ origin, moduleKey: ORIGIN_MODULE[origin], ...partial });

  // 1. Banco / Conciliación con sugerencia
  if (input.bank && input.bank.withSuggestion > 0) {
    const { withSuggestion, high, medium, low } = input.bank;
    const detail: string[] = [];
    if (high > 0) detail.push(`${high} ${plural(high, "coincidencia alta", "coincidencias altas")}`);
    if (medium > 0)
      detail.push(`${medium} ${plural(medium, "media", "medias")}`);
    if (low > 0) detail.push(`${low} ${plural(low, "baja", "bajas")}`);
    const reason =
      detail.length > 0
        ? `Copilot encontró ${detail.join(" y ")} para conciliar.`
        : "Copilot encontró movimientos que podrían coincidir con pagos de Tesorería.";
    tasks.push(
      make("conciliacion", {
        task_key: "bank:reconciliation:with_suggestion",
        priority: calculateDailyTaskPriority({ kind: "bank_reconciliation", high }),
        title: `Revisar ${withSuggestion} ${plural(withSuggestion, "movimiento", "movimientos")} con sugerencia`,
        reason,
        impact: "Ayuda a cerrar pagos reales contra Tesorería y mantener el banco al día.",
        actionLabel: "Ver conciliación",
        actionUrl: "/copilot/movimientos-bancarios?tab=reconciliation&filter=with_suggestion",
        secondaryLabel: "Ignorar por hoy",
      })
    );
  }

  // 2. Banco / Movimientos pendientes sin revisar
  if (input.bank) {
    const withoutSuggestion = Math.max(0, input.bank.pending - input.bank.withSuggestion);
    const showPending =
      input.bank.pending >= BANK_PENDING_HIGH_THRESHOLD || withoutSuggestion > 0;
    if (showPending && input.bank.pending > 0) {
      tasks.push(
        make("banco", {
          task_key: "bank:pending_review",
          priority: calculateDailyTaskPriority({
            kind: "bank_pending",
            pending: input.bank.pending,
          }),
          title: `Revisar ${input.bank.pending} ${plural(input.bank.pending, "movimiento bancario pendiente", "movimientos bancarios pendientes")}`,
          reason: "Hay movimientos del banco sin identificar ni conciliar.",
          impact: "Mantiene el banco ordenado y evita que se acumule trabajo.",
          actionLabel: "Ver movimientos",
          actionUrl: "/copilot/movimientos-bancarios",
          secondaryLabel: "Ignorar por hoy",
        })
      );
    }
  }

  // 3. Tesorería / Pagos que vencen hoy
  if (input.treasuryDueToday && input.treasuryDueToday.length > 0) {
    const items = input.treasuryDueToday;
    const byCurrency = sumByCurrency(items);
    const totalLabel = joinCurrencyAmounts(byCurrency);
    const names = items.length <= 3 ? topNames(items, 3) : "";
    const reasonParts = [
      `Hay ${items.length} ${plural(items.length, "pago", "pagos")} con vencimiento hoy.`,
    ];
    if (totalLabel) reasonParts.push(`Total: ${totalLabel}.`);
    if (names) reasonParts.push(names + ".");
    tasks.push(
      make("tesoreria", {
        task_key: "treasury:due_today",
        priority: calculateDailyTaskPriority({ kind: "treasury_due_today" }),
        title: `Confirmar ${items.length} ${plural(items.length, "pago", "pagos")} que ${plural(items.length, "vence", "vencen")} hoy`,
        reason: reasonParts.join(" "),
        impact: "Evita atrasos con proveedores, impuestos y sueldos.",
        actionLabel: "Ver Tesorería",
        actionUrl: "/copilot/tesoreria",
        secondaryLabel: "Posponer",
        dueLabel: "Vence hoy",
      })
    );
  }

  // 4. Tesorería / Pagos próximos
  if (input.treasuryUpcoming && input.treasuryUpcoming.length > 0) {
    const items = input.treasuryUpcoming;
    const byCurrency = sumByCurrency(items);
    const totalLabel = joinCurrencyAmounts(byCurrency);
    tasks.push(
      make("tesoreria", {
        task_key: "treasury:upcoming",
        priority: calculateDailyTaskPriority({ kind: "treasury_upcoming" }),
        title: `Preparar ${items.length} ${plural(items.length, "pago próximo", "pagos próximos")}`,
        reason: totalLabel
          ? `Vencen en los próximos días. Total: ${totalLabel}.`
          : "Hay pagos que vencen en los próximos días.",
        impact: "Te da tiempo para asegurar fondos antes del vencimiento.",
        actionLabel: "Ver Tesorería",
        actionUrl: "/copilot/tesoreria",
        secondaryLabel: "Posponer",
      })
    );
  }

  // 5. Cartera / deuda vencida
  if (input.overdueClients && input.overdueClients.length > 0) {
    const clients = input.overdueClients;
    const byCurrency = input.overdueByCurrency ?? [];
    const totalOverdue = byCurrency.reduce((acc, c) => acc + c.amount, 0);
    const totalLabel = joinCurrencyAmounts(byCurrency);
    const top = topNames(clients, 3);
    const reasonParts = [
      `Hay ${clients.length} ${plural(clients.length, "cliente", "clientes")} con deuda vencida.`,
    ];
    if (totalLabel) reasonParts.push(`Vencido: ${totalLabel}.`);
    if (top) reasonParts.push(`Ej.: ${top}.`);
    tasks.push(
      make("cartera", {
        task_key: "portfolio:overdue_clients",
        priority: calculateDailyTaskPriority({
          kind: "portfolio_overdue",
          clients: clients.length,
          totalOverdue,
        }),
        title: `Contactar ${clients.length} ${plural(clients.length, "cliente", "clientes")} con deuda vencida`,
        reason: reasonParts.join(" "),
        impact: "Mejora la cobranza y reduce el atraso.",
        actionLabel: "Ver cartera",
        actionUrl: "/copilot/cartera",
        secondaryLabel: "Posponer",
      })
    );
  }

  // 6. Clientes críticos
  if (input.criticalClients && input.criticalClients.length > 0) {
    const clients = input.criticalClients;
    const top = topNames(clients, 3);
    tasks.push(
      make("cliente", {
        task_key: "clients:critical",
        priority: calculateDailyTaskPriority({
          kind: "clients_critical",
          count: clients.length,
        }),
        title: `Revisar ${clients.length} ${plural(clients.length, "cliente crítico", "clientes críticos")}`,
        reason: top
          ? `Clientes con riesgo alto. Ej.: ${top}.`
          : "Hay clientes con riesgo alto que conviene revisar.",
        impact: "Anticipa problemas de cobro antes de que se agraven.",
        actionLabel: "Ver clientes",
        actionUrl: "/copilot/clientes",
        secondaryLabel: "Ignorar por hoy",
      })
    );
  }

  // 7. Alertas activas
  if (input.alerts && input.alerts.active > 0) {
    tasks.push(
      make("alerta", {
        task_key: "alerts:active",
        priority: calculateDailyTaskPriority({
          kind: "alerts_active",
          critical: input.alerts.critical,
        }),
        title: `Revisar ${input.alerts.active} ${plural(input.alerts.active, "alerta activa", "alertas activas")}`,
        reason:
          input.alerts.critical > 0
            ? `Tenés ${input.alerts.critical} ${plural(input.alerts.critical, "alerta crítica", "alertas críticas")} sin resolver.`
            : "Hay alertas activas que conviene revisar.",
        impact: "Te mantiene al tanto de riesgos y cambios importantes.",
        actionLabel: "Ver alertas",
        actionUrl: "/copilot/alertas",
        secondaryLabel: "Ignorar por hoy",
      })
    );
  }

  return tasks;
}

function sumByCurrency(items: AutoTreasuryPayment[]): AutoCurrencyAmount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.currency, (map.get(item.currency) ?? 0) + item.amount);
  }
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount }));
}

// ─── Interacciones persistidas de tareas automáticas ──────────────────────────

/** Fila mínima de interacción leída desde daily_tasks (source_type = 'auto'). */
export type AutoInteraction = {
  task_key: string;
  status: DailyTaskStatus;
  snoozed_until: string | null; // YYYY-MM-DD
  completed_at: string | null; // ISO
  due_date: string | null; // fecha "ignorado por" (YYYY-MM-DD)
};

export type InteractionBuckets = {
  active: GeneratedTask[];
  completedToday: GeneratedTask[];
  postponed: GeneratedTask[];
};

function ymd(value: string | null): string {
  return (value ?? "").slice(0, 10);
}

/**
 * Aplica interacciones del usuario sobre las tareas automáticas del día:
 * - done + completado hoy  → completadas hoy
 * - cancelled (ignorada) con due_date == hoy → oculta hoy
 * - postponed con snoozed_until > hoy       → pospuestas (oculta hasta esa fecha)
 * - cualquier interacción vencida            → vuelve a "active"
 */
export function applyInteractions(
  tasks: GeneratedTask[],
  interactions: AutoInteraction[],
  today: string
): InteractionBuckets {
  const byKey = new Map<string, AutoInteraction>();
  for (const it of interactions) byKey.set(it.task_key, it);

  const buckets: InteractionBuckets = { active: [], completedToday: [], postponed: [] };

  for (const task of tasks) {
    const it = byKey.get(task.task_key);
    if (!it) {
      buckets.active.push(task);
      continue;
    }
    if (it.status === "done") {
      if (ymd(it.completed_at) === today) buckets.completedToday.push(task);
      else buckets.active.push(task); // completada otro día → reaparece
      continue;
    }
    if (it.status === "postponed" && it.snoozed_until && today < ymd(it.snoozed_until)) {
      buckets.postponed.push(task);
      continue;
    }
    if (it.status === "cancelled" && ymd(it.due_date) === today) {
      continue; // ignorada por hoy
    }
    buckets.active.push(task);
  }

  return buckets;
}

// ─── Card unificada para la UI ────────────────────────────────────────────────

export type WorkbookCard = {
  id: string; // manual: id de DB · auto: task_key
  kind: "manual" | "auto";
  origin: WorkbookOrigin;
  moduleKey: string;
  priority: DailyTaskPriority;
  status: DailyTaskStatus;
  title: string;
  reason?: string;
  impact?: string;
  actionLabel?: string;
  actionUrl?: string;
  secondaryLabel?: string;
  dueLabel?: string;
  taskKey?: string; // solo auto
  manual?: DailyTask; // solo manual
};

export function generatedToCard(task: GeneratedTask, status: DailyTaskStatus): WorkbookCard {
  return {
    id: task.task_key,
    kind: "auto",
    origin: task.origin,
    moduleKey: task.moduleKey,
    priority: task.priority,
    status,
    title: task.title,
    reason: task.reason,
    impact: task.impact,
    actionLabel: task.actionLabel,
    actionUrl: task.actionUrl,
    secondaryLabel: task.secondaryLabel,
    dueLabel: task.dueLabel,
    taskKey: task.task_key,
  };
}

export function manualToCard(task: DailyTask): WorkbookCard {
  return {
    id: task.id,
    kind: "manual",
    origin: "manual",
    moduleKey: task.module_key,
    priority: task.priority,
    status: task.status,
    title: task.title,
    reason: task.description ?? undefined,
    actionLabel: task.action_url ? "Abrir" : undefined,
    actionUrl: task.action_url ?? undefined,
    dueLabel: task.due_date ? `Vence ${ymd(task.due_date)}` : undefined,
    manual: task,
  };
}

// ─── Orden + agrupación en secciones ──────────────────────────────────────────

export function sortWorkbookCards(cards: WorkbookCard[]): WorkbookCard[] {
  return [...cards].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const da = a.manual?.due_date ? ymd(a.manual.due_date) : "9999-99-99";
    const db = b.manual?.due_date ? ymd(b.manual.due_date) : "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const o = ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin];
    if (o !== 0) return o;
    return a.title.localeCompare(b.title, "es");
  });
}

export type WorkbookSections = {
  urgent: WorkbookCard[]; // Para resolver primero (alta)
  today: WorkbookCard[]; // También para hoy (media)
  manual: WorkbookCard[]; // Pendientes manuales (resto manual)
  completedToday: WorkbookCard[]; // Completadas hoy
  postponed: WorkbookCard[]; // Pospuestas
};

export type WorkbookCounters = {
  urgent: number;
  important: number;
  today: number;
  completed: number;
};

export type BuildWorkbookParams = {
  today: string;
  autoActive: GeneratedTask[];
  autoCompletedToday: GeneratedTask[];
  autoPostponed: GeneratedTask[];
  manualTasks: DailyTask[];
};

/** Máximo de cards en la sección "Para resolver primero". */
export const URGENT_SECTION_MAX = 5;

/**
 * Ensambla las secciones del cuaderno mezclando tareas automáticas y manuales,
 * y calcula los contadores superiores.
 */
export function buildWorkbook(params: BuildWorkbookParams): {
  sections: WorkbookSections;
  counters: WorkbookCounters;
} {
  const { today, autoActive, autoCompletedToday, autoPostponed, manualTasks } = params;

  const autoCards = autoActive.map((t) => generatedToCard(t, "pending"));

  const manualOpen = manualTasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
  const manualCards = manualOpen.map(manualToCard);

  // Crítica + alta van a "urgente"; media a "también para hoy"; el resto manual
  // (baja) a su sección. sortWorkbookCards ya ordena crítica antes que alta.
  const highCards = sortWorkbookCards(
    [...autoCards, ...manualCards].filter(
      (c) => c.priority === "critical" || c.priority === "high"
    )
  );
  const mediumCards = sortWorkbookCards(
    [...autoCards, ...manualCards].filter((c) => c.priority === "medium")
  );
  const remainingManual = sortWorkbookCards(
    manualCards.filter((c) => c.priority === "low")
  );

  const completedManual = manualTasks
    .filter((t) => t.status === "done" && ymd(t.completed_at) === today)
    .map(manualToCard);
  const completedToday = [
    ...autoCompletedToday.map((t) => generatedToCard(t, "done")),
    ...completedManual,
  ];

  const postponedManual = manualTasks
    .filter((t) => t.status === "postponed")
    .map(manualToCard);
  const postponed = [
    ...autoPostponed.map((t) => generatedToCard(t, "postponed")),
    ...postponedManual,
  ];

  const activeTotal = highCards.length + mediumCards.length + remainingManual.length;

  // Ninguna tarea alta se pierde: el excedente del tope va arriba de "También para hoy".
  const urgentOverflow = highCards.slice(URGENT_SECTION_MAX);

  return {
    sections: {
      urgent: highCards.slice(0, URGENT_SECTION_MAX),
      today: [...urgentOverflow, ...mediumCards],
      manual: remainingManual,
      completedToday,
      postponed,
    },
    counters: {
      urgent: highCards.length,
      important: mediumCards.length,
      today: activeTotal,
      completed: completedToday.length,
    },
  };
}
