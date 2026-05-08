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

// ---------------------------------------------------------------------------
// Modo "rango libre de fechas" (extensión usada por el sidebar de cliente para
// reproducir reportes Zeta tipo "01/12/25 al 17/04/26").
//
// Convención: las fechas se manejan como YYYY-MM-DD agnósticas de zona horaria
// (igual que `parseRowYmd`); es responsabilidad del caller normalizar inputs.
// ---------------------------------------------------------------------------

export type PeriodMode = "all" | "month_year" | "range";

/**
 * Filtra filas por rango cerrado [fromYmd, toYmd] (inclusivo en ambos extremos)
 * sobre `dateField`. Cualquiera de los extremos puede ser `null`/vacío para
 * dejar el rango abierto por ese lado. Si ambos están vacíos se devuelve un
 * `slice()` (sin filtrar).
 */
export function filterRowsByDateRange(
  rows: readonly DataRow[],
  dateField: string,
  fromYmd: string | null | undefined,
  toYmd: string | null | undefined
): DataRow[] {
  const from = normalizeYmdInput(fromYmd);
  const to = normalizeYmdInput(toYmd);
  if (!from && !to) return rows.slice();
  return rows.filter((row) => {
    const p = parseRowYmd(row, dateField);
    if (!p) return false;
    const ymd = `${pad4(p.y)}-${pad2(p.m)}-${pad2(p.d)}`;
    if (from && ymd < from) return false;
    if (to && ymd > to) return false;
    return true;
  });
}

/** Normaliza una entrada `<input type="date">` a YYYY-MM-DD o `null`. */
export function normalizeYmdInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Formato visible es-UY DD/MM/YYYY a partir de YYYY-MM-DD; fallback `—`. */
export function formatYmdDisplay(value: string | null | undefined): string {
  const norm = normalizeYmdInput(value);
  if (!norm) return "—";
  return `${norm.slice(8, 10)}/${norm.slice(5, 7)}/${norm.slice(0, 4)}`;
}

/**
 * Etiqueta humana del período activo del panel:
 *  - mode = "all"          → "Histórico completo"
 *  - mode = "month_year"   → "Mayo 2026" | "Año 2026" | "Mes Mayo"
 *  - mode = "range"        → "Del 01/12/2025 al 17/04/2026"
 *                          → "Hasta 17/04/2026" | "Desde 01/12/2025"
 *
 * No retorna texto vacío: si el modo es "range" sin extremos, se reporta como
 * histórico completo (= equivalente funcional a "all").
 */
export function describePeriodLabel(args: {
  mode: PeriodMode;
  year?: PeriodSelector;
  month?: PeriodSelector;
  from?: string | null;
  to?: string | null;
}): string {
  if (args.mode === "all") return "Histórico completo";
  if (args.mode === "month_year") {
    const y = args.year;
    const m = args.month;
    const monthLabel =
      m && m !== "all"
        ? PERIOD_MONTH_OPTIONS.find((o) => o.value === m)?.label
        : null;
    if (monthLabel && y && y !== "all") return `${monthLabel} ${y}`;
    if (monthLabel) return `Mes ${monthLabel}`;
    if (y && y !== "all") return `Año ${y}`;
    return "Histórico completo";
  }
  // range
  const from = normalizeYmdInput(args.from ?? null);
  const to = normalizeYmdInput(args.to ?? null);
  if (from && to) return `Del ${formatYmdDisplay(from)} al ${formatYmdDisplay(to)}`;
  if (from) return `Desde ${formatYmdDisplay(from)}`;
  if (to) return `Hasta ${formatYmdDisplay(to)}`;
  return "Histórico completo";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function pad4(n: number): string {
  return String(n).padStart(4, "0");
}
