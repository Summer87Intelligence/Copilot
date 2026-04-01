/**
 * Filtro de filas activas en tablas proto_* con `is_active` + `archived_at`.
 * Modo "active": solo `is_active = true` (sin mezclar lecturas con archivados).
 */

export type ProtoActiveListMode = "active" | "inactive" | "all";

/** Encadena filtro de actividad sobre un builder de Supabase (select/from). */
export function applyProtoActiveListFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qb: any,
  mode: ProtoActiveListMode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (mode === "active") return qb.eq("is_active", true);
  if (mode === "inactive") return qb.eq("is_active", false);
  return qb;
}

export function rowIsInactive(row: Record<string, unknown>): boolean {
  return row.is_active === false;
}
