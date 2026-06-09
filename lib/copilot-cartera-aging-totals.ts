/**
 * Totales derivados de `report.agingByCurrency` (mismo motor que /copilot/cartera → Aging).
 * Motor puro, sin I/O.
 */

import type {
  AgingBucket,
  AgingRange,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";

export type CarteraCurrencyTotals = {
  UYU: number;
  USD: number;
};

/** Buckets que Cartera muestra como antigüedad vencida (excluye 0_30 vigente/reciente). */
export const CARTERA_AGING_OVERDUE_RANGES: ReadonlyArray<
  Extract<AgingRange, "31_60" | "61_90" | "90_plus">
> = ["31_60", "61_90", "90_plus"];

/** Bucket 0–30 días (corto plazo / al día en mora reciente). */
export const CARTERA_AGING_CURRENT_RANGES: ReadonlyArray<Extract<AgingRange, "0_30">> = [
  "0_30",
];

const CURRENCIES: ReadonlyArray<ReconciliationCurrencyCode> = ["UYU", "USD"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumBuckets(
  buckets: AgingBucket[] | undefined,
  ranges: ReadonlyArray<AgingRange>
): number {
  if (!buckets?.length) return 0;
  const set = new Set(ranges);
  return round2(
    buckets.reduce((s, b) => (set.has(b.range) ? s + b.amount : s), 0)
  );
}

/**
 * Deuda vencida según Aging de Cartera: suma 31–60 + 61–90 + +90 días (>30d).
 * Mismo criterio que `legacy_overdue_total` en `buildAgingComparativeDiagnostics`.
 */
export function sumCarteraAgingOverdue(
  agingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>
): CarteraCurrencyTotals {
  return {
    UYU: sumBuckets(agingByCurrency.UYU, CARTERA_AGING_OVERDUE_RANGES),
    USD: sumBuckets(agingByCurrency.USD, CARTERA_AGING_OVERDUE_RANGES),
  };
}

/** Deuda vencida total: due_date < hoy (incluye mora 1–30 días). Fuente: portfolio.overdue_uyu/usd. */
export function sumPortfolioOverdueDebt(
  rows: readonly { overdue_uyu?: number; overdue_usd?: number }[]
): CarteraCurrencyTotals {
  return {
    UYU: round2(rows.reduce((s, r) => s + (r.overdue_uyu ?? 0), 0)),
    USD: round2(rows.reduce((s, r) => s + (r.overdue_usd ?? 0), 0)),
  };
}

/** Saldo en bucket 0–30 días (mismo motor que Cartera). */
export function sumCarteraAgingCurrent(
  agingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>
): CarteraCurrencyTotals {
  return {
    UYU: sumBuckets(agingByCurrency.UYU, CARTERA_AGING_CURRENT_RANGES),
    USD: sumBuckets(agingByCurrency.USD, CARTERA_AGING_CURRENT_RANGES),
  };
}

/** Suma todos los buckets de aging (deuda viva en el widget). */
export function sumCarteraAgingTotal(
  agingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>
): CarteraCurrencyTotals {
  const allRanges: AgingRange[] = ["0_30", "31_60", "61_90", "90_plus"];
  return {
    UYU: sumBuckets(agingByCurrency.UYU, allRanges),
    USD: sumBuckets(agingByCurrency.USD, allRanges),
  };
}

export function totalsRoughlyEqual(
  a: CarteraCurrencyTotals,
  b: CarteraCurrencyTotals,
  epsilon = 0.02
): boolean {
  for (const cc of CURRENCIES) {
    if (Math.abs(a[cc] - b[cc]) > epsilon) return false;
  }
  return true;
}
