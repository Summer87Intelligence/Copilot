/**
 * Política temporal bancaria canónica (FASE-3).
 *
 * Un movimiento bancario es "histórico" si su fecha es anterior a
 * BANK_OPERATIONAL_START_DATE. Los históricos permanecen visibles y buscables,
 * pero NO deben:
 *   - mezclarse por defecto en métricas operativas,
 *   - generar tareas automáticas,
 *   - generar alertas operativas,
 *   - aparecer como "pendiente reciente" ni afectar proyecciones.
 *
 * La fecha se centraliza acá: no dispersar literales "2026-07-01" por el código.
 * La clasificación es DERIVADA (no persistida) — ver docs/technical/canonical-bank-movements.md.
 */

/** Primer día operativo del banco. Fecha < este valor ⇒ histórico. Fecha >= ⇒ operativo. */
export const BANK_OPERATIONAL_START_DATE = "2026-07-01";

/** Normaliza cualquier fecha (ISO / timestamptz / date) a YYYY-MM-DD. */
export function normalizeMovementDate(value: string | null | undefined): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

/**
 * ¿La fecha corresponde a un movimiento histórico?
 * Fecha faltante/ inválida ⇒ se trata como NO histórica (operativa) para no
 * ocultar datos silenciosamente; el diagnóstico `missing_movement_date` la marca.
 */
export function isBankMovementDateHistorical(
  movementDate: string | null | undefined,
  startDate: string = BANK_OPERATIONAL_START_DATE
): boolean {
  const ymd = normalizeMovementDate(movementDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return ymd < normalizeMovementDate(startDate);
}

/** ¿El movimiento (por su `movement_date`) es histórico? */
export function isBankMovementHistorical(
  movement: { movement_date?: string | null; movementDate?: string | null },
  startDate: string = BANK_OPERATIONAL_START_DATE
): boolean {
  const date = movement.movement_date ?? movement.movementDate ?? null;
  return isBankMovementDateHistorical(date, startDate);
}

/**
 * Reparte una lista en operativos vs históricos sin perder registros.
 * Determinista y puro: útil para snapshots, tareas y reportes.
 */
export function partitionByHistorical<T>(
  items: readonly T[],
  getDate: (item: T) => string | null | undefined,
  startDate: string = BANK_OPERATIONAL_START_DATE
): { operational: T[]; historical: T[] } {
  const operational: T[] = [];
  const historical: T[] = [];
  for (const item of items) {
    if (isBankMovementDateHistorical(getDate(item), startDate)) historical.push(item);
    else operational.push(item);
  }
  return { operational, historical };
}
