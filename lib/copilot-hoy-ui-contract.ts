/**
 * Contrato visible de /copilot/hoy — solo UI, sin lógica financiera.
 */
export const HOY_UI = {
  showFinancialSituation: false,
  showPendingSection: false,
  showRecommendedActions: false,
  initialDebtorTableRows: 8,
} as const;

export const HOY_PAGE = {
  title: "Hoy en la empresa",
  description: "Estado actual, actividad del período y proyección de caja.",
} as const;

/** Labels visibles en bloques UYU/USD. */
export const CURRENCY_METRIC_LABELS = {
  billed: "Facturado neto del período",
  collected: "Cobrado en el período",
  pending: "Por cobrar",
  overdue30: "Atrasado +30 días",
} as const;

export const CURRENCY_METRIC_HELPERS = {
  billed: "Facturas emitidas menos notas de crédito.",
  collected: "Cobros registrados en el período. Puede incluir facturas de meses anteriores.",
  pending: "Total de deuda abierta al día de hoy.",
  overdue30: "Parte de la deuda abierta con más de 30 días de atraso.",
} as const;

export const COLLECTION_EXCEEDS_BILLING_NOTE =
  "Cobraste más de lo facturado en el período porque hay cobros de facturas anteriores.";

/** Copy de secciones y CTAs (tests de contrato visible). */
export const HOY_COPY = {
  periodBarTitle: "Período de análisis",
  scopeBadgeCurrent: "Estado actual · Hoy",
  scopeBadgePeriod: "Actividad del período",
  scopeBadgeProjection: "Proyección · Próximos 30 días",
  currentStateTitle: "Estado actual · Hoy",
  currentReceivablesLabel: "Por cobrar actual",
  currentReceivablesHelper: "Deuda de clientes todavía no cobrada.",
  activeDebtorsLabel: "Clientes con deuda activa",
  periodActivityTitle: "Actividad del período",
  periodBilledLabel: "Facturado neto del período",
  periodCollectedLabel: "Cobrado en el período",
  periodCreditNotesLabel: "Notas de crédito del período",
  periodManualIncomeLabel: "Ingresos manuales del período",
  periodManualExpenseLabel: "Egresos manuales del período",
  periodOperatingResultLabel: "Resultado operativo del período",
  periodOperatingResultHelper: "Cobrado + ingresos manuales − egresos manuales.",
  debtorsSectionTitle: "Clientes con deuda",
  debtorsSectionSubtitle: "Todos los clientes con saldo pendiente, separados por moneda.",
  attentionStripTitle: "clientes con señales de atraso",
  attentionDrawerTitle: "Clientes con señales de atraso",
  attentionDrawerSubtitle:
    "Clientes con deuda vencida, cobro lento o datos pendientes.",
  dataNotice:
    "Algunos datos secundarios están pendientes de actualización. Los saldos principales están disponibles.",
  agingDetailTitle: "Detalle de deuda por antigüedad",
  agingCurrentLabel: "Al día / hasta 30 días",
  agingOverdueLabel: "Atrasado +30 días",
  cashCurrentTitle: "Caja disponible estimada",
  cashCurrentHelper:
    "Cobros acumulados + movimientos manuales. No incluye deuda pendiente.",
  cashCollectedLabel: "Cobrado acumulado por clientes",
  cashCollectedHelper:
    "Cobros registrados hasta hoy. Puede incluir cobros de períodos anteriores.",
  availableCashLabel: "Caja disponible estimada",
  cashOpeningNote: "Sin saldo inicial opcional.",
  projection30Title: "Proyección · Próximos 30 días",
  projection30Subtitle:
    "Caja disponible hoy vs escenarios con cobros pendientes y pagos programados.",
  /** @deprecated Usar `availableCashLabel`. */
  currentCashLabel: "Caja disponible estimada",
  scheduledPaymentsLabel: "Pagos programados",
  safeCash30Label: "Caja segura 30 días",
  safeCash30Helper:
    "Caja disponible menos pagos programados. No incluye deuda pendiente.",
  pendingReceivablesLabel: "Por cobrar",
  pendingReceivablesHelper: "Deuda de clientes todavía no cobrada.",
  expectedCash30Label: "Caja esperada si se cobra",
  expectedCash30Helper: "Caja disponible + por cobrar − pagos programados.",
  scheduledOutflowsLabel: "Pagos programados",
  treasuryCta: "Configurar pagos futuros",
  treasuryNoOutflows: "Sin egresos configurados",
} as const;

/** Semántica de color ejecutiva por métrica. */
export const CURRENCY_METRIC_TONES = {
  billed: "neutral",
  collected: "positive",
  pending: "warning",
  overdue30: "danger",
} as const;

export type CurrencyMetricToneKey = keyof typeof CURRENCY_METRIC_TONES;

/** UI: cobrado del período puede superar facturado neto (cobros de meses anteriores). */
export function shouldShowCollectionExceedsBillingNote(
  billedAmount: number | null | undefined,
  collectedAmount: number | null | undefined
): boolean {
  if (billedAmount == null || collectedAmount == null) return false;
  return billedAmount > 0 && collectedAmount > billedAmount;
}
