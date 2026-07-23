/**
 * Política temporal bancaria canónica.
 *
 * FASE BANK-2026-CLEANUP-PAGINATION-HISTORY-AND-CASHFLOW-KPI-001
 *
 * Piso operativo visible = piso financiero Copilot (`MIN_FINANCIAL_DATE` /
 * `COPILOT_OPERATIONAL_START_DATE` = 2026-01-01). No inventar una segunda
 * definición de "inicio 2026": se reutiliza la constante del dominio.
 *
 * - Fecha < MIN_BANK_OPERATIONAL_DATE ⇒ fuera de UI operativa, KPI, Historial
 *   operativo y filtros de mes (puede persistirse como excluded_from_operations).
 * - BANK_INTELLIGENCE_CUTOFF_DATE (2026-07-01) sigue aplicando solo al runner
 *   shadow / historical_review — no gobierna la UI diaria.
 */

import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";

/** Piso operativo bancario visible (= piso financiero Copilot). */
export const MIN_BANK_OPERATIONAL_DATE = MIN_FINANCIAL_DATE;

/**
 * Primer día operativo del banco en UI/KPI/listas.
 * Fecha < este valor ⇒ histórico / fuera de operación visible.
 */
export const BANK_OPERATIONAL_START_DATE = MIN_BANK_OPERATIONAL_DATE;

/**
 * Corte del motor de inteligencia shadow: [MIN_BANK, CUTOFF) puede auditarse
 * como historical_review; no se usa para ocultar meses 2026 en la UI.
 */
export const BANK_INTELLIGENCE_CUTOFF_DATE = "2026-07-01";

/** Motivo canónico al excluir filas anteriores al piso 2026 (reversible). */
export const BANK_EXCLUSION_REASON_BEFORE_2026 = "before_operational_cutoff_2026";

/** Normaliza cualquier fecha (ISO / timestamptz / date) a YYYY-MM-DD. */
export function normalizeMovementDate(value: string | null | undefined): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

/**
 * ¿La fecha corresponde a un movimiento histórico / fuera de operación visible?
 * Fecha faltante/inválida ⇒ se trata como NO histórica (operativa) para no
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

/** ¿Fecha anterior al corte de inteligencia shadow (2026-07-01)? */
export function isBankMovementDateBeforeIntelligenceCutoff(
  movementDate: string | null | undefined
): boolean {
  return isBankMovementDateHistorical(movementDate, BANK_INTELLIGENCE_CUTOFF_DATE);
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
