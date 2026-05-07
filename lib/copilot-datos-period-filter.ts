/**
 * Filtros de período (mes / año / todos) compartibles entre entidades de `/copilot/datos`.
 *
 * Diseño:
 *  - `parseRowYmd(row, fieldKey)`: lee una columna de fecha como string YYYY-MM-DD agnóstico de zona horaria.
 *    Cubre los formatos persistidos por los pipelines Zeta (`receipt_date`, `issue_date`, `due_date`,
 *    `payment_date`) que siempre son `YYYY-MM-DD` de Postgres `date`.
 *  - `rowDateInCalendarMonth`: comparación pura por (year, month1-12); empareja semántica con el
 *    `invoiceIssueInCalendarMonth` legacy de la pestaña Facturas pero sin acoplarse a `issue_date`.
 *
 * NO toca pipelines, persistencia ni mappers. Solo lectura.
 */

import type { DataRow } from "@/lib/copilot-data";

export type Ymd = { y: number; m: number; d: number };

/** Lee `row[fieldKey]` como YYYY-MM-DD. Devuelve `null` si no parsea. */
export function parseRowYmd(row: DataRow, fieldKey: string): Ymd | null {
  const raw = row[fieldKey];
  const s = String(raw ?? "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

/** `true` si `row[fieldKey]` está en el mes calendario (year, month1to12). */
export function rowDateInCalendarMonth(
  row: DataRow,
  fieldKey: string,
  year: number,
  month1to12: number
): boolean {
  const p = parseRowYmd(row, fieldKey);
  if (!p) return false;
  return p.y === year && p.m === month1to12;
}

/** `true` si `row[fieldKey]` está en el año calendario. */
export function rowDateInCalendarYear(row: DataRow, fieldKey: string, year: number): boolean {
  const p = parseRowYmd(row, fieldKey);
  if (!p) return false;
  return p.y === year;
}

/** Año/Mes seleccionable en filtros de período: número o "all". */
export type PeriodSelector = number | "all";

/**
 * Filtra una colección de filas por (año, mes) según `dateField`.
 *  - `year = "all"` y `month = "all"` → no filtra (sin sin-op más rápido posible).
 *  - `year = number, month = "all"` → solo año.
 *  - `year = "all", month = number` → solo mes (de cualquier año).
 *  - `year, month` numéricos → mes calendario completo.
 */
export function filterRowsByPeriod(
  rows: readonly DataRow[],
  dateField: string,
  year: PeriodSelector,
  month: PeriodSelector
): DataRow[] {
  if (year === "all" && month === "all") return rows.slice();
  return rows.filter((row) => {
    const p = parseRowYmd(row, dateField);
    if (!p) return false;
    if (year !== "all" && p.y !== year) return false;
    if (month !== "all" && p.m !== month) return false;
    return true;
  });
}

/** Lista de meses 1-12 para selectores. */
export const PERIOD_MONTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];
