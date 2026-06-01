/**
 * Contexto de fechas/períodos para /copilot/finanzas — sin I/O.
 */

import { FINANCIAL_TRENDS_MIN_YM } from "@/lib/copilot-financial-monthly-trends";
import {
  defaultHoyPeriodRange,
  firstDayOfMonthYmd,
  formatHoyPeriodLabel,
} from "@/lib/copilot-hoy-period";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export type FinancialPeriodContext = {
  asOfYmd: string;
  asOfLabel: string;
  currentPeriod: { from: string; to: string; label: string };
  currentMonthYm: string;
  currentMonthLabel: string;
  isCurrentMonthPartial: boolean;
  daysElapsedInMonth: number;
  daysInMonth: number;
  lastClosedMonthYm: string;
  lastClosedMonthLabel: string;
  previousClosedMonthYm: string;
  previousClosedMonthLabel: string;
  partialMonthCallout: string | null;
  currenciesNote: string;
  trendsDataRangeLabel: string;
};

export function prevYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? ym} ${y}`;
}

export function shortMonthLabelFromYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  const short = d.toLocaleDateString("es-UY", { month: "short" });
  return `${short}. ${y}`;
}

function formatAsOfLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function daysInCalendarMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Mes incompleto si la fecha de corte no es el último día del mes calendario. */
export function isCurrentMonthPartialAt(asOfYmd: string): boolean {
  const ym = asOfYmd.slice(0, 7);
  const day = Number(asOfYmd.slice(8, 10));
  if (!Number.isFinite(day)) return true;
  return day < daysInCalendarMonth(ym);
}

export function buildFinancialPeriodContext(asOfYmd: string): FinancialPeriodContext {
  const asOf = asOfYmd.slice(0, 10);
  const currentMonthYm = asOf.slice(0, 7);
  const isCurrentMonthPartial = isCurrentMonthPartialAt(asOf);
  const currentMonthLabel = monthLabelFromYm(currentMonthYm);
  const period = defaultHoyPeriodRange(asOf);

  const lastClosedMonthYm = isCurrentMonthPartial ? prevYm(currentMonthYm) : currentMonthYm;
  const previousClosedMonthYm = prevYm(lastClosedMonthYm);
  const lastClosedMonthLabel = monthLabelFromYm(
    lastClosedMonthYm >= FINANCIAL_TRENDS_MIN_YM ? lastClosedMonthYm : currentMonthYm
  );
  const previousClosedMonthLabel = monthLabelFromYm(
    previousClosedMonthYm >= FINANCIAL_TRENDS_MIN_YM ? previousClosedMonthYm : lastClosedMonthYm
  );

  const day = Number(asOf.slice(8, 10));
  const daysInMonth = daysInCalendarMonth(currentMonthYm);

  const partialMonthCallout = isCurrentMonthPartial
    ? `${currentMonthLabel} está en curso. Para comparar desempeño mensual, se usa ${lastClosedMonthLabel} como último mes cerrado.`
    : null;

  const trendsEnd = shortMonthLabelFromYm(currentMonthYm);
  const trendsStart = shortMonthLabelFromYm(FINANCIAL_TRENDS_MIN_YM);

  return {
    asOfYmd: asOf,
    asOfLabel: formatAsOfLabel(asOf),
    currentPeriod: {
      from: period.from,
      to: period.to,
      label: formatHoyPeriodLabel(period),
    },
    currentMonthYm,
    currentMonthLabel,
    isCurrentMonthPartial,
    daysElapsedInMonth: Number.isFinite(day) ? day : 1,
    daysInMonth,
    lastClosedMonthYm,
    lastClosedMonthLabel,
    previousClosedMonthYm,
    previousClosedMonthLabel,
    partialMonthCallout,
    currenciesNote: "UYU y USD se analizan por separado.",
    trendsDataRangeLabel: `${trendsStart} – ${trendsEnd}`,
  };
}

/** Inicio del mes actual hasta fecha de corte (alias explícito). */
export function currentMonthPeriodRange(asOfYmd: string): { from: string; to: string } {
  const to = asOfYmd.slice(0, 10);
  return { from: firstDayOfMonthYmd(to), to };
}
