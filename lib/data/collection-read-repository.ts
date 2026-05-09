/**
 * Lógica pura de derivación para Collection Operations.
 * Sin DB, sin side effects. Testeable en forma aislada.
 * No recalcula deuda financiera — opera sobre CollectionAction[] solamente.
 */

import {
  type CollectionAction,
  type CollectionPriority,
  type CollectionStatus,
  type ClientCollectionSummary,
  type ClientCollectionTimeline,
  COLLECTION_PRIORITIES,
} from "@/lib/copilot-collection-types";

// ---------------------------------------------------------------------------
// Constantes de negocio
// ---------------------------------------------------------------------------

/** Días sin contacto para marcar cliente como stale en cobranza. */
const STALE_CONTACT_DAYS = 30;

/** Valor numérico de prioridad para comparación (mayor = más urgente). */
const PRIORITY_SCORE: Record<CollectionPriority, number> = {
  urgent: 4,
  high:   3,
  medium: 2,
  low:    1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(isoDate: string, now: Date): number {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return Infinity;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function isOverduePromise(action: CollectionAction, now: Date): boolean {
  if (!action.promiseDate) return false;
  if (action.status === "paid") return false;
  return daysSince(action.promiseDate, now) > 0;
}

function latestContactDate(actions: CollectionAction[]): string | null {
  const dated = actions
    .filter((a) => a.contactDate != null)
    .sort((a, b) =>
      new Date(b.contactDate!).getTime() - new Date(a.contactDate!).getTime()
    );
  return dated[0]?.contactDate ?? null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Deriva el resumen operativo de cobranza de un cliente a partir de sus acciones.
 * Solo acciones activas (isActive = true) y post-2026.
 */
export function deriveClientCollectionSummary(
  companyId: string,
  actions: CollectionAction[],
  now: Date = new Date()
): ClientCollectionSummary {
  const active = actions.filter(
    (a) =>
      a.isActive &&
      a.createdAt >= "2026-01-01"
  );

  if (active.length === 0) {
    return {
      companyId,
      latestAction: null,
      collectionStatus: "no_action",
      priority: null,
      nextActionDate: null,
      lastContactDate: null,
      hasOverduePromise: false,
      isStale: false,
    };
  }

  // Ordenar por created_at desc para obtener la más reciente
  const sorted = [...active].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latest = sorted[0];

  const lastContact = latestContactDate(active);
  const staleDays =
    lastContact != null ? daysSince(lastContact, now) : Infinity;

  const overdue = active.some((a) => isOverduePromise(a, now));

  return {
    companyId,
    latestAction: latest,
    collectionStatus: latest.status,
    priority: latest.priority,
    nextActionDate: latest.nextActionDate,
    lastContactDate: lastContact,
    hasOverduePromise: overdue,
    isStale: staleDays > STALE_CONTACT_DAYS,
  };
}

/**
 * Construye el timeline de acciones para un cliente.
 * Solo acciones activas, orden desc por created_at, post-2026.
 */
export function buildClientCollectionTimeline(
  companyId: string,
  actions: CollectionAction[]
): ClientCollectionTimeline {
  const filtered = actions
    .filter((a) => a.isActive && a.createdAt >= "2026-01-01")
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  return { companyId, actions: filtered };
}

/**
 * Ordena resúmenes de clientes por prioridad de cobranza.
 *
 * Criterios (mayor urgencia primero):
 *  1. promesa vencida
 *  2. status escalated
 *  3. priority score (urgent > high > medium > low)
 *  4. isStale (sin contacto reciente)
 *  5. sin acción aún (no_action)
 */
export function rankClientsByCollectionPriority(
  summaries: ClientCollectionSummary[]
): ClientCollectionSummary[] {
  return [...summaries].sort((a, b) => {
    // 1. Promesa vencida
    const oa = a.hasOverduePromise ? 0 : 1;
    const ob = b.hasOverduePromise ? 0 : 1;
    if (oa !== ob) return oa - ob;

    // 2. Escalado
    const ea = a.collectionStatus === "escalated" ? 0 : 1;
    const eb = b.collectionStatus === "escalated" ? 0 : 1;
    if (ea !== eb) return ea - eb;

    // 3. Priority score
    const pa = a.priority != null ? PRIORITY_SCORE[a.priority] : 0;
    const pb = b.priority != null ? PRIORITY_SCORE[b.priority] : 0;
    if (pa !== pb) return pb - pa; // mayor score primero

    // 4. Stale
    const sa = a.isStale ? 0 : 1;
    const sb = b.isStale ? 0 : 1;
    if (sa !== sb) return sa - sb;

    // 5. Sin acción (al final)
    const na = a.collectionStatus === "no_action" ? 1 : 0;
    const nb = b.collectionStatus === "no_action" ? 1 : 0;
    return na - nb;
  });
}

/** Valida que CollectionPriority sea un valor conocido. */
export function isValidPriority(v: unknown): v is CollectionPriority {
  return typeof v === "string" && (COLLECTION_PRIORITIES as readonly string[]).includes(v);
}
