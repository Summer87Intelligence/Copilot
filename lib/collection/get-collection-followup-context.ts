/**
 * Helper puro: interpreta la gestión de cobranza más reciente de un cliente
 * y devuelve un contexto tipado para usar en Acciones, Agentes y UI.
 *
 * Sin DB, sin Supabase, sin Zeta. Solo reglas determinísticas.
 * No oculta deuda. No marca pagos. Solo cambia tono/prioridad/copy.
 */

import type { CollectionAction } from "@/lib/copilot-collection-types";
import { formatYmd } from "./collection-date-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CollectionFollowupContext = {
  /** Outcome "contacted" registrado en los últimos 7 días — contacto real, no solo intento. */
  hasRecentContact: boolean;
  /** La última gestión tiene outcome "promised_payment". */
  hasPromiseToPay: boolean;
  /** Promesa con fecha en el pasado y aún sin confirmación de pago. */
  hasOverduePromise: boolean;
  /** Promesa con fecha en el futuro. */
  hasUpcomingPromise: boolean;
  /** nextActionDate vencido o igual a hoy. */
  hasNextFollowupDue: boolean;
  /** Label del canal de la última gestión: "email", "WhatsApp", "teléfono", etc. */
  latestActionLabel: string | null;
  /** ISO timestamp de createdAt de la última gestión. */
  latestActionDate: string | null;
  /** Días desde la última gestión (floor). null si no hay gestiones. */
  daysSinceLatest: number | null;
  /**
   * Tono recomendado para el copy:
   * - urgent: sin respuesta hace 5+ días, promesa vencida, contacto incorrecto
   * - follow_up: seguimiento vencido, sin respuesta 2-4 días
   * - monitor: promesa futura, contacto reciente válido
   * - normal: no hay señales activas
   */
  recommendedTone: "urgent" | "follow_up" | "monitor" | "normal";
  /** Frase corta explicando el tono. */
  reason: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_CONTACT_DAYS = 7;
const NO_RESPONSE_FOLLOWUP_DAYS = 2;
const NO_RESPONSE_URGENT_DAYS = 5;

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "email",
  call: "teléfono",
  meeting: "reunión",
  internal_note: "nota interna",
  payment_promise: "promesa de pago",
  dispute: "disputa",
  escalation: "escalación",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUiOutcome(action: CollectionAction): string {
  const meta = action.metadata as Record<string, unknown> | null;
  const uiOutcome = meta?.ui_outcome;
  if (typeof uiOutcome === "string" && uiOutcome) return uiOutcome;
  return action.status;
}

function channelLabel(actionType: string): string {
  return CHANNEL_LABEL[actionType] ?? actionType;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Interpreta gestiones de cobranza de UN cliente (ya filtradas por companyId)
 * y devuelve el contexto de seguimiento.
 *
 * @param actions Array de CollectionAction del cliente (cualquier orden — se ordena internamente).
 * @param now     Fecha de referencia. Por defecto new Date().
 */
export function getCollectionFollowupContext(
  actions: CollectionAction[],
  now: Date = new Date()
): CollectionFollowupContext {
  const todayYmd = now.toISOString().slice(0, 10);

  if (!actions || actions.length === 0) {
    return {
      hasRecentContact: false,
      hasPromiseToPay: false,
      hasOverduePromise: false,
      hasUpcomingPromise: false,
      hasNextFollowupDue: false,
      latestActionLabel: null,
      latestActionDate: null,
      daysSinceLatest: null,
      recommendedTone: "normal",
      reason: "Sin gestiones registradas.",
    };
  }

  // Latest action by createdAt desc
  const sorted = [...actions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0];
  const uiOutcome = getUiOutcome(latest);

  const daysSinceLatest = Math.floor(
    (now.getTime() - new Date(latest.createdAt).getTime()) / 86_400_000
  );

  const latestActionLabel = channelLabel(latest.actionType);
  const latestActionDate = latest.createdAt;

  const hasRecentContact = uiOutcome === "contacted" && daysSinceLatest <= RECENT_CONTACT_DAYS;
  const hasPromiseToPay = uiOutcome === "promised_payment";
  const hasOverduePromise =
    hasPromiseToPay && !!latest.promiseDate && latest.promiseDate < todayYmd;
  const hasUpcomingPromise =
    hasPromiseToPay && !!latest.promiseDate && latest.promiseDate >= todayYmd;
  const hasNextFollowupDue =
    !!latest.nextActionDate && latest.nextActionDate <= todayYmd;

  // ── Tone ──
  let recommendedTone: CollectionFollowupContext["recommendedTone"];
  let reason: string;

  if (hasOverduePromise) {
    recommendedTone = "urgent";
    const dateFmt = formatYmd(latest.promiseDate);
    reason = dateFmt
      ? `Promesa de pago vencida el ${dateFmt}. Reclamar urgente.`
      : "Promesa de pago vencida. Reclamar urgente.";
  } else if (hasNextFollowupDue) {
    recommendedTone = "follow_up";
    const dateFmt = formatYmd(latest.nextActionDate);
    reason = dateFmt
      ? `Seguimiento programado para ${dateFmt} está pendiente.`
      : "Seguimiento pendiente de retomar.";
  } else if (uiOutcome === "wrong_contact") {
    recommendedTone = "urgent";
    reason = "Contacto incorrecto. Actualizar datos del cliente.";
  } else if (uiOutcome === "no_response" && daysSinceLatest >= NO_RESPONSE_URGENT_DAYS) {
    recommendedTone = "urgent";
    reason = `Sin respuesta hace ${daysSinceLatest} días. Reintentar contacto.`;
  } else if (uiOutcome === "no_response" && daysSinceLatest >= NO_RESPONSE_FOLLOWUP_DAYS) {
    recommendedTone = "follow_up";
    reason = `Sin respuesta hace ${daysSinceLatest} días. Reintentar contacto.`;
  } else if (hasUpcomingPromise) {
    recommendedTone = "monitor";
    const dateFmt = formatYmd(latest.promiseDate);
    reason = dateFmt
      ? `Promesa de pago vigente hasta ${dateFmt}. Monitorear.`
      : "Promesa de pago vigente. Monitorear.";
  } else if (hasRecentContact) {
    recommendedTone = "monitor";
    reason = `Contactado por ${latestActionLabel} hace ${daysSinceLatest === 0 ? "hoy" : daysSinceLatest === 1 ? "ayer" : `${daysSinceLatest} días`}. Esperar respuesta.`;
  } else {
    recommendedTone = "normal";
    reason = "Sin señales activas de seguimiento.";
  }

  return {
    hasRecentContact,
    hasPromiseToPay,
    hasOverduePromise,
    hasUpcomingPromise,
    hasNextFollowupDue,
    latestActionLabel,
    latestActionDate,
    daysSinceLatest,
    recommendedTone,
    reason,
  };
}
