/**
 * Contrato visible de /copilot/hoy — solo UI, sin lógica financiera.
 */
export const HOY_UI = {
  showFinancialSituation: false,
  showPendingSection: false,
  showRecommendedActions: false,
  initialDebtorTableRows: 10,
  debtorPageStep: 10,
} as const;

export const HOY_PAGE = {
  title: "Copilot · Hoy",
  description: "Caja, cobros y pagos al instante.",
} as const;

/** Cockpit financiero — bloques principales. */
export const HOY_COCKPIT = {
  moneyAvailable: "Caja disponible",
  receivables: "Clientes por cobrar",
  payments: "Pagos próximos",
  afterPayments: "Caja después de pagos",
  receivablesTotalPending: "Deuda total",
  receivablesIncludedInTotal: "Incluido en ese total",
  receivablesOverdue30: "Vencido >30 días",
  /** Vencido >30 forma parte del total pendiente; no es un monto adicional. */
  receivablesOverdue30Hint:
    "Ya está incluido en el total pendiente; no se suma aparte.",
  drawerClientsUyu: "Clientes en UYU",
  drawerClientsUsd: "Clientes en USD",
  criticalClients: "Clientes críticos",
  viewCriticalClients: "Ver clientes críticos",
  drawerCashSummary: "Caja actual registrada disponible para operar.",
  drawerPaymentsEmpty: "Detalle de pagos disponible en Tesorería.",
  drawerAfterPaymentsSummary: "Caja disponible menos pagos próximos.",
  drawerViewTreasury: "Ver Tesorería",
  drawerViewProjection: "Ver proyección",
  drawerGoToCriticalClients: "Ir a clientes críticos",
  advancedTitle: "Detalle financiero del período",
  businessHealth: "Salud del negocio",
  todayPriorityTitle: "Tu día en una frase",
} as const;

/** Labels visibles en bloques UYU/USD. */
export const CURRENCY_METRIC_LABELS = {
  billed: "Facturado neto del período",
  collected: "Cobrado en el período",
  pending: "Por cobrar",
  overdue30: "Saldo vencido >30 días",
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
  currentReceivablesLabel: "Por cobrar",
  currentReceivablesTip: "Deuda de clientes todavía no cobrada.",
  activeDebtorsLabel: "Clientes con deuda",
  overdue30Short: "Saldo vencido >30 días",
  periodActivityTitle: "Actividad del período",
  periodBilledLabel: "Facturado neto",
  periodBilledTip: "Facturas emitidas menos notas de crédito en el período.",
  periodCollectedLabel: "Cobrado",
  periodCollectedTip: "Cobros registrados en el período.",
  periodCreditNotesLabel: "Notas de crédito",
  periodManualIncomeLabel: "Ingresos manuales",
  periodManualExpenseLabel: "Egresos manuales",
  periodOperatingResultLabel: "Liquidez operativa",
  periodOperatingResultTip: "Cobrado + ingresos manuales − egresos manuales en el período.",
  debtorsSectionTitle: "Clientes con deuda",
  debtorsSectionSubtitle: "Todos los clientes con saldo pendiente, separados por moneda.",
  debtorsSectionRiskSubtitle: "Vencidos, >30 días o con seguimiento prioritario.",
  debtorsViewAllCartera: "Ver toda la cartera",
  debtorContactSectionTitle: "Contacto",
  debtorNoPhone: "Sin teléfono registrado",
  debtorNoEmail: "Sin email registrado",
  debtorWhatsApp: "Abrir WhatsApp",
  debtorSendEmail: "Enviar email",
  debtorViewProfile: "Ver ficha",
  attentionStripCta: "Ver casos",
  attentionDrawerTitle: "Clientes con señales de atraso",
  attentionDrawerSubtitle:
    "Clientes con deuda vencida, cobro lento o datos pendientes.",
  dataNotice:
    "Algunos datos secundarios están pendientes de actualización. Los saldos principales están disponibles.",
  agingDetailTitle: "Detalle de deuda por antigüedad",
  agingCurrentLabel: "Al día / hasta 30 días",
  agingOverdueLabel: "Atrasado +30 días",
  cashCurrentTitle: "Caja disponible",
  cashCurrentTip: "Viene de Tesorería y cobros posteriores al saldo cargado. Sin deuda de clientes.",
  cashCollectedLabel: "Cobros Zeta posteriores",
  cashCollectedTip: "Cobros de clientes registrados en Zeta después del saldo cargado.",
  availableCashLabel: "Caja disponible",
  availableCashEstimatedLabel: "Caja disponible",
  cashOpeningNote: "Configurá tu saldo actual en Tesorería para ver el dinero disponible.",
  projection30Title: "Próximos 30 días",
  projection30Tip: "Caja actual, pagos cargados y escenario si cobrás lo pendiente.",
  /** @deprecated Usar `availableCashLabel`. */
  currentCashLabel: "Caja disponible",
  scheduledPaymentsLabel: "Pagos programados",
  safeCash30Label: "Cobertura 30 días",
  safeCash30Tip: "Caja disponible menos pagos programados. Sin deuda pendiente.",
  pendingReceivablesLabel: "Por cobrar",
  pendingReceivablesTip: "Deuda de clientes todavía no cobrada.",
  expectedCash30Label: "Escenario de cobranza",
  expectedCash30Tip: "Caja disponible + por cobrar − pagos programados.",
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
