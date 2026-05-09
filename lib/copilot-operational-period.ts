/**
 * Período operativo de Copilot.
 *
 * Fuente única de verdad para la fecha de inicio operacional.
 * Todos los filtros, defaults de UI, validators de sync Zeta y reportes
 * deben importar desde aquí — nunca hardcodear "2026-01-01" en múltiples archivos.
 *
 * Reglas:
 *  - COPILOT_OPERATIONAL_START_DATE: constante compile-time (string literal).
 *  - getCopilotOperationalEndDate(): calcula "hoy" en runtime (ISO YYYY-MM-DD, UTC).
 *  - Usar isWithinCopilotOperationalPeriod() para validar fechas individuales.
 *  - Usar filterByCopilotOperationalPeriod() para filtrar arrays con campo issue_date.
 */

/** Primer día del período operativo de Copilot (inclusive). */
export const COPILOT_OPERATIONAL_START_DATE = "2026-01-01" as const;

/** Devuelve COPILOT_OPERATIONAL_START_DATE. Útil cuando se quiere llamada explícita. */
export function getCopilotOperationalStartDate(): string {
  return COPILOT_OPERATIONAL_START_DATE;
}

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD (UTC).
 * Calculada en runtime para que el valor sea siempre "el día de hoy".
 */
export function getCopilotOperationalEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Retorna true si la fecha ISO (YYYY-MM-DD) cae dentro del período operativo,
 * es decir, es >= COPILOT_OPERATIONAL_START_DATE.
 * Retorna false para fechas nulas, vacías o con formato inválido.
 */
export function isWithinCopilotOperationalPeriod(
  date: string | null | undefined
): boolean {
  const d = (date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d >= COPILOT_OPERATIONAL_START_DATE;
}

/**
 * Retorna true si la fecha es válida y cae **antes** del período operativo.
 * Útil para loggear / rechazar datos históricos.
 */
export function isPreOperationalPeriod(date: string | null | undefined): boolean {
  const d = (date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d < COPILOT_OPERATIONAL_START_DATE;
}

/**
 * Filtra un array de objetos con campo `issue_date` opcional, retaining only
 * items dentro del período operativo (>= COPILOT_OPERATIONAL_START_DATE).
 */
export function filterByCopilotOperationalPeriod<
  T extends { issue_date?: string | null }
>(items: T[]): T[] {
  return items.filter((item) =>
    isWithinCopilotOperationalPeriod(item.issue_date ?? null)
  );
}

/**
 * Lanza si `date` es pre-operacional o inválida.
 * Usar en mappers, pipelines y builders que garantizan hard cutoff.
 */
export function assertOperationalDate(
  date: string | null | undefined,
  label?: string
): void {
  if (!isWithinCopilotOperationalPeriod(date)) {
    const ctx = label ? ` (${label})` : "";
    throw new Error(
      `[COPILOT] Fecha pre-operacional${ctx}: "${date ?? "null"}" < ${COPILOT_OPERATIONAL_START_DATE}`
    );
  }
}
