/**
 * Contrato visible de /copilot/hoy — solo UI, sin lógica financiera.
 */
export const HOY_UI = {
  /** Situación financiera duplica bloques UYU/USD; no se muestra en hoy. */
  showFinancialSituation: false,
  maxPendingItems: 4,
  maxPriorityDebtorRows: 8,
} as const;

/** Labels visibles en bloques UYU/USD. */
export const CURRENCY_METRIC_LABELS = {
  billed: "Facturado neto",
  collected: "Cobrado",
  pending: "Falta cobrar",
  critical30: "Crítico +30 días",
} as const;

/** Semántica de color ejecutiva por métrica. */
export const CURRENCY_METRIC_TONES = {
  billed: "neutral",
  collected: "positive",
  pending: "warning",
  critical30: "danger",
} as const;

export type CurrencyMetricToneKey = keyof typeof CURRENCY_METRIC_TONES;
