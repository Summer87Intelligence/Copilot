/**
 * Agente de Riesgo Operativo — builder puro.
 * Sin fetch, sin Supabase, sin Zeta y sin efectos secundarios.
 *
 * Consolida señales ya existentes de caja, cobranza, datos y finanzas
 * para explicar el nivel de riesgo actual del negocio sin duplicar
 * prioridades específicas de otros agentes.
 */

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

const SEV_ORDER: Record<CopilotAgentPriority["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CATEGORY_ORDER = {
  cash: 0,
  collections: 1,
  data: 2,
  finance: 3,
} as const;

type RiskCategoryId = keyof typeof CATEGORY_ORDER;

type RiskPrioritySeed = Omit<CopilotAgentPriority, "agentId" | "amount" | "currency"> & {
  category: RiskCategoryId;
};

export type BuildRiskAgentBriefInput = {
  cfoBrief?: CopilotAgentBrief | null;
  treasuryBrief?: CopilotAgentBrief | null;
  collectionBrief?: CopilotAgentBrief | null;
  dataIntegrityBrief?: CopilotAgentBrief | null;
  notifications?: CopilotNotification[];
  now?: Date;
};

function unreadOf(
  notifications: CopilotNotification[],
  type: string
): CopilotNotification[] {
  return notifications.filter((n) => n.type === type && !n.read_at);
}

function hasPriority(
  brief: CopilotAgentBrief | null | undefined,
  predicate: (priority: CopilotAgentPriority) => boolean
): boolean {
  return (brief?.priorities ?? []).some(predicate);
}

function hasFinanzasPriority(brief: CopilotAgentBrief | null | undefined): boolean {
  return (brief?.priorities ?? []).some(
    (priority) =>
      priority.href === "/copilot/finanzas" ||
      priority.id === "cfo-liquidity-critical" ||
      priority.id === "cfo-liquidity-high" ||
      priority.id === "cfo-data-partial"
  );
}

function cashPriority(
  treasuryBrief: CopilotAgentBrief | null | undefined,
  cfoBrief: CopilotAgentBrief | null | undefined,
  notifications: CopilotNotification[]
): RiskPrioritySeed | null {
  const overduePayments =
    hasPriority(treasuryBrief, (p) => p.id === "treasury-overdue") ||
    unreadOf(notifications, "treasury_payment_overdue").length > 0;
  const cashRisk =
    hasPriority(treasuryBrief, (p) => p.id === "treasury-cash-risk") ||
    unreadOf(notifications, "cash_risk_detected").length > 0 ||
    hasPriority(cfoBrief, (p) => p.id === "cfo-liquidity-critical" || p.id === "cfo-cash-risk");
  const dueToday = hasPriority(treasuryBrief, (p) => p.id === "treasury-due-today");
  const dueNear = hasPriority(
    treasuryBrief,
    (p) => p.id === "treasury-due-near" || p.id === "treasury-due-week"
  );
  const cfoPaymentPressure = hasPriority(cfoBrief, (p) => p.id === "cfo-egresos");

  if (overduePayments || cashRisk) {
    return {
      category: "cash",
      id: "risk-cash",
      title: "Revisar riesgo de caja",
      reason: "Hay pagos vencidos o caja ajustada.",
      severity: "critical",
      href: "/copilot/tesoreria",
      ctaLabel: "Ver Tesorería",
    };
  }

  if (
    treasuryBrief?.status === "attention" ||
    dueToday ||
    dueNear ||
    cfoPaymentPressure ||
    unreadOf(notifications, "treasury_payment_due").length > 0
  ) {
    return {
      category: "cash",
      id: "risk-cash",
      title: "Revisar caja",
      reason: dueToday
        ? "Hay pagos importantes para revisar hoy."
        : "Hay señales de caja y pagos para revisar.",
      severity: "high",
      href: "/copilot/tesoreria",
      ctaLabel: "Ver Tesorería",
    };
  }

  return null;
}

function collectionsPriority(
  collectionBrief: CopilotAgentBrief | null | undefined,
  notifications: CopilotNotification[]
): RiskPrioritySeed | null {
  const promiseOverdue = hasPriority(collectionBrief, (p) =>
    p.id.startsWith("followup-promise-overdue")
  );
  const followupOverdue = hasPriority(collectionBrief, (p) =>
    p.id.startsWith("followup-overdue")
  );
  const overdueClients =
    hasPriority(
      collectionBrief,
      (p) => p.id.startsWith("collection-overdue-") || p.id === "collection-portfolio"
    ) || unreadOf(notifications, "client_overdue").length > 0;

  if (promiseOverdue || collectionBrief?.status === "critical") {
    return {
      category: "collections",
      id: "risk-collections",
      title: "Retomar cobranza crítica",
      reason: promiseOverdue
        ? "Hay promesas de pago vencidas o deuda crítica para revisar."
        : "Hay clientes con deuda vencida que requieren atención urgente.",
      severity: "critical",
      href: "/copilot/cartera",
      ctaLabel: "Ver Cartera",
    };
  }

  if (collectionBrief?.status === "attention" || followupOverdue || overdueClients) {
    return {
      category: "collections",
      id: "risk-collections",
      title: "Revisar cobranza",
      reason: followupOverdue
        ? "Hay seguimientos de cobranza pendientes de retomar."
        : "Hay clientes con deuda vencida que requieren atención.",
      severity: "high",
      href: "/copilot/cartera",
      ctaLabel: "Ver Cartera",
    };
  }

  return null;
}

