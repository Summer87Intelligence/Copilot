/**
 * Contrato visible de /copilot/hoy — solo UI, sin lógica financiera.
 */
export const HOY_UI = {
  showFinancialSituation: false,
  maxPendingItems: 3,
  maxDebtorTableRows: 8,
  /** No renderizar barra de acciones recomendadas en la página. */
  showRecommendedActions: false,
} as const;

/** Labels visibles en bloques UYU/USD. */
export const CURRENCY_METRIC_LABELS = {
  billed: "Facturado neto",
  collected: "Cobrado",
  pending: "Por cobrar",
  overdue30: "Vencido +30 días",
} as const;

/** Copy de secciones y CTAs (tests de contrato visible). */
export const HOY_COPY = {
  debtorsSectionTitle: "Deudores a revisar",
  attentionStripTitle: "clientes con señales de atraso",
  attentionDrawerTitle: "Clientes con señales de atraso",
  pendingSectionTitle: "Casos a revisar hoy",
  dataNotice:
    "Algunos datos están pendientes de actualización. Los saldos principales están disponibles.",
  agingDetailTitle: "Detalle de deuda por antigüedad",
} as const;

/** Semántica de color ejecutiva por métrica. */
export const CURRENCY_METRIC_TONES = {
  billed: "neutral",
  collected: "positive",
  pending: "warning",
  overdue30: "danger",
} as const;

export type CurrencyMetricToneKey = keyof typeof CURRENCY_METRIC_TONES;
