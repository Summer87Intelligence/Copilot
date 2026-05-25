/**
 * Enriquece CopilotAction[] con contexto de gestiones de cobranza registradas.
 * Función pura — sin DB, sin efectos secundarios.
 *
 * Si no hay gestiones disponibles, devuelve el array original sin cambios.
 * Si la gestión más reciente es "reciente" (< 7 días o con follow-up/promesa futuro),
 * ajusta prioridad, reason y primaryActionLabel de las acciones de cobranza.
 */

import type {
  CopilotAction,
  CopilotActionCollectionContext,
  CopilotActionPriority,
} from "./build-actions";
import type { CollectionAction } from "@/lib/copilot-collection-types";

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_DAYS = 7;

const STATUS_LABEL_MAP: Record<string, string> = {
  contacted: "En seguimiento",
  promised_payment: "Promesa de pago",
  no_response: "Reintentar contacto",
  wrong_contact: "Actualizar contacto",
  disputed: "En disputa",
  needs_followup: "Seguimiento pendiente",
  paused: "Reintentar contacto",
  pending_review: "Seguimiento pendiente",
  escalated: "Escalado",
  paid: "Gestionado",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUiOutcome(action: CollectionAction): string {
  const meta = action.metadata as Record<string, unknown> | null;
  const uiOutcome = meta?.ui_outcome;
  if (typeof uiOutcome === "string" && uiOutcome) return uiOutcome;
  return action.status;
}

function isRecentCollectionAction(action: CollectionAction, todayYmd: string): boolean {
  const created = new Date(action.createdAt);
  const now = new Date();
  const daysDiff = (now.getTime() - created.getTime()) / 86_400_000;
  if (daysDiff <= RECENT_DAYS) return true;
  if (action.nextActionDate && action.nextActionDate >= todayYmd) return true;
  if (action.status === "promised_payment" && action.promiseDate && action.promiseDate >= todayYmd) return true;
  return false;
}

function getStatusLabel(uiOutcome: string): string {
  return STATUS_LABEL_MAP[uiOutcome] ?? "En seguimiento";
}

function computeAdjustedPriority(
  original: CopilotActionPriority,
  uiOutcome: string,
  action: CollectionAction,
  todayYmd: string
): CopilotActionPriority {
  switch (uiOutcome) {
    case "contacted":
      if (original === "critical") return "high";
      if (original === "high") return "medium";
      return original;

    case "promised_payment": {
      const promiseFuture = action.promiseDate ? action.promiseDate >= todayYmd : false;
      if (promiseFuture) {
        if (original === "critical") return "high";
        if (original === "high") return "medium";
      }
      return original;
    }

    case "needs_followup":
      if (action.nextActionDate && action.nextActionDate > todayYmd) {
        if (original === "high") return "medium";
      }
      return original;

    default:
      return original;
  }
}

function formatDateShort(ymd: string): string {
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return ymd;
  }
}

function buildEnrichedReason(
  original: string,
  uiOutcome: string,
  ctx: CopilotActionCollectionContext,
  todayYmd: string
): string {
  switch (uiOutcome) {
    case "contacted":
      return `${original} Cliente contactado recientemente.`;
    case "promised_payment":
      if (ctx.promiseDate) {
        const isPast = ctx.promiseDate < todayYmd;
        const label = formatDateShort(ctx.promiseDate);
        return isPast
          ? `${original} Prometió pagar el ${label} (vencida sin confirmar).`
          : `${original} Prometió pagar el ${label}.`;
      }
      return `${original} Prometió pagar.`;
    case "no_response":
      return `${original} No respondió en la última gestión.`;
    case "wrong_contact":
      return `${original} El contacto registrado puede estar desactualizado.`;
    case "disputed":
      return `${original} El cliente está cuestionando la deuda.`;
    case "needs_followup":
      return ctx.nextFollowUpAt
        ? `${original} Seguimiento pendiente: ${formatDateShort(ctx.nextFollowUpAt)}.`
        : `${original} Seguimiento pendiente.`;
    default:
      return original;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Enriquece las acciones de cobranza con contexto de gestiones registradas.
 * Las acciones de tesorería y sistema no se modifican.
 * Si no hay gestiones o la última no es reciente, la acción queda igual.
 */
export function enrichActionsWithCollectionFollowups(
  actions: CopilotAction[],
  collectionByCompanyId: Map<string, CollectionAction[]>
): CopilotAction[] {
  if (collectionByCompanyId.size === 0) return actions;

  const todayYmd = new Date().toISOString().slice(0, 10);

  return actions.map((action) => {
    if (action.type !== "collection") return action;
    if (!action.entityId) return action;

    const companyActions = collectionByCompanyId.get(action.entityId);
    if (!companyActions || companyActions.length === 0) return action;

    const latest = companyActions[0]; // sorted desc by created_at
    if (!isRecentCollectionAction(latest, todayYmd)) return action;

    const uiOutcome = getUiOutcome(latest);
    const statusLabel = getStatusLabel(uiOutcome);

    const ctx: CopilotActionCollectionContext = {
      latestOutcome: uiOutcome,
      latestChannel: latest.actionType,
      latestDateIso: latest.createdAt,
      nextFollowUpAt: latest.nextActionDate,
      promiseDate: latest.promiseDate,
      promiseAmount: latest.promiseAmount,
      promiseCurrency: latest.promiseCurrency,
      isRecent: true,
      statusLabel,
    };

    return {
      ...action,
      priority: computeAdjustedPriority(action.priority, uiOutcome, latest, todayYmd),
      reason: buildEnrichedReason(action.reason, uiOutcome, ctx, todayYmd),
      primaryActionLabel: "Ver seguimiento",
      collectionContext: ctx,
    };
  });
}

/**
 * Agrupa un array de CollectionAction por companyId.
 * Preserva el orden original (desc por created_at si el array ya está ordenado).
 */
export function groupCollectionActionsByCompany(
  actions: CollectionAction[]
): Map<string, CollectionAction[]> {
  const map = new Map<string, CollectionAction[]>();
  for (const a of actions) {
    const list = map.get(a.companyId) ?? [];
    list.push(a);
    map.set(a.companyId, list);
  }
  return map;
}
