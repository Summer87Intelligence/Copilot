/**
 * Agente de Cobranza — builder puro.
 * Sin LLM, sin Supabase, sin Zeta. Solo reglas determinísticas.
 * Multi-moneda: UYU y USD nunca se mezclan.
 */

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

export function buildCollectionAgentBrief(
  notifications: CopilotNotification[]
): CopilotAgentBrief {
  const priorities: CopilotAgentPriority[] = [];

  // 1. Clientes vencidos — ordenados por monto desc
  const overdueClients = notifications
    .filter((n) => n.type === "client_overdue" && !n.read_at)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  for (const n of overdueClients.slice(0, 3)) {
    const companyId =
      n.entity_id ??
      (n.metadata?.company_id as string | undefined) ??
      null;
    const href = companyId
      ? `/copilot/clientes/${encodeURIComponent(companyId)}`
      : "/copilot/cartera";
    const amountFields =
      n.amount != null && n.currency
        ? { amount: n.amount, currency: n.currency as "UYU" | "USD" }
        : {};
    priorities.push({
      id: `collection-overdue-${n.id}`,
      agentId: "collection",
      title: n.title ?? "Cliente con saldo vencido",
      reason: n.body ?? "El cliente tiene saldo vencido pendiente de gestión.",
      severity: n.severity === "critical" ? "critical" : "high",
      ...amountFields,
      href,
      ctaLabel: companyId ? "Ver cliente" : "Ver cartera",
    });
  }

  // 2. Cartera vencida — resumen si hay más de 3 clientes
  if (overdueClients.length > 3) {
    priorities.push({
      id: "collection-portfolio",
      agentId: "collection",
      title: "Revisar cartera vencida",
      reason: `Hay ${overdueClients.length} clientes con saldos vencidos en total.`,
      severity: "medium",
      href: "/copilot/cartera",
      ctaLabel: "Ver cartera",
    });
  }

  // 3. Nuevos deudores
  const newDebtors = notifications.filter(
    (n) => n.type === "new_debtor" && !n.read_at
  );
  if (newDebtors.length > 0 && priorities.length < 5) {
    const count = newDebtors.length;
    priorities.push({
      id: "collection-new-debtors",
      agentId: "collection",
      title: "Nuevos clientes con deuda",
      reason: `${count} cliente${count > 1 ? "s" : ""} ${count > 1 ? "pasaron" : "pasó"} a tener saldo pendiente.`,
      severity: "medium",
      href: "/copilot/clientes",
      ctaLabel: "Ver clientes",
    });
  }

  const hasCritical = priorities.some((p) => p.severity === "critical");
  const hasHigh = priorities.some((p) => p.severity === "high");
  const status: CopilotAgentBrief["status"] =
    hasCritical
      ? "critical"
      : hasHigh || overdueClients.length > 0
      ? "attention"
      : "stable";

  const topPriorities = priorities.slice(0, 5);

  return {
    agentId: "collection",
    title: "Cobranza",
    status,
    summary: buildCollectionSummary(status, overdueClients.length, newDebtors.length),
    priorities: topPriorities,
    nextBestAction:
      topPriorities.length > 0
        ? { label: topPriorities[0].ctaLabel, href: topPriorities[0].href }
        : { label: "Ver cartera", href: "/copilot/cartera" },
  };
}

function buildCollectionSummary(
  status: CopilotAgentBrief["status"],
  overdueCount: number,
  newDebtorCount: number
): string {
  if (status === "critical") {
    return "Hay clientes con saldo crítico vencido que requieren gestión urgente.";
  }
  if (status === "attention") {
    if (overdueCount > 0 && newDebtorCount > 0) {
      return `${overdueCount} cliente${overdueCount > 1 ? "s" : ""} vencido${overdueCount > 1 ? "s" : ""} y ${newDebtorCount} nuevo${newDebtorCount > 1 ? "s" : ""} con deuda.`;
    }
    if (overdueCount > 0) {
      return `${overdueCount} cliente${overdueCount > 1 ? "s con saldos vencidos" : " con saldo vencido"} para gestionar.`;
    }
    return `${newDebtorCount} cliente${newDebtorCount > 1 ? "s" : ""} nuevo${newDebtorCount > 1 ? "s" : ""} con deuda pendiente.`;
  }
  return "La cartera está en orden. No hay clientes vencidos urgentes.";
}
