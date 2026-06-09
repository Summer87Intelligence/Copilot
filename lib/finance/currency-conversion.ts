/**
 * Conversión de monedas UYU ↔ USD para vista consolidada.
 * Solo UYU/USD. TC expresado como "UYU por 1 USD" (ej: 43.5 → 1 USD = 43.5 UYU).
 * Funciones puras — sin side effects ni I/O.
 */

/** Convierte UYU a USD usando el tipo de cambio dado. */
export function convertUyuToUsd(amountUyu: number, uyuPerUsd: number): number {
  if (uyuPerUsd <= 0) throw new Error("uyuPerUsd must be positive");
  return amountUyu / uyuPerUsd;
}

/** Convierte cualquier monto soportado a USD. USD queda igual. */
export function convertMoneyToUsd(
  amount: number,
  currency: "UYU" | "USD",
  uyuPerUsd: number
): number {
  if (currency === "USD") return amount;
  return convertUyuToUsd(amount, uyuPerUsd);
}

/**
 * Consolida arrays UYU + USD en un único total USD.
 * Suma: sumUSD + sumUYU / uyuPerUsd
 */
export function consolidateToUsd(
  amountUyu: number,
  amountUsd: number,
  uyuPerUsd: number
): number {
  if (!uyuPerUsd || uyuPerUsd <= 0) throw new Error("uyuPerUsd must be positive");
  return amountUsd + amountUyu / uyuPerUsd;
}

/** Formatea el label "TC usado: 1 USD = X,XX UYU" para mostrar en UI. */
export function formatExchangeRateLabel(uyuPerUsd: number): string {
  const formatted = uyuPerUsd.toLocaleString("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `1 USD = ${formatted} UYU`;
}

/** Redondea a 2 decimales (evita floating point drift en sumas consolidadas). */
export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
