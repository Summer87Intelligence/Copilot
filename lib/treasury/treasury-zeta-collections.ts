/**
 * Pure helpers for computing post-baseline Zeta client receipts.
 *
 * Rule: receipts with receipt_date >= baselineDate are "post-baseline" and
 * increase available cash. Pre-baseline receipts are already baked into the
 * user's loaded balance and must NOT be counted again.
 *
 * Convention: receipt_date >= baselineDate (inclusive). This matches the
 * manual-movement filter (movementDate >= baselineDate). The balance is
 * understood to represent the state at the START of baselineDate.
 */

import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

// Status values that indicate an annulled or cancelled receipt.
export const VOIDED_RECEIPT_STATUSES = new Set([
  "void",
  "voided",
  "canceled",
  "cancelled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

export type ZetaReceiptRow = {
  currency_code: string | null;
  amount: number | null;
  receipt_date: string | null;
  receipt_number?: string | null;
  status?: string | null;
};

export type ZetaCashEvent = {
  date: string;
  concept: string;
};

function isValidPostBaselineReceipt(
  row: ZetaReceiptRow,
  baselineDates: Partial<Record<TreasuryCurrencyCode, string>>
): { currency: TreasuryCurrencyCode; date: string } | null {
  const code = String(row.currency_code ?? "")
    .trim()
    .toUpperCase();
  if (code !== "UYU" && code !== "USD") return null;

  const currency = code as TreasuryCurrencyCode;
  const baseline = baselineDates[currency];
  if (!baseline) return null;

  const rDate = String(row.receipt_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rDate) || rDate < baseline) return null;

  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (status && VOIDED_RECEIPT_STATUSES.has(status)) return null;

  const amount = typeof row.amount === "number" ? row.amount : 0;
  if (amount <= 0) return null;

  return { currency, date: rDate };
}

function receiptConcept(row: ZetaReceiptRow): string {
  const number = String(row.receipt_number ?? "").trim();
  return number ? `Recibo ${number}` : "Cobro Zeta";
}

function pickLaterCashEvent(
  current: ZetaCashEvent | null | undefined,
  candidate: ZetaCashEvent | null | undefined
): ZetaCashEvent | null {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  if (candidate.date > current.date) return candidate;
  if (candidate.date < current.date) return current;
  return candidate.concept.localeCompare(current.concept) > 0 ? candidate : current;
}

/**
 * Filter and sum Zeta receipts by currency for the post-baseline period.
 *
 * Pure function — can be unit-tested without a database.
 *
 * Excludes:
 * - Receipts before the currency's baselineDate
 * - Currencies with no configured baseline (conservative — unknown if already included)
 * - Voided / cancelled receipts
 * - Non-positive amounts
 * - Invalid receipt_date format
 */
export function filterAndSumZetaReceipts(
  receipts: readonly ZetaReceiptRow[],
  baselineDates: Partial<Record<TreasuryCurrencyCode, string>>
): Partial<Record<TreasuryCurrencyCode, number>> {
  const result: Partial<Record<TreasuryCurrencyCode, number>> = {};

  for (const row of receipts) {
    const valid = isValidPostBaselineReceipt(row, baselineDates);
    if (!valid) continue;

    const amount = typeof row.amount === "number" ? row.amount : 0;
    result[valid.currency] = Math.round(((result[valid.currency] ?? 0) + amount) * 100) / 100;
  }

  return result;
}

/**
 * Último recibo/cobro Zeta post-baseline por moneda (solo display; no altera montos).
 */
export function findLatestZetaReceipts(
  receipts: readonly ZetaReceiptRow[],
  baselineDates: Partial<Record<TreasuryCurrencyCode, string>>
): Partial<Record<TreasuryCurrencyCode, ZetaCashEvent>> {
  const result: Partial<Record<TreasuryCurrencyCode, ZetaCashEvent>> = {};

  for (const row of receipts) {
    const valid = isValidPostBaselineReceipt(row, baselineDates);
    if (!valid) continue;

    const candidate: ZetaCashEvent = {
      date: valid.date,
      concept: receiptConcept(row),
    };
    result[valid.currency] = pickLaterCashEvent(result[valid.currency], candidate) ?? candidate;
  }

  return result;
}
