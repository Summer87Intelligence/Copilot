/**
 * Dinero en minor units (enteros) para el motor shadow. Sin float en scoring.
 */

export function toMinorUnits(amountMajor: number): number {
  if (!Number.isFinite(amountMajor)) return 0;
  return Math.round(amountMajor * 100);
}

export function fromMinorUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

export function normalizeCurrency(raw: string | null | undefined): "UYU" | "USD" | null {
  const c = String(raw ?? "").trim().toUpperCase();
  if (c === "UYU" || c === "USD") return c;
  return null;
}