function dataPriority(
  dataIntegrityBrief: CopilotAgentBrief | null | undefined,
  notifications: CopilotNotification[]
): RiskPrioritySeed | null {
  const syncFailed = unreadOf(notifications, "sync_failed");
  const hasCriticalSync = syncFailed.some((notification) => notification.severity === "critical");

  if (dataIntegrityBrief?.status === "critical" || hasCriticalSync) {
    return {
      category: "data",
      id: "risk-data",
      title: "Validar datos antes de decidir",
      reason: "Hay señales de actualización de datos para revisar antes de decidir.",
      severity: "critical",
      href: "/copilot/alertas",
      ctaLabel: "Ver alertas",
    };
  }

  if (dataIntegrityBrief?.status === "attention" || syncFailed.length > 0) {
    return {
      category: "data",
      id: "risk-data",
      title: "Validar datos antes de decidir",
      reason: "Hay señales de datos que conviene revisar antes de actuar.",
      severity: "high",
      href: "/copilot/alertas",
      ctaLabel: "Ver alertas",
    };
  }

  return null;
}

function financePriority(
  cfoBrief: CopilotAgentBrief | null | undefined
): RiskPrioritySeed | null {
  if (!hasFinanzasPriority(cfoBrief)) return null;

  if (
    cfoBrief?.status === "critical" ||
    hasPriority(cfoBrief, (p) => p.id === "cfo-liquidity-critical")
  ) {
    return {
      category: "finance",
      id: "risk-finance",
      title: "Revisar lectura financiera",
      reason: "Hay señales financieras que requieren monitoreo inmediato.",
      severity: "critical",
      href: "/copilot/finanzas",
      ctaLabel: "Ver Finanzas",
    };
  }

  if (
    cfoBrief?.status === "attention" ||
    hasPriority(cfoBrief, (p) => p.id === "cfo-liquidity-high" || p.id === "cfo-data-partial")
  ) {
    return {
      category: "finance",
      id: "risk-finance",
      title: "Revisar lectura financiera",
      reason: "Hay señales financieras que conviene revisar.",
      severity: "high",
      href: "/copilot/finanzas",
      ctaLabel: "Ver Finanzas",
    };
  }

  return null;
}

function sortRiskPriorities(
  priorities: RiskPrioritySeed[]
): CopilotAgentPriority[] {
  return [...priorities]
    .sort((a, b) => {
      const severityDiff = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    })
    .map(({ category: _category, ...priority }) => ({
      ...priority,
      agentId: "risk" as const,
    }));
}

function buildRiskSummary(
  status: CopilotAgentBrief["status"]
): string {
  if (status === "critical") {
    return "El riesgo operativo requiere revisión inmediata. Hay señales críticas que pueden afectar decisiones.";
  }
  if (status === "attention") {
    return "El riesgo operativo requiere atención. Hay señales de cobranza, pagos o datos para revisar.";
  }
  return "El riesgo operativo se ve bajo. No hay señales críticas de caja, cobranza o datos.";
}

export function buildRiskAgentBrief(
  input: BuildRiskAgentBriefInput = {}
): CopilotAgentBrief {
  const notifications = input.notifications ?? [];

  const seeds = [
    cashPriority(input.treasuryBrief, input.cfoBrief, notifications),
    collectionsPriority(input.collectionBrief, notifications),
    dataPriority(input.dataIntegrityBrief, notifications),
    financePriority(input.cfoBrief),
  ].filter((priority): priority is RiskPrioritySeed => priority != null);

  const priorities = sortRiskPriorities(seeds).slice(0, 5);

  const hasCritical = priorities.some((priority) => priority.severity === "critical");
  const status: CopilotAgentBrief["status"] = hasCritical
    ? "critical"
    : priorities.length > 0
    ? "attention"
    : "stable";

  return {
    agentId: "risk",
    title: "Riesgo",
    status,
    summary: buildRiskSummary(status),
    priorities,
    nextBestAction:
      priorities[0] != null
        ? { label: priorities[0].ctaLabel, href: priorities[0].href }
        : { label: "Ver Finanzas", href: "/copilot/finanzas" },
  };
}
