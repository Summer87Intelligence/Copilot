/**
 * Detecta prioridades de seguimiento de cobranza a partir de gestiones registradas.
 * Sin LLM, sin Supabase, sin Zeta. Solo reglas determinísticas sobre CollectionAction[].
 *
 * Detecta (en orden de prioridad):
 * A) Próximo seguimiento vencido   → severity: high
 * B) Promesa de pago vencida       → severity: critical
 * C) Promesa de pago futura        → severity: low
 * D) Sin respuesta >= 2 días       → severity: medium (>= 5 días: high)
 * E) Contacto incorrecto           → severity: high
 *
 * Una sola prioridad por cliente. Dentro de cada cliente, el primer match gana.
 */

import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { CopilotAgentPriority } from "./types";
import { formatYmd as _fmtYmd } from "@/lib/collection/collection-date-helpers";

// ─── Constants ────────────────────────────────────────────────────────────────

const NO_RESPONSE_RETRY_DAYS = 2;
const NO_RESPONSE_HIGH_DAYS = 5;

export const SEV_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUiOutcome(action: CollectionAction): string {
  const meta = action.metadata as Record<string, unknown> | null;
  const uiOutcome = meta?.ui_outcome;
  if (typeof uiOutcome === "string" && uiOutcome) return uiOutcome;
  return action.status;
}

function fmtDate(ymd: string | null | undefined): string {
  return _fmtYmd(ymd) ?? (ymd ? ymd.slice(0, 10) : "—");
}

function daysAgo(createdAtIso: string, todayYmd: string): number {
  const todayMs = new Date(todayYmd + "T00:00:00").getTime();
  return Math.floor((todayMs - new Date(createdAtIso).getTime()) / 86_400_000);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Retorna hasta una prioridad de seguimiento por empresa, ordenadas por severidad.
 * Solo considera acciones activas (isActive = true).
 * Para cada empresa, toma la acción más reciente como fuente de verdad.
 */
export function buildCollectionFollowupPriorities(
  allActions: CollectionAction[],
  nameByCompanyId: Map<string, string>,
  todayYmd: string
): CopilotAgentPriority[] {
  // Una acción por empresa: la más reciente (createdAt desc)
  const latestByCompany = new Map<string, CollectionAction>();
  for (const action of allActions) {
    if (!action.isActive) continue;
    const existing = latestByCompany.get(action.companyId);
    if (!existing || action.createdAt > existing.createdAt) {
      latestByCompany.set(action.companyId, action);
    }
  }

  const result: CopilotAgentPriority[] = [];

  for (const [companyId, action] of latestByCompany) {
    const uiOutcome = getUiOutcome(action);
    const clientName = nameByCompanyId.get(companyId) ?? null;
    const href = `/copilot/clientes/${encodeURIComponent(companyId)}`;

    // A) Próximo seguimiento vencido o igual a hoy
    if (action.nextActionDate && action.nextActionDate <= todayYmd) {
      const isToday = action.nextActionDate === todayYmd;
      result.push({
        id: `followup-overdue-${companyId}`,
        agentId: "collection",
        title: isToday
          ? (clientName ? `Hacer seguimiento hoy — ${clientName}` : "Hacer seguimiento hoy")
          : (clientName ? `Retomar seguimiento de ${clientName}` : "Retomar seguimiento pendiente"),
        reason: isToday
          ? "Tiene seguimiento programado para hoy."
          : `Seguimiento programado para ${fmtDate(action.nextActionDate)} (vencido).`,
        severity: "high",
        href,
        ctaLabel: "Ver cliente",
      });
      continue;
    }

    // B) Promesa de pago vencida
    if (
      uiOutcome === "promised_payment" &&
      action.promiseDate &&
      action.promiseDate < todayYmd
    ) {
      result.push({
        id: `followup-promise-overdue-${companyId}`,
        agentId: "collection",
        title: "Revisar promesa de pago vencida",
        reason: clientName
          ? `${clientName} prometió pagar el ${fmtDate(action.promiseDate)} y todavía figura con deuda.`
          : `El cliente prometió pagar el ${fmtDate(action.promiseDate)} y todavía figura con deuda.`,
        severity: "critical",
        href,
        ctaLabel: "Ver cliente",
      });
      continue;
    }

    // C) Promesa de pago futura
    if (
      uiOutcome === "promised_payment" &&
      action.promiseDate &&
      action.promiseDate >= todayYmd
    ) {
      result.push({
        id: `followup-promise-future-${companyId}`,
        agentId: "collection",
        title: "Esperar promesa de pago",
        reason: `El cliente prometió pagar el ${fmtDate(action.promiseDate)}.`,
        severity: "low",
        href,
        ctaLabel: "Ver seguimiento",
      });
      continue;
    }

    // D) Sin respuesta — reintentar luego de 2 días
    if (uiOutcome === "no_response") {
      const days = daysAgo(action.createdAt, todayYmd);
      if (days >= NO_RESPONSE_RETRY_DAYS) {
        result.push({
          id: `followup-no-response-${companyId}`,
          agentId: "collection",
          title: "Reintentar contacto",
          reason: "No respondió en la última gestión.",
          severity: days >= NO_RESPONSE_HIGH_DAYS ? "high" : "medium",
          href,
          ctaLabel: "Ver cliente",
        });
        continue;
      }
    }

    // E) Contacto incorrecto
    if (uiOutcome === "wrong_contact") {
      result.push({
        id: `followup-wrong-contact-${companyId}`,
        agentId: "collection",
        title: "Actualizar contacto del cliente",
        reason: clientName
          ? `La última gestión de ${clientName} indica que el contacto es incorrecto.`
          : "La última gestión indica que el contacto es incorrecto.",
        severity: "high",
        href,
        ctaLabel: "Ver cliente",
      });
      continue;
    }
  }

  return result.sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4)
  );
}
