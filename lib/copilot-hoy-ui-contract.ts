/**
 * Contrato visible de /copilot/hoy — solo UI, sin lógica financiera.
 */
export const HOY_UI = {
  showFinancialSituation: false,
  showPendingSection: false,
  showRecommendedActions: true,
  debtorPageSizeOptions: [10, 25, 50, 100] as const,
  defaultDebtorPageSize: 10,
} as const;

export const HOY_PAGE = {
  title: "Copilot · Hoy",
  description: "Caja, cobros urgentes y prioridad del día.",
} as const;

/** Cockpit financiero — bloques principales. */
export const HOY_COCKPIT = {
  moneyAvailable: "Caja disponible",
  receivables: "Total pendiente",
  payments: "Pagos próximos",
  afterPayments: "Caja proyectada 30d",
  receivablesTotalPending: "Total pendiente",
  receivablesOverdueTotal: "Atrasado",
  receivablesIncludedInTotal: "Incluido en Total pendiente",
  receivablesOverdue30: "Atrasado +30 días",
  receivablesOverdueTotalHint:
    "Parte del total pendiente cuya fecha de vencimiento ya pasó. Está incluida dentro del total pendiente.",
  receivablesOverdue30Hint:
    "Subconjunto del atrasado con más de 30 días. Ya está incluido dentro del atrasado y del total pendiente.",
  receivablesIncludedNote:
    "El atrasado está incluido dentro del total pendiente.",
  drawerClientsUyu: "Clientes en UYU",
  drawerClientsUsd: "Clientes en USD",
  criticalClients: "Principales deudores",
  viewCriticalClients: "Ver principales deudores",
  drawerCashSummary: "Caja actual registrada disponible para operar.",
  drawerPaymentsEmpty: "Detalle de pagos disponible en Tesorería.",
  drawerAfterPaymentsSummary:
    "Caja + cobros probables de cartera − pagos próximos 30 días (snapshot, no timeline semanal).",
  drawerViewTreasury: "Ver Tesorería",
  drawerViewProjection: "Ver proyección",
  drawerGoToCriticalClients: "Ver principales deudores",
  advancedTitle: "Detalle financiero del período",
  businessHealth: "Salud del negocio",
  todayPriorityTitle: "Tu día en una frase",
} as const;

/** Labels visibles en bloques UYU/USD. */
export const CURRENCY_METRIC_LABELS = {
  billed: "Ventas del período",
  collected: "Cobrado aplicado",
  pending: "Total pendiente",
  overdue30: "Atrasado +30 días",
} as const;

export const CURRENCY_METRIC_HELPERS = {
  billed: "Facturas emitidas en el período, neto de notas de crédito.",
  collected:
    "Parte de las ventas del período ya saldada al cierre del rango. Misma fuente que Cartera y Dashboard (no es la suma de recibos por fecha).",
  pending: "Saldo pendiente del período al cierre (= ventas − cobrado aplicado). El atrasado ya está incluido.",
  overdue30: "Parte del atrasado con más de 30 días. Ya está incluido dentro del atrasado y del total pendiente.",
} as const;

export const COLLECTION_EXCEEDS_BILLING_NOTE =
  "El cobrado aplicado supera las ventas del período; puede incluir imputaciones de facturas anteriores.";

