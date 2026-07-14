/**
 * FINANCIAL CANONICAL LAYER — Moneda.
 *
 * Reexporta las utilidades de conversión probadas (`lib/finance/currency-conversion`)
 * y añade guards canónicos. Regla dura: UYU y USD nunca se suman salvo con un
 * `exchangeRate` explícito y visible en el contexto.
 */

import {
  consolidateToUsd,
  convertMoneyToUsd,
  formatExchangeRateLabel,
  roundUsd,
} from "@/lib/finance/currency-conversion";

import type {
  CanonicalFinancialContext,
  CanonicalMoney,
  FinancialCurrency,
} from "./types";

export {
  consolidateToUsd,
  convertMoneyToUsd,
  formatExchangeRateLabel,
  roundUsd,
};

export const SUPPORTED_CURRENCIES: readonly FinancialCurrency[] = ["UYU", "USD"];

/** Normaliza un `currency_code` arbitrario a `FinancialCurrency` o `null`. */
export function normalizeCurrency(
  code: string | null | undefined
): FinancialCurrency | null {
  if (code == null) return null;
  const upper = String(code).trim().toUpperCase();
  return upper === "UYU" || upper === "USD" ? upper : null;
}

/** Redondea a 2 decimales (evita drift de punto flotante en sumas). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Consolida un conjunto de montos por moneda a USD SOLO si el contexto trae un
 * `exchangeRate` explícito. Sin TC visible, lanza — la consolidación silenciosa
 * está prohibida.
 */
export function consolidateCanonicalToUsd(
  amounts: readonly CanonicalMoney[],
  context: Pick<CanonicalFinancialContext, "exchangeRate">
): { total: number; rateLabel: string } {
  if (!context.exchangeRate) {
    throw new Error(
      "[canonical/currency] Consolidación a USD requiere exchangeRate explícito en el contexto."
    );
  }
  const rate = context.exchangeRate.rate;
  let total = 0;
  for (const m of amounts) {
    total += convertMoneyToUsd(m.amount, m.currency, rate);
  }
  return { total: roundUsd(total), rateLabel: formatExchangeRateLabel(rate) };
}
