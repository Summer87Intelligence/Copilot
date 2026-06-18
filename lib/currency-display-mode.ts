/**
 * Infraestructura para modo de visualización de moneda — "nativo" (UYU/USD separados)
 * vs "USD equivalente" (total visual: USD + UYU/TC).
 *
 * Solo visual. No modifica saldos ni reportes operativos.
 */

import { consolidateToUsd, roundUsd } from "@/lib/finance/currency-conversion";

export type CurrencyDisplayMode = "native" | "usd_equivalent";

export type CurrencyAmount = {
  uyu: number;
  usd: number;
};

export const DEFAULT_CURRENCY_DISPLAY_MODE: CurrencyDisplayMode = "native";
export const DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD = 40;

export const CURRENCY_DISPLAY_MODE_STORAGE_KEY = "copilot.currencyDisplayMode";
export const CURRENCY_DISPLAY_FX_RATE_STORAGE_KEY = "copilot.currencyDisplayFxRate";

/** Clamps to [1, 999]. Falls back to default for invalid input. */
export function normalizeFxRate(input: unknown): number {
  const n =
    typeof input === "number"
      ? input
      : Number(String(input ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 1000) return DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
  return n;
}

/** Returns USD + UYU/TC, rounded to 2 decimals. */
export function convertToUsdEquivalent(amount: CurrencyAmount, uyuPerUsd: number): number {
  const rate = normalizeFxRate(uyuPerUsd);
  return roundUsd(consolidateToUsd(amount.uyu, amount.usd, rate));
}

/** "~USD 1,234.56" — visual label for consolidated amounts. */
export function formatUsdEquivalent(totalUsd: number): string {
  return `~USD ${totalUsd.toLocaleString("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function readDisplayModeFromStorage(): CurrencyDisplayMode {
  if (typeof window === "undefined") return DEFAULT_CURRENCY_DISPLAY_MODE;
  try {
    const raw = window.localStorage.getItem(CURRENCY_DISPLAY_MODE_STORAGE_KEY);
    if (raw === "native" || raw === "usd_equivalent") return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_CURRENCY_DISPLAY_MODE;
}

export function writeDisplayModeToStorage(mode: CurrencyDisplayMode): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CURRENCY_DISPLAY_MODE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export function readDisplayFxRateFromStorage(): number {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
  try {
    const raw = window.localStorage.getItem(CURRENCY_DISPLAY_FX_RATE_STORAGE_KEY);
    if (raw == null) return DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
    return normalizeFxRate(raw);
  } catch {
    return DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
  }
}

export function writeDisplayFxRateToStorage(rate: number): boolean {
  if (typeof window === "undefined") return false;
  const n = normalizeFxRate(rate);
  try {
    window.localStorage.setItem(CURRENCY_DISPLAY_FX_RATE_STORAGE_KEY, String(n));
    return true;
  } catch {
    return false;
  }
}
