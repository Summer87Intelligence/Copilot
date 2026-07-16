/**
 * FASE 9 — Resolución de períodos y ventanas de comparación (Montevideo).
 *
 * Todo el cálculo se hace sobre strings YYYY-MM-DD con aritmética UTC para ser
 * determinístico y estable SSR↔cliente. El "hoy" se inyecta desde
 * `todayYmdMontevideo()` en los call sites.
 */

export type SalesPeriodPreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "year"
  | "custom";

export type SalesComparisonMode =
  | "previous_period"
  | "previous_month"
  | "same_elapsed_days"
  | "custom";

export type DateRange = { from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(s: string): boolean {
  return YMD.test(s);
}

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return { y: y!, m: m!, d: d! };
}

function toUtc(ymd: string): number {
  const { y, m, d } = parts(ymd);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(ymd: string, days: number): string {
  return fromUtc(toUtc(ymd) + days * 86400000);
}

export function firstOfMonth(ymd: string): string {
  const { y, m } = parts(ymd);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function lastOfMonth(ymd: string): string {
  const { y, m } = parts(ymd);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Mes anterior (mismo día 1). */
function prevMonthFirst(ymd: string): string {
  const { y, m } = parts(ymd);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}-01`;
}

/** Resuelve el rango del período según preset. */
export function resolvePeriodRange(
  preset: SalesPeriodPreset,
  today: string,
  custom?: { from?: string; to?: string }
): DateRange {
  const t = isYmd(today) ? today : firstOfMonth("2026-01-01");
  switch (preset) {
    case "this_month":
      return { from: firstOfMonth(t), to: t };
    case "last_month": {
      const pm = prevMonthFirst(t);
      return { from: pm, to: lastOfMonth(pm) };
    }
    case "last_3_months":
      return { from: firstOfMonth(addMonths(t, -2)), to: t };
    case "last_6_months":
      return { from: firstOfMonth(addMonths(t, -5)), to: t };
    case "year":
      return { from: `${parts(t).y}-01-01`, to: t };
    case "custom": {
      const from = custom?.from && isYmd(custom.from) ? custom.from : firstOfMonth(t);
      const to = custom?.to && isYmd(custom.to) ? custom.to : t;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

function addMonths(ymd: string, months: number): string {
  const { y, m, d } = parts(ymd);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Resuelve la ventana de comparación relativa al período actual. */
export function resolveComparisonRange(
  mode: SalesComparisonMode,
  current: DateRange,
  custom?: { from?: string; to?: string }
): DateRange {
  switch (mode) {
    case "previous_period": {
      const lengthDays = Math.round((toUtc(current.to) - toUtc(current.from)) / 86400000);
      const to = addDays(current.from, -1);
      const from = addDays(to, -lengthDays);
      return { from, to };
    }
    case "previous_month": {
      const pm = prevMonthFirst(current.from);
      return { from: pm, to: lastOfMonth(pm) };
    }
    case "same_elapsed_days": {
      // Mismo tramo del mes anterior: día 1 → mismo día del mes que current.to.
      const pmFirst = prevMonthFirst(current.from);
      const dayOfMonth = parts(current.to).d;
      const pmLast = parts(lastOfMonth(pmFirst)).d;
      const clampedDay = Math.min(dayOfMonth, pmLast);
      const { y, m } = parts(pmFirst);
      return { from: pmFirst, to: `${y}-${String(m).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}` };
    }
    case "custom": {
      const from = custom?.from && isYmd(custom.from) ? custom.from : addDays(current.from, -30);
      const to = custom?.to && isYmd(custom.to) ? custom.to : addDays(current.from, -1);
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

export function isValidPeriodPreset(v: unknown): v is SalesPeriodPreset {
  return (
    v === "this_month" ||
    v === "last_month" ||
    v === "last_3_months" ||
    v === "last_6_months" ||
    v === "year" ||
    v === "custom"
  );
}

export function isValidComparisonMode(v: unknown): v is SalesComparisonMode {
  return (
    v === "previous_period" ||
    v === "previous_month" ||
    v === "same_elapsed_days" ||
    v === "custom"
  );
}
