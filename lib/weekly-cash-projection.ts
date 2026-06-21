/**
 * Proyección de caja semanal — helper puro.
 * Pregunta: "¿Cuánta plata voy a tener cada viernes si cobro lo previsto y pago lo cargado?"
 * Sin APIs, sin LLM, sin Supabase. Testeable en aislamiento.
 */

import { consolidateToUsd, roundUsd } from "@/lib/finance/currency-conversion";

export type WeeklyCashEntry = {
  date: string; // YYYY-MM-DD
  currency: "UYU" | "USD";
  amount: number; // positive number (direction determined by inflows vs outflows arrays)
};

export type WeeklyProjectionRow = {
  date: string;
  /** "Hoy" | "Próximo viernes" | "Vie DD/MM" */
  label: string;
  isToday: boolean;
  isFriday: boolean;
  /** Último milestone del horizonte visible. */
  isHorizonEnd: boolean;
  uyu: number;
  usd: number;
  /** USD + UYU/fxRate — para modo USD equivalente */
  usdEquivalent: number;
  /** Δ vs caja de hoy */
  deltaUyu: number;
  deltaUsd: number;
  deltaUsdEquivalent: number;
  /** Estado basado en USD equivalente */
  status: "green" | "orange" | "red";
  /** "Base actual" | "Mejor que hoy" | "Baja caja" | "Falta dinero" */
  statusLabel: string;
  /** Para native mode: riesgo por moneda individual */
  uyuNegative: boolean;
  usdNegative: boolean;
};

export type WeeklyCashProjectionInput = {
  today: string; // YYYY-MM-DD
  cashUyu: number;
  cashUsd: number;
  /** Pagos programados futuros — amounts positivos = salida de caja */
  outflows: readonly WeeklyCashEntry[];
  /** Cobros esperados futuros — amounts positivos = entrada de caja */
  inflows: readonly WeeklyCashEntry[];
  fxRate: number;
  /** Último día inclusivo del horizonte (override; default: próximos 5 viernes). */
  horizonEnd?: string;
};

/** Vista corta por defecto: Hoy + próximos 5 viernes. */
export const WEEKLY_PROJECTION_DEFAULT_FRIDAY_COUNT = 5;

// ─── Date utilities ──────────────────────────────────────────────────────────

function isoYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysYmd(ymd: string, days: number): string {
  const cursor = parseYmd(ymd);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return isoYmd(cursor);
}

export function monthEndYmd(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return isoYmd(new Date(Date.UTC(y, m, 0)));
}

function isFridayDate(ymd: string): boolean {
  return parseYmd(ymd).getUTCDay() === 5;
}

