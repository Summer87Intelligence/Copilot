/**
 * Conversión visual UYU + USD → USD equivalente (solo Dashboard).
 * No altera saldos ni reportes operativos.
 */

import {
  consolidateToUsd,
  formatExchangeRateLabel,
  roundUsd,
} from "@/lib/finance/currency-conversion";

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

export function readDashboardFxRateFromStorage(): number {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_FX_RATE_STORAGE_KEY);
    if (raw == null) return DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD;
    return parseDashboardFxRate(raw) ?? DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD;
  } catch {
    return DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD;
  }
}

export function writeDashboardFxRateToStorage(rate: number): boolean {
  if (typeof window === "undefined") return false;
  const parsed = parseDashboardFxRate(rate);
  if (parsed == null) return false;
  try {
    window.localStorage.setItem(DASHBOARD_FX_RATE_STORAGE_KEY, String(parsed));
    return true;
  } catch {
    return false;
  }
}

export function formatDashboardFxRateCompact(rate: number): string {
  const formatted = rate.toLocaleString("es-UY", {
    minimumFractionDigits: rate % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `1 USD = ${formatted} UYU`;
}
