/**
 * FASE F — Mapea filas crudas de `bank_movement_reconciliation_links` al tipo de
 * dominio `ReconciliationLink` para alimentar las reglas de banco del motor de
 * integridad. Puro, sin DB.
 */
import type {
  ReconciliationConfidence,
  ReconciliationLink,
  ReconciliationMethod,
  ReconciliationTargetType,
} from "@/lib/bank-movements/bank-reconciliation-links";

export function mapLinkRowsToReconciliationLinks(
  rows: Record<string, unknown>[]
): ReconciliationLink[] {
  return rows.map((row) => ({
    id: String(row.id),
    bankMovementId: String(row.bank_movement_id),
    targetType: String(row.target_type) as ReconciliationTargetType,
    targetId: row.target_id != null ? String(row.target_id) : null,
    appliedAmount:
      typeof row.applied_amount === "number"
        ? row.applied_amount
        : parseFloat(String(row.applied_amount)) || 0,
    currency: String(row.currency) === "USD" ? "USD" : "UYU",
    direction: String(row.direction) === "outflow" ? "outflow" : "inflow",
    method: String(row.method) as ReconciliationMethod,
    confidence: row.confidence != null ? (String(row.confidence) as ReconciliationConfidence) : null,
    archivedAt: row.archived_at != null ? String(row.archived_at) : null,
  }));
}
