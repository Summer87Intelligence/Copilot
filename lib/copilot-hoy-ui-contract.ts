/**
 * Contrato visible de /copilot/hoy — solo UI, sin lógica financiera.
 */
export const HOY_UI = {
  showFinancialSituation: false,
  showPendingSection: false,
  showRecommendedActions: true,
  debtorPageSizeOptions: [25, 50, 100] as const,
  defaultDebtorPageSize: 25,
} as const;

export const HOY_PAGE = {
  title: "Copilot · Hoy",
  description: "Operación diaria: caja, cobros urgentes y prioridad del día.",
} as const;

/** Cockpit financiero — bloques principales. */
export const HOY_COCKPIT = {
  moneyAvailable: "Caja disponible",
  receivables: "Deuda de clientes",
  payments: "Pagos próximos",
  afterPayments: "Caja proyectada",
  receivablesTotalPending: "Deuda actual",
  receivablesOverdueTotal: "Deuda vencida",
  receivablesIncludedInTotal: "Incluido en Deuda actual",
  receivablesOverdue30: "Deuda vencida >30 días",
  receivablesOverdueTotalHint:
    "Facturas con vencimiento anterior a hoy; ya incluida en Deuda actual.",
  receivablesOverdue30Hint:
    "Subconjunto con más de 30 días de atraso; no se suma aparte.",
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
  billed: "Ventas del período",
  collected: "Cobrado del período",
  pending: "Deuda actual",
  overdue30: "Deuda vencida >30 días",
} as const;

export const CURRENCY_METRIC_HELPERS = {
  billed: "Facturas emitidas en el período.",
  collected:
    "Importe cobrado en el período según criterio del Dashboard. Puede incluir cobros de facturas anteriores.",
  pending: "Total de deuda abierta al día de hoy.",
  overdue30: "Parte de la deuda vencida con más de 30 días de atraso.",
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
  currentReceivablesLabel: "Deuda actual",
  currentReceivablesTip: "Deuda de clientes todavía no cobrada.",
  activeDebtorsLabel: "Clientes con deuda",
  overdue30Short: "Deuda vencida >30 días",
  periodActivityTitle: "Actividad del período",
  periodBilledLabel: "Ventas del período",
  periodBilledTip: "Facturas emitidas en el período.",
  periodCollectedLabel: "Cobrado del período",
  periodCollectedTip:
    "Importe cobrado dentro del período seleccionado según el criterio financiero del Dashboard. Puede diferir de Cobros aplicados a facturas en Cartera.",
  periodCreditNotesLabel: "Ajustes",
  periodManualIncomeLabel: "Ingresos manuales",
  periodManualExpenseLabel: "Egresos manuales",
  periodOperatingResultLabel: "Liquidez operativa",
  periodOperatingResultTip: "Cobrado + ingresos manuales − egresos manuales en el período.",
  debtorsSectionTitle: "Clientes con deuda",
  debtorsSectionSubtitle:
    "Todos los clientes con deuda actual, separados por moneda. Los totales superiores son la deuda actual total del negocio.",
  debtorsSectionRiskSubtitle: "Clientes con deuda sincronizada desde Zeta. Ordenados por antigüedad de mora.",
  /** Tooltip columna "Deuda actual" en la tabla de deudores. */
  debtTotalTip: "Deuda actual del cliente en esta moneda.",
  /** Tooltip columna "Deuda vencida". */
  debtOverdueTip: "Parte de la deuda actual cuya fecha de vencimiento ya pasó.",
  /** Tooltip columna "Días de atraso". */
  debtOverdueDaysTip: "Días desde la factura vencida más antigua.",
  /** Tooltip columna "Al día" (deuda total − deuda vencida). */
  debtAtDayTip: "Deuda actual todavía dentro del plazo.",
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
  lastIncomeLabel: "Último ingreso",
  lastExpenseLabel: "Último egreso",
  noIncomeRegistered: "No hay ingresos registrados",
  noExpenseRegistered: "No hay egresos registrados",
  projection30Title: "Próximos 30 días",
  projection30Tip: "Caja actual, pagos cargados y escenario si cobrás lo pendiente.",
  /** @deprecated Usar `availableCashLabel`. */
  currentCashLabel: "Caja disponible",
  scheduledPaymentsLabel: "Pagos programados",
  safeCash30Label: "Cobertura 30 días",
  safeCash30Tip: "Caja disponible menos pagos programados. Sin deuda pendiente.",
  pendingReceivablesLabel: "Deuda actual",
  pendingReceivablesTip: "Deuda de clientes todavía no cobrada.",
  expectedCash30Label: "Escenario de cobranza",
  expectedCash30Tip: "Caja disponible + por cobrar − pagos programados.",
  scheduledOutflowsLabel: "Pagos programados",
  treasuryCta: "Configurar pagos futuros",
  treasuryNoOutflows: "Sin egresos configurados",
  monthEndProjectionTitle: "Caja proyectada al cierre del mes",
  monthEndMvpBadge: "Estimación inicial",
  monthEndScenarioSubtitle: {
    conservative:
      "Escenario conservador: asume cobro parcial (50%) de la deuda pendiente y pagos programados cargados.",
    expected:
      "Escenario esperado: asume cobro parcial de la deuda pendiente y pagos programados cargados.",
    optimistic:
      "Escenario optimista: asume cobro total (100%) de la deuda pendiente y pagos programados cargados.",
  },
  monthEndProjectionTip:
    "Caja disponible + cobros estimados del escenario − pagos programados hasta fin de mes.",
  monthEndFridaysTitle: "Próximos viernes",
  monthEndFridaysTip:
    "Los cobros se distribuyen de forma pareja en esta versión inicial (MVP). Más adelante se ajustará al comportamiento real de pago de cada cliente.",
  monthEndDrawerCta: "Ver cómo se calcula",
  monthEndDrawerTitle: "Cómo se calcula la caja del mes",
  monthEndDrawerScenariosNote:
    "Los escenarios usan porcentajes fijos como MVP: 50%, 75% y 100%. La siguiente versión usará comportamiento histórico de clientes.",
  monthEndDrawerLinearNote:
    "Los cobros estimados se reparten de forma lineal hasta fin de mes dentro de cada escenario.",
  monthEndRiskStable: "Estable",
  monthEndRiskAttention: "Atención",
  monthEndRiskCritical: "Crítico",
  monthEndRiskNoteStable: "Sin alerta",
  monthEndRiskNoteAttention: "Margen bajo",
  monthEndRiskNoteCritical: "Caja negativa",
  monthEndDrawerRisksTitle: "Riesgos detectados",
  monthEndOverallStable:
    "La estimación al cierre del mes se ve estable con los datos cargados.",
  monthEndOverallAttention:
    "La estimación muestra margen bajo en alguna moneda. Revisá cobros y pagos programados.",
  monthEndOverallCritical:
    "La estimación proyecta caja negativa en alguna moneda antes o al cierre del mes.",
  monthEndTreasuryCta: "Ver Tesorería",
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