function formatDayMonth(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/**
 * Próximos `count` viernes estrictamente posteriores a `today`.
 * Si hoy es viernes, el primero es +7 días (no se repite hoy).
 */
export function nextFridaysAfterToday(today: string, count: number): string[] {
  if (count <= 0) return [];

  const fridays: string[] = [];
  const cursor = parseYmd(today);

  const dow = cursor.getUTCDay();
  const daysToNext = dow === 5 ? 7 : (5 - dow + 7) % 7 || 7;
  cursor.setUTCDate(cursor.getUTCDate() + daysToNext);

  for (let i = 0; i < count; i++) {
    fridays.push(isoYmd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return fridays;
}

/**
 * Todos los viernes estrictamente posteriores a `today`, hasta `horizonEnd` inclusive.
 */
export function futureFridaysUntilHorizon(today: string, horizonEnd: string): string[] {
  if (horizonEnd <= today) return [];

  const fridays: string[] = [];
  const horizon = parseYmd(horizonEnd);
  const cursor = parseYmd(today);

  const dow = cursor.getUTCDay();
  const daysToNext = dow === 5 ? 7 : (5 - dow + 7) % 7 || 7;
  cursor.setUTCDate(cursor.getUTCDate() + daysToNext);

  while (cursor <= horizon) {
    fridays.push(isoYmd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return fridays;
}

/** Hoy + próximos 5 viernes (default) o todos los viernes hasta `horizonEnd`. */
export function weeklyProjectionMilestones(
  today: string,
  horizonEnd?: string
): string[] {
  const fridays = horizonEnd
    ? futureFridaysUntilHorizon(today, horizonEnd)
    : nextFridaysAfterToday(today, WEEKLY_PROJECTION_DEFAULT_FRIDAY_COUNT);
  return [today, ...fridays];
}

function milestoneLabel(
  date: string,
  today: string,
  milestones: readonly string[]
): string {
  if (date === today) return "Hoy";

  const firstFutureFriday = milestones.find((d) => d !== today && isFridayDate(d));
  if (date === firstFutureFriday) return "Próximo viernes";

  return `Vie ${formatDayMonth(date)}`;
}

// ─── Core projection ─────────────────────────────────────────────────────────

function safeFxRate(fxRate: number): number {
  return fxRate > 0 ? fxRate : 40;
}

function toUsdEq(uyu: number, usd: number, rate: number): number {
  return roundUsd(consolidateToUsd(uyu, usd, safeFxRate(rate)));
}

function statusFor(
  usdEq: number,
  todayUsdEq: number,
  isToday: boolean
): WeeklyProjectionRow["status"] {
  if (isToday) return "green";
  if (usdEq < 0) return "red";
  if (usdEq >= todayUsdEq) return "green";
  return "orange";
}

function statusLabelFor(status: WeeklyProjectionRow["status"], isToday: boolean): string {
  if (isToday) return "Base actual";
  if (status === "green") return "Mejor que hoy";
  if (status === "orange") return "Baja caja";
  return "Falta dinero";
}

function cashAtDate(
  date: string,
  today: string,
  cashUyu: number,
  cashUsd: number,
  inflows: readonly WeeklyCashEntry[],
  outflows: readonly WeeklyCashEntry[]
): { uyu: number; usd: number } {
  if (date === today) {
    return { uyu: cashUyu, usd: cashUsd };
  }

  let inflowUyu = 0;
  let inflowUsd = 0;
  let outflowUyu = 0;
  let outflowUsd = 0;

  for (const e of inflows) {
    if (e.date > today && e.date <= date) {
      if (e.currency === "UYU") inflowUyu += e.amount;
      else inflowUsd += e.amount;
    }
  }
  for (const e of outflows) {
    if (e.date > today && e.date <= date) {
      if (e.currency === "UYU") outflowUyu += e.amount;
      else outflowUsd += e.amount;
    }
  }

  return {
    uyu: roundUsd(cashUyu + inflowUyu - outflowUyu),
    usd: roundUsd(cashUsd + inflowUsd - outflowUsd),
  };
}

export function buildWeeklyCashProjection(
  input: WeeklyCashProjectionInput
): WeeklyProjectionRow[] {
  const { today, cashUyu, cashUsd, outflows, inflows, fxRate, horizonEnd } = input;
  const rate = safeFxRate(fxRate);

  const todayUsdEq = toUsdEq(cashUyu, cashUsd, rate);
  const milestones = weeklyProjectionMilestones(today, horizonEnd);

  const rows: WeeklyProjectionRow[] = [];

  for (const date of milestones) {
    const isToday = date === today;
    const isFriday = isFridayDate(date);
    const isHorizonEnd = date === milestones[milestones.length - 1] && !isToday;

    const { uyu, usd } = cashAtDate(date, today, cashUyu, cashUsd, inflows, outflows);
    const usdEquivalent = toUsdEq(uyu, usd, rate);

    const deltaUyu = roundUsd(uyu - cashUyu);
    const deltaUsd = roundUsd(usd - cashUsd);
    const deltaUsdEquivalent = roundUsd(usdEquivalent - todayUsdEq);

    const status = statusFor(usdEquivalent, todayUsdEq, isToday);
    const statusLabel = statusLabelFor(status, isToday);
    const label = milestoneLabel(date, today, milestones);

    rows.push({
      date,
      label,
      isToday,
      isFriday,
      isHorizonEnd,
      uyu,
      usd,
      usdEquivalent,
      deltaUyu,
      deltaUsd,
      deltaUsdEquivalent,
      status,
      statusLabel,
      uyuNegative: uyu < 0,
      usdNegative: usd < 0,
    });
  }

  return rows;
}
