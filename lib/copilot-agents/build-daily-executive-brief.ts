/**
 * Builder puro para el Agente Ejecutivo Diario.
 * Sin LLM, sin Supabase, sin Zeta. Solo reglas determinísticas.
 * Multi-moneda: UYU y USD nunca se mezclan.
 */

import type { ExecutiveBriefing } from "@/lib/copilot-executive-briefing-types";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentSeverity = "critical" | "high" | "medium" | "low";

export type AgentPriority = {
  id: string;
  title: string;
  reason: string;
  severity: AgentSeverity;
  amount?: number;
  currency?: "UYU" | "USD";
  href: string;
  ctaLabel: string;
};

export type DailyExecutiveBrief = {
  status: "stable" | "attention" | "critical";
  summary: string;
  priorities: AgentPriority[];
  changes: string[];
  nextBestAction: {
    label: string;
    href: string;
  };
  generatedAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unreadOf(
  notifications: CopilotNotification[],
  type: string
): CopilotNotification[] {
  return notifications.filter((n) => n.type === type && !n.read_at);
}

function firstAmountByCurrency(
  notifications: CopilotNotification[],
  type: string,
  currency: string
): number | undefined {
  const match = notifications.find(
    (n) => n.type === type && n.currency === currency && n.amount != null
  );
  return match?.amount ?? undefined;
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? `un ${singular}` : `${n} ${plural}`;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildDailyExecutiveBrief(
  briefing: ExecutiveBriefing | null,
  notifications: CopilotNotification[]
): DailyExecutiveBrief {
  const priorities: AgentPriority[] = [];

  // 1. Operational critical — sync failure
  const syncFailed = unreadOf(notifications, "sync_failed");
  if (syncFailed.length > 0 || briefing?.status === "critical") {
    priorities.push({
      id: "op-critical",
      title: "Revisar estado operacional",
      reason:
        syncFailed.length > 0
          ? "Hay un problema con la sincronización de datos. Puede afectar la información que ves."
          : briefing?.headline ?? "Hay señales críticas en la operación que requieren atención.",
      severity: "critical",
      href: "/copilot/operacional",
      ctaLabel: "Ver operacional",
    });
  }

  // 2. Cash risk
  const cashRisk = unreadOf(notifications, "cash_risk_detected");
  if (cashRisk.length > 0) {
    const amountUYU = firstAmountByCurrency(notifications, "cash_risk_detected", "UYU");
    const amountUSD = firstAmountByCurrency(notifications, "cash_risk_detected", "USD");
    const amountEntry =
      amountUYU != null
        ? { amount: amountUYU, currency: "UYU" as const }
        : amountUSD != null
        ? { amount: amountUSD, currency: "USD" as const }
        : {};
    priorities.push({
      id: "cash-risk",
      title: "Riesgo de caja detectado",
      reason:
        cashRisk[0].body ??
        "Los egresos próximos pueden superar la caja disponible.",
      severity: "critical",
      ...amountEntry,
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  // 3. Clients overdue
  const overdueClients = unreadOf(notifications, "client_overdue");
  if (overdueClients.length > 0) {
    priorities.push({
      id: "clients-overdue",
      title: "Clientes con vencimiento",
      reason: `Hay ${plural(overdueClients.length, "cliente", "clientes")} con saldo vencido sin atender.`,
      severity: "high",
      href: "/copilot/cartera",
      ctaLabel: "Ver cartera",
    });
  }

  // 4. Treasury payment overdue
  const paymentOverdue = unreadOf(notifications, "treasury_payment_overdue");
  if (paymentOverdue.length > 0) {
    const amt = paymentOverdue[0].amount ?? undefined;
    const cur = (paymentOverdue[0].currency as "UYU" | "USD") ?? undefined;
    priorities.push({
      id: "payment-overdue",
      title: "Pagos vencidos sin registrar",
      reason: `Hay ${plural(paymentOverdue.length, "pago vencido", "pagos vencidos")} que necesita${paymentOverdue.length !== 1 ? "n" : ""} revisión.`,
      severity: "high",
      ...(amt != null ? { amount: amt, currency: cur } : {}),
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  // 5. Treasury payment due (upcoming)
  const paymentDue = unreadOf(notifications, "treasury_payment_due");
  if (paymentDue.length > 0) {
    const critical = paymentDue.filter((n) => n.severity === "critical");
    const target = critical.length > 0 ? critical : paymentDue;
    const amt = target[0].amount ?? undefined;
    const cur = (target[0].currency as "UYU" | "USD") ?? undefined;
    priorities.push({
      id: "payment-due",
      title: "Revisar pagos próximos",
      reason: "Hay compromisos de pago próximos a vencer.",
      severity: critical.length > 0 ? "high" : "medium",
      ...(amt != null ? { amount: amt, currency: cur } : {}),
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  // 6. New debtors
  const newDebtors = unreadOf(notifications, "new_debtor");
  if (newDebtors.length > 0) {
    priorities.push({
      id: "new-debtors",
      title: "Nuevos clientes con deuda",
      reason: `${plural(newDebtors.length, "cliente nuevo pasó", "clientes nuevos pasaron")} a tener saldo pendiente.`,
      severity: "medium",
      href: "/copilot/clientes",
      ctaLabel: "Ver clientes",
    });
  }

  // 7. Briefing warning (no other op signal captured yet)
  if (
    briefing?.status === "warning" &&
    !priorities.some((p) => p.id === "op-critical")
  ) {
    priorities.push({
      id: "briefing-warning",
      title: "Hay señales para revisar",
      reason:
        briefing.headline ?? "El estado operacional requiere seguimiento.",
      severity: "medium",
      href: "/copilot/acciones",
      ctaLabel: "Ver acciones",
    });
  }

  // 8. Sync changes (data update, low priority filler)
  const syncChanges = unreadOf(notifications, "sync_changes_detected");
  if (syncChanges.length > 0 && priorities.length < 5) {
    priorities.push({
      id: "sync-changes",
      title: "Datos actualizados",
      reason:
        "Hay nueva información sincronizada. Conviene revisar el estado actual.",
      severity: "low",
      href: "/copilot/hoy",
      ctaLabel: "Ver hoy",
    });
  }

  const topPriorities = priorities.slice(0, 5);

  const hasCritical = topPriorities.some((p) => p.severity === "critical");
  const hasHigh = topPriorities.some((p) => p.severity === "high");
  const status: DailyExecutiveBrief["status"] = hasCritical
    ? "critical"
    : hasHigh || briefing?.status === "warning"
    ? "attention"
    : "stable";

  return {
    status,
    summary: buildSummary(status, topPriorities),
    priorities: topPriorities,
    changes: buildChanges(notifications, briefing),
    nextBestAction: buildNextBestAction(topPriorities, status),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildSummary(
  status: DailyExecutiveBrief["status"],
  priorities: AgentPriority[]
): string {
  if (status === "critical") {
    return "Tu negocio tiene situaciones críticas que requieren atención hoy. Revisá las prioridades a continuación.";
  }
  if (status === "attention") {
    const hasDebt = priorities.some(
      (p) => p.id === "clients-overdue" || p.id === "new-debtors"
    );
    const hasTreasury = priorities.some((p) => p.id.startsWith("payment"));
    if (hasDebt && hasTreasury) {
      return "Tu negocio está en atención: hay clientes con atraso y compromisos de pago que revisar.";
    }
    if (hasDebt) {
      return "Tu negocio está en atención por clientes con saldo vencido pendiente de gestión.";
    }
    if (hasTreasury) {
      return "Tu negocio está en atención por compromisos de pago próximos o vencidos.";
    }
    return "Tu negocio está en atención con señales operativas para revisar.";
  }
  if (priorities.length === 0) {
    return "Todo en orden. No hay prioridades urgentes por el momento.";
  }
  return "Tu operación está estable. Podés revisar el resumen para mantenerte al día.";
}

function buildChanges(
  notifications: CopilotNotification[],
  briefing: ExecutiveBriefing | null
): string[] {
  const changes: string[] = [];

  const recentUnread = notifications.filter((n) => !n.read_at).slice(0, 4);
  for (const n of recentUnread) {
    if (n.type === "collection_received") {
      changes.push(n.title ?? "Se registró un cobro reciente.");
    } else if (n.type === "sync_changes_detected") {
      changes.push("Los datos del sistema se actualizaron.");
    } else if (n.type === "new_debtor") {
      changes.push(n.title ?? "Un cliente tiene nuevo saldo pendiente.");
    } else if (n.type === "client_overdue") {
      changes.push(n.title ?? "Un cliente pasó a vencido.");
    }
  }

  if (briefing?.resolvedRecently && briefing.resolvedRecently.length > 0) {
    for (const r of briefing.resolvedRecently.slice(0, 2)) {
      if (!changes.includes(r)) changes.push(r);
    }
  }

  return changes.length > 0
    ? changes.slice(0, 4)
    : ["Sin cambios relevantes detectados."];
}

function buildNextBestAction(
  priorities: AgentPriority[],
  status: DailyExecutiveBrief["status"]
): DailyExecutiveBrief["nextBestAction"] {
  if (status === "critical") {
    const op = priorities.find((p) => p.id === "op-critical");
    if (op) return { label: "Revisar estado operacional", href: op.href };
    const cash = priorities.find((p) => p.id === "cash-risk");
    if (cash) return { label: "Ver pagos", href: cash.href };
  }
  const first = priorities[0];
  if (first) return { label: first.ctaLabel, href: first.href };
  return { label: "Empezar por Acciones", href: "/copilot/acciones" };
}
