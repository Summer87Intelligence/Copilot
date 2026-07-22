/**
 * Helpers puros de estado/etiqueta de la vista unificada (sin server-only).
 * Usados por el motor server y por la UI de Conciliación.
 */

export type UnifiedCaseStatus =
  | "sin_cliente"
  | "listo_para_confirmar"
  | "revision_parcial"
  | "falta_recibo"
  | "requiere_revision"
  | "conciliado";

export type UnifiedRowStatus = Exclude<UnifiedCaseStatus, "revision_parcial"> | "duplicado";

export type UnifiedEvidenceLevel = "strong" | "probable" | "ambiguous" | "none";

/**
 * Estado a nivel de tarjeta/cliente. Una mezcla de listos + pendientes de
 * recibo NUNCA se resume como "Listo para confirmar".
 */
export function deriveCaseStatus(
  rowStatuses: UnifiedRowStatus[],
  evidence: UnifiedEvidenceLevel
): UnifiedCaseStatus {
  const active = rowStatuses.filter((s) => s !== "duplicado");
  if (active.length === 0 || active.every((s) => s === "conciliado")) return "conciliado";
  if (evidence === "ambiguous") return "requiere_revision";
  if (evidence === "none") return "sin_cliente";
  const hasReady = active.some((s) => s === "listo_para_confirmar");
  const hasMissing = active.some((s) => s === "falta_recibo");
  if (hasReady && hasMissing) return "revision_parcial";
  if (hasReady) return "listo_para_confirmar";
  return "falta_recibo";
}

/** Etiqueta de tarjeta: distingue "todos listos" vs mezcla parcial. */
export function unifiedCaseStatusLabel(
  status: UnifiedCaseStatus,
  counts?: { ready: number; missing: number }
): string {
  if (status === "listo_para_confirmar") return "Todos listos para confirmar";
  if (status === "revision_parcial") {
    if (counts && (counts.ready > 0 || counts.missing > 0)) {
      return `${counts.ready} listos · ${counts.missing} pendientes de recibo`;
    }
    return "Revisión parcial";
  }
  if (status === "falta_recibo") return "Falta recibo en Zeta";
  if (status === "sin_cliente") return "Sin cliente";
  if (status === "requiere_revision") return "Requiere revisión";
  return "Conciliado con recibo";
}

export const UNIFIED_CASE_RECOMMENDED_ACTION: Record<UnifiedCaseStatus, string> = {
  sin_cliente: "Buscar cliente",
  listo_para_confirmar: "Revisar conciliación",
  revision_parcial: "Revisar movimientos",
  falta_recibo: "Revisar conciliación",
  requiere_revision: "Elegir cliente",
  conciliado: "Ver conciliación",
};
