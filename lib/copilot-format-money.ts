export type SupportedCurrencyCode = "UYU" | "USD" | string;

const CURRENCY_DISPLAY: Record<string, string> = {
  UYU: "$",
  USD: "U$S",
};

/** Normaliza un código de moneda a uppercase. Devuelve "UYU" si el valor está vacío o ausente. */
export function normalizeCurrencyCode(currency?: string | null): string {
  if (!currency?.trim()) return "UYU";
  return currency.toUpperCase().trim();
}

/** Símbolo de display para el mercado UY: "UYU" → "$", "USD" → "U$S", otros → raw code. */
export function getCurrencyLabel(currency?: string | null): string {
  const code = normalizeCurrencyCode(currency);
  return CURRENCY_DISPLAY[code] ?? code;
}

/**
 * Formatea un monto con el símbolo correcto para el mercado UY.
 *
 * UYU → "$ 196.731"      (0 decimales por defecto)
 * USD → "U$S 7.835,41"   (2 decimales por defecto)
 * null/undefined          → trata como 0
 * NaN / Infinity          → trata como 0
 *
 * @param compact — fuerza 0 decimales independientemente de la moneda
 * @param fallbackCurrency — moneda a usar si `currency` es null/undefined
 * @param showCurrencyCode — agrega el código entre paréntesis: "U$S 100 (USD)"
 */
export function formatMoneyCurrency(
  amount: number | null | undefined,
  currency?: string | null,
  options?: {
    compact?: boolean;
    fallbackCurrency?: "UYU" | "USD";
    showCurrencyCode?: boolean;
  }
): string {
  const resolved = currency ?? options?.fallbackCurrency ?? null;
  const code = normalizeCurrencyCode(resolved);
  const symbol = getCurrencyLabel(code);
  const n = amount == null || !Number.isFinite(amount as number) ? 0 : (amount as number);
  const maxDecimals = options?.compact ? 0 : code === "USD" ? 2 : 0;
  const formatted = n.toLocaleString("es-UY", { maximumFractionDigits: maxDecimals });
  if (options?.showCurrencyCode) return `${symbol} ${formatted} (${code})`;
  return `${symbol} ${formatted}`;
}
