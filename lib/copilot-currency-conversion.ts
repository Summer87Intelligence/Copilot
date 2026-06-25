/**
 * Conversión visual UYU + USD → USD equivalente (solo Dashboard).
 * No altera saldos ni reportes operativos.
 */

import {
  consolidateToUsd,
  formatExchangeRateLabel,
  roundUsd,
} from "@/lib/finance/currency-conversion";
import {
  readDisplayFxRateFromStorage,
  writeDisplayFxRateToStorage,
} from "@/lib/currency-display-mode";

export const DASHBOARD_FX_RATE_STORAGE_KEY = "copilot.dashboard.fxRateUyuPerUsd";
export const DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD = 40;

export const DASHBOARD_USD_CONSOLIDATED_DISCLAIMER =
  "Conversión visual para análisis ejecutivo. No modifica saldos ni reportes.";

export { formatExchangeRateLabel, roundUsd };

/** Parsea TC UYU por 1 USD (acepta 40, 40.5, 39.75). */
export function parseDashboardFxRate(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 1000) return null;
  return n;
}

/**
 * total_usd_equivalent = usd_amount + (uyu_amount / uyu_per_usd)
 */
export function consolidateToUsdEquivalent(
  usdAmount: number,
  uyuAmount: number,
  uyuPerUsd: number
): number {
  return roundUsd(consolidateToUsd(uyuAmount, usdAmount, uyuPerUsd));
}

/** @deprecated Use readDisplayFxRateFromStorage from currency-display-mode instead. */
export function readDashboardFxRateFromStorage(): number {
  return readDisplayFxRateFromStorage();
}

/** @deprecated Use writeDisplayFxRateToStorage from currency-display-mode instead. */
export function writeDashboardFxRateToStorage(rate: number): boolean {
  const parsed = parseDashboardFxRate(rate);
  if (parsed == null) return false;
  return writeDisplayFxRateToStorage(parsed);
}

export function formatDashboardFxRateCompact(rate: number): string {
  const formatted = rate.toLocaleString("es-UY", {
    minimumFractionDigits: rate % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `1 USD = ${formatted} UYU`;
}
