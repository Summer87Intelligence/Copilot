/**
 * Agente de Cobranza — builder puro.
 * Sin LLM, sin Supabase, sin Zeta. Solo reglas determinísticas.
 * Multi-moneda: UYU y USD nunca se mezclan.
 */

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

const RECENT_DAYS = 7;

function isRecentAction(action: CollectionAction, todayYmd: string): boolean {
  const daysDiff = (Date.now() - new Date(action.createdAt).getTime()) / 86_400_000;
  if (daysDiff <= RECENT_DAYS) return true;
  if (action.nextActionDate && action.nextActionDate >= todayYmd) return true;
  if (action.status === "promised_payment" && action.promiseDate && action.promiseDate >= todayYmd) return true;
  return false;
}

function getUiOutcome(action: CollectionAction): string {
  const meta = action.metadata as Record<string, unknown> | null;
  const uiOutcome = meta?.ui_outcome;
  if (typeof uiOutcome === "string" && uiOutcome) return uiOutcome;
  return action.status;
}

function followupReason(action: CollectionAction, todayYmd: string): string {
  const outcome = getUiOutcome(action);
  switch (outcome) {
    case "contacted":
      return "Cliente ya contactado recientemente.";
    case "promised_payment":
      if (action.promiseDate) {
        const isPast = action.promiseDate < todayYmd;
        return isPast
          ? `Prometió pagar el ${fmtDate(action.promiseDate)} (sin confirmar).`
          : `Prometió pagar el ${fmtDate(action.promiseDate)}.`;
      }
      return "Promesa de pago registrada.";
    case "no_response":
      return "No respondió en la última gestión. Reintentar contacto.";
    case "wrong_contact":
      return "Contacto incorrecto. Actualizar datos del cliente.";
    case "disputed":
      return "El cliente está en disputa. Requiere atención.";
    case "needs_followup":
      return action.nextActionDate
        ? `Seguimiento pendiente: ${fmtDate(action.nextActionDate)}.`
        : "Requiere seguimiento.";
    default:
      return "Gestión registrada recientemente.";
  }
}

function fmtDate(ymd: string): string {
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return ymd;
  }
}

export function buildCollectionAgentBrief(
  notifications: CopilotNotification[],
  collectionByCompanyId?: Map<string, CollectionAction[]>
): CopilotAgentBrief {
  const priorities: CopilotAgentPriority[] = [];

  // 1. Clientes vencidos — ordenados por monto desc
  const overdueClients = notifications
    .filter((n) => n.type === "client_overdue" && !n.read_at)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  const todayYmd = new Date().toISOString().slice(0, 10);

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

    // Enrich with follow-up context if available
    let reason = n.body ?? "El cliente tiene saldo vencido pendiente de gestión.";
    let ctaLabel = companyId ? "Ver cliente" : "Ver cartera";
    let severity: CopilotAgentPriority["severity"] =
      n.severity === "critical" ? "critical" : "high";

    if (companyId && collectionByCompanyId) {
      const companyActions = collectionByCompanyId.get(companyId);
      const latestAction = companyActions?.[0];
      if (latestAction && isRecentAction(latestAction, todayYmd)) {
        reason = `${reason} ${followupReason(latestAction, todayYmd)}`;
        ctaLabel = "Ver seguimiento";
        const outcome = getUiOutcome(latestAction);
        if (outcome === "contacted" || outcome === "promised_payment") {
          if (severity === "critical") severity = "high";
          else if (severity === "high") severity = "medium";
        }
      }
    }

    priorities.push({
      id: `collection-overdue-${n.id}`,
      agentId: "collection",
      title: n.title ?? "Cliente con saldo vencido",
      reason,
      severity,
      ...amountFields,
      href,
      ctaLabel,
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
