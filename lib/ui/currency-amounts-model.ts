/**
 * Modelo puro para presentar importes multi-moneda SIEMPRE separados.
 *
 * Regla del sistema: UYU y USD nunca se concatenan en una misma línea
 * (`$… · U$S…`). Cada moneda con saldo (> 0) es su propia línea/valor, UYU
 * primero. En modo equivalente USD se colapsa a un único importe convertido.
 */

export type CurrencyCode = "UYU" | "USD";

export type CurrencyAmountLine = { currency: CurrencyCode; formatted: string };

export type CurrencyMoneyFormatter = (amount: number, currency: CurrencyCode) => string;

/** Líneas por moneda con saldo (> 0), UYU primero. Sin saldo → arreglo vacío. */
export function buildSeparatedCurrencyValues(
  uyu: number,
  usd: number,
  format: CurrencyMoneyFormatter
): CurrencyAmountLine[] {
  const out: CurrencyAmountLine[] = [];
  if (uyu > 0) out.push({ currency: "UYU", formatted: format(uyu, "UYU") });
  if (usd > 0) out.push({ currency: "USD", formatted: format(usd, "USD") });
  return out;
}

/** true si hay algún importe positivo en cualquiera de las dos monedas. */
export function hasAnyAmount(uyu: number, usd: number): boolean {
  return uyu > 0 || usd > 0;
}
