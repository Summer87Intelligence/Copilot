/**
 * Período de análisis de /copilot/hoy — solo fechas, sin I/O.
 */

export type HoyPeriodRange = {
  from: string;
  to: string;
};

function parseYmd(ymd: string): Date | null {
  const ms = Date.parse(`${ymd.trim()}T12:00:00.000Z`);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Primer día del mes de `asOf` (YYYY-MM-DD). */
export function firstDayOfMonthYmd(asOf: string): string {
  const d = parseYmd(asOf);
  if (!d) return asOf.slice(0, 8) + "01";
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/** Último día del mes de `asOf` (YYYY-MM-DD). Maneja bisiestos. */
export function lastDayOfMonthYmd(asOf: string): string {
  const d = parseYmd(asOf);
  if (!d) return asOf;
  // Día 0 del mes siguiente = último día del mes actual
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Default: inicio del mes actual → hoy. */
export function defaultHoyPeriodRange(asOf: string): HoyPeriodRange {
  const to = asOf.slice(0, 10);
  return { from: firstDayOfMonthYmd(to), to };
}

export function last30DaysPeriodRange(asOf: string): HoyPeriodRange {
  const end = parseYmd(asOf);
  if (!end) return defaultHoyPeriodRange(asOf);
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { from: formatYmd(start), to: formatYmd(end) };
}

export function monthToDatePeriodRange(asOf: string): HoyPeriodRange {
  return defaultHoyPeriodRange(asOf);
}

export function isValidPeriodRange(range: HoyPeriodRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
}

/** Etiqueta visible: 01/05/2026 - 21/05/2026 */
export function formatHoyPeriodLabel(range: HoyPeriodRange): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${fmt(range.from)} - ${fmt(range.to)}`;
}