/** Copy de secciones y CTAs (tests de contrato visible). */
export const HOY_COPY = {
  periodBarTitle: "Período de análisis",
  scopeBadgeCurrent: "Estado actual · Hoy",
  scopeBadgePeriod: "Actividad del período",
  scopeBadgeProjection: "Proyección · Próximos 30 días",
  currentStateTitle: "Estado actual · Hoy",
  currentReceivablesLabel: "Total pendiente",
  currentReceivablesTip: "Todo lo que los clientes deben actualmente. El atrasado ya está incluido.",
  activeDebtorsLabel: "Clientes con deuda",
  overdue30Short: "Atrasado +30 días",
  periodActivityTitle: "Actividad del período",
  periodBilledLabel: "Ventas del período",
  periodBilledTip: "Facturas emitidas en el período.",
  periodCollectedLabel: "Cobrado aplicado",
  periodCollectedTip:
    "Cobros imputados contra facturas del período: ventas netas menos saldo pendiente al cierre. No es la suma de recibos por fecha de cobro.",
  periodCreditNotesLabel: "Ajustes",
  periodManualIncomeLabel: "Ingresos manuales",
  periodManualExpenseLabel: "Egresos manuales",
  periodOperatingResultLabel: "Liquidez operativa",
  periodOperatingResultTip: "Cobrado + ingresos manuales − egresos manuales en el período.",
  debtorsSectionTitle: "Clientes con deuda",
  debtorsSectionRiskSubtitle: "Ordenados por antigüedad de mora.",
  /** Tooltip columna "Total pendiente" en la tabla de deudores. */
  debtTotalTip: "Total pendiente del cliente en esta moneda. El atrasado ya está incluido.",
  /** Tooltip columna "Atrasado". */
  debtOverdueTip: "Parte del total pendiente cuya fecha de vencimiento ya pasó.",
  /** Tooltip columna "Días de atraso". */
  debtOverdueDaysTip: "Días desde la factura vencida más antigua.",
  /** Tooltip columna "Al día" (total pendiente − atrasado). */
  debtAtDayTip: "Total pendiente todavía dentro del plazo.",
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
    "Los saldos principales están actualizados. Algunos detalles secundarios pueden actualizarse en el próximo sync.",
  agingDetailTitle: "Detalle del total pendiente por antigüedad",
  agingCurrentLabel: "Al día / hasta 30 días",
  agingOverdueLabel: "Atrasado +30 días",
  cashCurrentTitle: "Caja disponible",
  cashCurrentTip: "Viene de Tesorería y cobros posteriores al saldo cargado. Sin deuda de clientes.",
  cashCollectedLabel: "Cobros Zeta posteriores",
  cashCollectedTip: "Cobros de clientes registrados en Zeta después del saldo cargado.",
  availableCashLabel: "Caja disponible",
  availableCashEstimatedLabel: "Caja disponible",
  cashOpeningNote: "Configurá tu saldo actual en Tesorería para ver el dinero disponible.",
  cashLastMovementsTitle: "Últimos movimientos de caja",
  cashLastMovementsCaption: "Entrada y salida más reciente detectada por moneda.",
  lastIncomeLabel: "Última entrada de dinero",
  lastExpenseLabel: "Última salida de dinero",
  noIncomeRegistered: "Sin entradas registradas",
  noExpenseRegistered: "Sin salidas registradas",
  projection30Title: "Cobertura próximos pagos",
  projection30Tip:
    "Incluye ingresos, egresos, pagos programados y pagos generados por recurrentes. Escenario si cobrás lo pendiente.",
  /** @deprecated Usar `availableCashLabel`. */
  currentCashLabel: "Caja disponible",
  scheduledPaymentsLabel: "Pagos programados",
  safeCash30Label: "Cobertura 30 días",
  safeCash30Tip: "Caja disponible menos pagos programados. Sin deuda pendiente.",
  pendingReceivablesLabel: "Total pendiente",
  pendingReceivablesTip: "Todo lo que los clientes deben actualmente. El atrasado ya está incluido.",
  expectedCash30Label: "Cobros probables",
  expectedCash30Tip: "Caja disponible + total pendiente por cobrar − pagos programados.",
  scheduledOutflowsLabel: "Pagos programados",
  treasuryCta: "Configurar pagos futuros",
  treasuryNoOutflows: "Sin egresos configurados",
  weeklyProjectionTitle: "Proyección de caja semanal",
  weeklyProjectionTip:
    "Caja estimada cada viernes según cobros esperados y pagos cargados.",
} as const;

/** Semántica de color ejecutiva por métrica. */
export const CURRENCY_METRIC_TONES = {
  billed: "neutral",
  collected: "positive",
  pending: "warning",
  overdue30: "danger",
} as const;

export type CurrencyMetricToneKey = keyof typeof CURRENCY_METRIC_TONES;

/** UI: cobrado del período puede superar facturado (cobros de meses anteriores). */
export function shouldShowCollectionExceedsBillingNote(
  billedAmount: number | null | undefined,
  collectedAmount: number | null | undefined
): boolean {
  if (billedAmount == null || collectedAmount == null) return false;
  return billedAmount > 0 && collectedAmount > billedAmount;
}
