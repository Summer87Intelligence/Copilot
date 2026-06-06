/**
 * Decision Engine — Daily Operations Queue (Phase 2B).
 * Cola operacional priorizada con acciones concretas.
 * Puro: sin DB; consume bundle + ranking + estados operativos.
 */

import type {
  AgingBucket,
  DailyOperationsQueue,
  DailyOperationsQueueInput,
  DailyOperationsQueueStats,
  DECollectionAction,
  DEOperationalStateRow,
  OperationalMachineState,
  OperationalTask,
  QueueGroup,
  QueueGroupKind,
  QueueSection,
  RankedClient,
  RiskLevel,
  TaskCategory,
  TaskImpact,
  TaskPriority,
  TaskSource,
} from "@/lib/decision-engine/de-types";
import { RISK_LEVEL_SCORES } from "@/lib/decision-engine/de-types";
import { evaluateOperationalSla } from "@/lib/decision-engine/operational-sla-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const EMPTY_SECTIONS = (): Record<QueueSection, OperationalTask[]> => ({
  urgent_today:  [],
  high_impact:   [],
  this_week:     [],
  monitoring:    [],
  automated:     [],
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isoDay(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function priorityFromScore(score: number): TaskPriority {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function impactFromScore(score: number): TaskImpact {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function assignSection(score: number, category: TaskCategory, breachedSla: boolean): QueueSection {
  if (
    category === "recovery_watch" ||
    category === "payment_confirmation"
  ) {
    return "automated";
  }
  if (
    score >= 80 ||
    category === "call_today" ||
    (breachedSla && score >= 70) ||
    category === "escalation_review" && score >= 75
  ) {
    return "urgent_today";
  }
  if (score >= 60 || category === "legal_review" || category === "high_concentration") {
    return "high_impact";
  }
  if (score >= 35 || category === "promise_follow_up" || category === "stale_contact") {
    return "this_week";
  }
  if (score >= 15) return "monitoring";
  return "automated";
}

// ---------------------------------------------------------------------------
// Client context
// ---------------------------------------------------------------------------

type ClientQueueContext = {
  company_id: string;
  company_name: string;
  currency_code: string;
  pending_amount: number;
  oldest_days: number;
  concentration_pct: number;
  dominant_bucket: AgingBucket;
  risk_level: RiskLevel;
  risk_score: number;
  machine_state: OperationalMachineState;
  breached_sla: boolean;
  active_promise: boolean;
  promise_date: string | null;
  promise_due_today: boolean;
  promise_expired: boolean;
  days_since_contact: number | null;
  has_broken_promise: boolean;
  has_escalation: boolean;
  collection_status: string | null;
  instruction: RankedClient["instruction"] | null;
  next_follow_up_at: string | null;
};

function extractPromiseSignals(
  companyId: string,
  actions: DECollectionAction[],
  now: Date
): {
  promise_date: string | null;
  active_promise: boolean;
  promise_expired: boolean;
  has_broken_promise: boolean;
} {
  const companyActions = actions.filter((a) => a.company_id === companyId);
  const promise = companyActions.find(
    (a) => a.action_type === "payment_promise" && a.promise_date != null && a.status !== "paid"
  );
  const promiseDate = promise?.promise_date ?? null;
  const broken = companyActions.some(
    (a) =>
      a.action_type === "payment_promise" &&
      a.promise_date != null &&
      new Date(a.promise_date) < now &&
      a.status !== "paid"
  );
  const active = !!promiseDate && new Date(promiseDate) > now && !broken;
  const expired = !!promiseDate && new Date(promiseDate) < now && promise?.status !== "paid";

  return {
    promise_date: promiseDate,
    active_promise: active,
    promise_expired: expired,
    has_broken_promise: broken,
  };
}

function buildClientContexts(
  input: DailyOperationsQueueInput,
  now: Date
): ClientQueueContext[] {
  const { bundle, ranked } = input;
  const rankedById = new Map(ranked.map((c) => [c.company_id, c]));
  const companyMap = new Map(bundle.companies.map((c) => [c.id, c.name]));
  const stateByCustomer = new Map(bundle.operationalStates.map((s) => [s.customer_id, s]));

  const totalByCurrency: Record<string, number> = {};
  for (const inv of bundle.pendingInvoices) {
    totalByCurrency[inv.currency_code] =
      (totalByCurrency[inv.currency_code] ?? 0) + inv.balance_amount;
  }

  const summaryByCompany = new Map<
    string,
    { pending: number; currency: string; oldest: number; bucket: AgingBucket }
  >();

  for (const inv of bundle.pendingInvoices) {
    if (inv.balance_amount <= 0) continue;
    const cur = summaryByCompany.get(inv.company_id) ?? {
      pending: 0,
      currency: inv.currency_code,
      oldest: 0,
      bucket: "not_due" as AgingBucket,
    };
    cur.pending += inv.balance_amount;
    const due = inv.due_date ? new Date(inv.due_date) : null;
    const days = due && !isNaN(due.getTime()) ? Math.max(0, daysBetween(due, now)) : 0;
    if (days > cur.oldest) {
      cur.oldest = days;
      if (days <= 0) cur.bucket = "not_due";
      else if (days <= 30) cur.bucket = "0-30";
      else if (days <= 60) cur.bucket = "31-60";
      else if (days <= 90) cur.bucket = "61-90";
      else cur.bucket = "90+";
    }
    summaryByCompany.set(inv.company_id, cur);
  }

  const ids = new Set<string>([
    ...summaryByCompany.keys(),
    ...bundle.operationalStates.map((s) => s.customer_id),
    ...ranked.map((c) => c.company_id),
  ]);

  const contexts: ClientQueueContext[] = [];

  for (const companyId of ids) {
    const summary = summaryByCompany.get(companyId);
    const r = rankedById.get(companyId);
    const op: DEOperationalStateRow | undefined = stateByCustomer.get(companyId);
    const promise = extractPromiseSignals(companyId, bundle.recentActions, now);
    const today = isoDay(now);
    const promiseDueToday = promise.promise_date?.startsWith(today) ?? false;

    const pending = summary?.pending ?? r?.pending_amount ?? 0;
    if (pending <= 0 && op?.machine_state !== "recovered") continue;

    const currency = summary?.currency ?? r?.currency_code ?? "UYU";
    const totalCur = totalByCurrency[currency] ?? pending;
    const concentration = totalCur > 0 ? Math.round((pending / totalCur) * 100) : 0;

    const sla = op
      ? evaluateOperationalSla({
          machine_state: op.machine_state,
          transitioned_at: op.transitioned_at,
          current_risk: op.current_risk,
          promise_date: promise.promise_date,
          has_active_promise: promise.active_promise,
          now,
        })
      : null;

    contexts.push({
      company_id: companyId,
      company_name: r?.company_name ?? companyMap.get(companyId) ?? companyId,
      currency_code: currency,
      pending_amount: Math.round(pending * 100) / 100,
      oldest_days: summary?.oldest ?? r?.oldest_days ?? 0,
      concentration_pct: r?.concentration_pct ?? concentration,
      dominant_bucket: summary?.bucket ?? r?.dominant_bucket ?? "not_due",
      risk_level: r?.risk_assessment.level ?? op?.current_risk ?? "medium",
      risk_score: r?.risk_assessment.score ?? RISK_LEVEL_SCORES[op?.current_risk ?? "medium"],
      machine_state: op?.machine_state ?? (pending > 0 ? "new_risk" : "recovered"),
      breached_sla: op?.breached_sla ?? sla?.breached ?? false,
      active_promise: promise.active_promise || op?.active_promise === true,
      promise_date: promise.promise_date ?? r?.promise_date ?? null,
      promise_due_today: promiseDueToday,
      promise_expired: promise.promise_expired || promise.has_broken_promise,
      days_since_contact: r?.last_action_date
        ? daysBetween(new Date(r.last_action_date), now)
        : null,
      has_broken_promise: promise.has_broken_promise,
      has_escalation: op?.escalated === true || r?.collection_status === "escalated",
      collection_status: r?.collection_status ?? null,
      instruction: r?.instruction ?? null,
      next_follow_up_at: op?.next_follow_up_at ?? r?.follow_up_result.next_follow_up_at ?? null,
    });
  }

  return contexts;
}

// ---------------------------------------------------------------------------
// Priority engine
// ---------------------------------------------------------------------------

export function computeTaskPriorityScore(ctx: ClientQueueContext): number {
  let score = RISK_LEVEL_SCORES[ctx.risk_level];

  if (ctx.breached_sla) score += 30;
  if (ctx.oldest_days >= 90) score += 25;
  else if (ctx.oldest_days >= 60) score += 15;
  else if (ctx.oldest_days >= 30) score += 8;

  if (ctx.promise_expired || ctx.has_broken_promise) score += 22;
  if (ctx.promise_due_today) score += 25;

  if (ctx.days_since_contact === null && ctx.pending_amount > 0) score += 15;
  else if (ctx.days_since_contact != null && ctx.days_since_contact >= 14) score += 15;

  if (ctx.concentration_pct >= 40) score += 15;
  else if (ctx.concentration_pct >= 25) score += 8;

  score += Math.min(12, ctx.oldest_days / 5);
  score += Math.min(10, Math.log10(ctx.pending_amount + 1) * 2.5);

  if (ctx.machine_state === "critical") score += 15;
  if (ctx.machine_state === "escalated") score += 12;
  if (ctx.machine_state === "legal_review") score += 10;
  if (ctx.machine_state === "new_risk") score += 5;

  return clamp(Math.round(score), 0, 100);
}

// ---------------------------------------------------------------------------
// Task builders by category
// ---------------------------------------------------------------------------

type TaskDraft = {
  category: TaskCategory;
  source: TaskSource;
  title: string;
  action_label: string;
  reason: string;
  group_key?: string | null;
  group_label?: string | null;
  due_at?: string | null;
  priority_score?: number;
};

function makeTask(
  ctx: ClientQueueContext,
  draft: TaskDraft,
  score: number
): OperationalTask {
  const priority_score = draft.priority_score ?? score;
  const section = assignSection(priority_score, draft.category, ctx.breached_sla);
  return {
    id: `${ctx.company_id}:${draft.category}`,
    customer_id: ctx.company_id,
    company_name: ctx.company_name,
    section,
    category: draft.category,
    priority: priorityFromScore(priority_score),
    impact: impactFromScore(priority_score),
    source: draft.source,
    title: draft.title,
    action_label: draft.action_label,
    reason: draft.reason,
    priority_score,
    currency_code: ctx.currency_code,
    pending_amount: ctx.pending_amount,
    oldest_days: ctx.oldest_days,
    risk_level: ctx.risk_level,
    machine_state: ctx.machine_state,
    breached_sla: ctx.breached_sla,
    group_key: draft.group_key ?? null,
    group_label: draft.group_label ?? null,
    due_at: draft.due_at ?? null,
  };
}

function deriveTasksForClient(ctx: ClientQueueContext): OperationalTask[] {
  const score = computeTaskPriorityScore(ctx);
  const drafts: TaskDraft[] = [];

  if (ctx.machine_state === "recovered" || (ctx.pending_amount <= 0 && ctx.machine_state !== "new_risk")) {
    drafts.push({
      category: "recovery_watch",
      source: "automated",
      title: `Monitorear ${ctx.company_name}`,
      action_label: "Verificar que no reingrese deuda",
      reason: "Cliente en estado recuperado — vigilancia post-pago",
      group_key: "recovery_watch",
      group_label: "Recuperados en observación",
    });
    return drafts.map((d) => makeTask(ctx, d, Math.min(score, 30)));
  }

  if (
    ctx.instruction === "llamar_hoy" ||
    ctx.machine_state === "critical" ||
    (ctx.machine_state === "new_risk" && score >= 70)
  ) {
    drafts.push({
      category: "call_today",
      source: "risk_ranker",
      title: `Llamar a ${ctx.company_name}`,
      action_label: "Registrar llamada de cobranza",
      reason: ctx.instruction === "llamar_hoy"
        ? "Prioridad de cobranza: llamar hoy"
        : `Riesgo ${ctx.risk_level} — contacto urgente`,
      group_key: `risk_band:${ctx.risk_level}`,
      group_label: `Riesgo ${ctx.risk_level.toUpperCase()}`,
    });
  }

  if (ctx.active_promise || ctx.machine_state === "payment_promised") {
    drafts.push({
      category: "promise_follow_up",
      source: "state_machine",
      title: ctx.promise_due_today
        ? `Promesa vence hoy — ${ctx.company_name}`
        : `Seguimiento promesa — ${ctx.company_name}`,
      action_label: ctx.promise_due_today
        ? "Confirmar cumplimiento de promesa"
        : "Verificar estado de promesa de pago",
      reason: ctx.promise_expired
        ? "Promesa vencida sin confirmación de pago"
        : ctx.promise_due_today
          ? "Promesa de pago vence hoy"
          : "Promesa de pago activa",
      group_key: ctx.promise_due_today ? "promise_due:today" : null,
      group_label: ctx.promise_due_today ? "Promesas que vencen hoy" : null,
      due_at: ctx.promise_date,
      priority_score: ctx.promise_due_today ? Math.max(score, 85) : score,
    });
  }

  if (ctx.machine_state === "escalated" || ctx.machine_state === "critical" || ctx.has_escalation) {
    drafts.push({
      category: "escalation_review",
      source: "state_machine",
      title: `Revisar escalación — ${ctx.company_name}`,
      action_label: "Gestionar caso escalado",
      reason: ctx.breached_sla
        ? "Escalación con SLA incumplido"
        : "Caso en vía de escalación activa",
      group_key: `risk_band:${ctx.risk_level}`,
      group_label: `Riesgo ${ctx.risk_level.toUpperCase()}`,
      priority_score: Math.max(score, 75),
    });
  }

  if (ctx.machine_state === "legal_review") {
    drafts.push({
      category: "legal_review",
      source: "state_machine",
      title: `Revisión legal — ${ctx.company_name}`,
      action_label: "Coordinar con área legal",
      reason: "Cliente en revisión legal / disputa",
      priority_score: Math.max(score, 70),
    });
  }

  if (
    ctx.days_since_contact === null ||
    (ctx.days_since_contact >= 14 && ctx.pending_amount > 0)
  ) {
    drafts.push({
      category: "stale_contact",
      source: "sla_engine",
      title: `Reactivar contacto — ${ctx.company_name}`,
      action_label: "Establecer contacto",
      reason:
        ctx.days_since_contact === null
          ? "Sin contacto registrado con deuda activa"
          : `Sin contacto hace ${ctx.days_since_contact} días`,
      priority_score: Math.max(score, 55),
    });
  }

  if (ctx.collection_status === "paid" && ctx.pending_amount > 0) {
    drafts.push({
      category: "payment_confirmation",
      source: "automated",
      title: `Confirmar pago — ${ctx.company_name}`,
      action_label: "Verificar imputación de pago",
      reason: "Pago registrado con saldo residual pendiente",
      priority_score: Math.max(score, 45),
    });
  }

  if (ctx.concentration_pct >= 40) {
    drafts.push({
      category: "high_concentration",
      source: "portfolio",
      title: `Concentración crítica — ${ctx.company_name}`,
      action_label: "Plan de cobranza focalizado",
      reason: `Concentra ${ctx.concentration_pct}% de la cartera ${ctx.currency_code}`,
      group_key: "concentration:critical",
      group_label: "Concentración crítica de cartera",
      priority_score: Math.max(score, 65),
    });
  }

  if (ctx.breached_sla && drafts.length === 0) {
    drafts.push({
      category: "call_today",
      source: "sla_engine",
      title: `SLA incumplido — ${ctx.company_name}`,
      action_label: "Actuar hoy",
      reason: "SLA operativo excedido",
      priority_score: Math.max(score, 80),
    });
  }

  if (drafts.length === 0 && ctx.pending_amount > 0) {
    drafts.push({
      category: ctx.machine_state === "follow_up" ? "call_today" : "stale_contact",
      source: "follow_up",
      title: `Seguimiento — ${ctx.company_name}`,
      action_label: "Revisar cuenta pendiente",
      reason: "Cliente con saldo pendiente en monitoreo",
      priority_score: score,
    });
  }

  return drafts.map((d) => makeTask(ctx, d, d.priority_score ?? score));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function buildGroups(tasks: OperationalTask[]): QueueGroup[] {
  const groupMap = new Map<string, QueueGroup>();

  for (const task of tasks) {
    if (!task.group_key || !task.group_label) continue;
    let kind: QueueGroupKind = "risk_band";
    if (task.group_key.startsWith("promise_due:")) kind = "promise_due_today";
    if (task.group_key.startsWith("concentration:")) kind = "critical_concentration";

    const existing = groupMap.get(task.group_key);
    if (existing) {
      existing.task_ids.push(task.id);
    } else {
      groupMap.set(task.group_key, {
        key: task.group_key,
        label: task.group_label,
        kind,
        task_ids: [task.id],
      });
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function sortTasks(tasks: OperationalTask[]): OperationalTask[] {
  return [...tasks].sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return b.pending_amount - a.pending_amount;
  });
}

function buildStats(
  sections: Record<QueueSection, OperationalTask[]>,
  tasks: OperationalTask[]
): DailyOperationsQueueStats {
  const by_section = {} as Record<QueueSection, number>;
  for (const key of Object.keys(sections) as QueueSection[]) {
    by_section[key] = sections[key].length;
  }
  const by_category: Partial<Record<TaskCategory, number>> = {};
  for (const t of tasks) {
    by_category[t.category] = (by_category[t.category] ?? 0) + 1;
  }
  return {
    total_tasks: tasks.length,
    urgent_count: sections.urgent_today.length,
    sla_breach_count: tasks.filter((t) => t.breached_sla).length,
    promises_due_today: tasks.filter(
      (t) => t.category === "promise_follow_up" && t.group_key === "promise_due:today"
    ).length,
    by_section,
    by_category,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildDailyOperationsQueue(
  input: DailyOperationsQueueInput
): DailyOperationsQueue {
  const now = input.now ?? new Date(input.bundle.loadedAt);
  const contexts = buildClientContexts(input, now);
  const allTasks: OperationalTask[] = [];

  for (const ctx of contexts) {
    allTasks.push(...deriveTasksForClient(ctx));
  }

  const deduped = new Map<string, OperationalTask>();
  for (const task of allTasks) {
    const prev = deduped.get(task.id);
    if (!prev || task.priority_score > prev.priority_score) {
      deduped.set(task.id, task);
    }
  }

  const tasks = sortTasks(Array.from(deduped.values()));
  const sections = EMPTY_SECTIONS();
  for (const task of tasks) {
    sections[task.section].push(task);
  }
  for (const key of Object.keys(sections) as QueueSection[]) {
    sections[key] = sortTasks(sections[key]);
  }

  return {
    generated_at: now.toISOString(),
    sections,
    groups: buildGroups(tasks),
    stats: buildStats(sections, tasks),
  };
}

/** Reprioriza tareas existentes tras cambio de SLA/estado (sin regenerar categorías). */
export function reprioritizeOperationalTasks(
  tasks: OperationalTask[],
  scoreFn: (t: OperationalTask) => number = (t) => t.priority_score
): OperationalTask[] {
  return sortTasks(
    tasks.map((t) => {
      const priority_score = scoreFn(t);
      return {
        ...t,
        priority_score,
        priority: priorityFromScore(priority_score),
        impact: impactFromScore(priority_score),
        section: assignSection(priority_score, t.category, t.breached_sla),
      };
    })
  );
}
