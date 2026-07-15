/**
 * Modelo puro de `FinancialMetricCard` (DS-Core).
 *
 * Sin JSX ni tokens de estilo: solo tipos + helpers deterministas, testeables
 * en entorno node. La card visual consume estos helpers.
 *
 * Regla de moneda: UYU y USD SIEMPRE apilados y separados, UYU primero. Nunca
 * se combinan en una sola línea (coherente con Hoy / Finanzas / Cartera).
 */

export type MetricTone = "neutral" | "positive" | "warning" | "danger";

export type MetricCurrency = "UYU" | "USD";

export type MetricCurrencyValue = {
  currency: MetricCurrency;
  /** Monto ya formateado por el caller (ej. "$ 712.311", "U$S 4.461"). */
  formatted: string;
};

const CURRENCY_ORDER: Record<MetricCurrency, number> = { UYU: 0, USD: 1 };

/** UYU antes que USD. No combina monedas. */
export function sortMetricCurrencyValues(
  values: readonly MetricCurrencyValue[]
): MetricCurrencyValue[] {
  return [...values].sort((a, b) => CURRENCY_ORDER[a.currency] - CURRENCY_ORDER[b.currency]);
}

const TONE_VALUE_CLASS: Record<MetricTone, string> = {
  neutral: "text-[var(--copilot-ink)]",
  positive: "text-[var(--copilot-success-text-strong)]",
  warning: "text-[var(--copilot-warning-text-strong)]",
  danger: "text-[var(--copilot-danger-text-strong)]",
};

/** Clase de color para el monto principal según tono. */
export function metricValueToneClass(tone: MetricTone): string {
  return TONE_VALUE_CLASS[tone];
}

const TONE_FOOTNOTE_CLASS: Record<MetricTone, string> = {
  neutral: "text-[var(--copilot-ink-muted)]",
  positive: "text-[var(--copilot-success-text-strong)]",
  warning: "text-[var(--copilot-warning-text-strong)]",
  danger: "text-[var(--copilot-danger-text-strong)]",
};

/** Clase de color para la nota al pie según tono. */
export function metricFootnoteToneClass(tone: MetricTone): string {
  return TONE_FOOTNOTE_CLASS[tone];
}
