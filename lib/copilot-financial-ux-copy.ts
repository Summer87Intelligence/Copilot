export const FINANCIAL_UX_COPY = {
  warningTitle: "Datos consolidados desde Zeta",
  warningBody: "Saldos y movimientos al corte según la última sincronización con Zeta.",
  reportWarningBody: "Reporte con datos de Zeta al momento de la exportación.",
  sourceInfoTitle: "Fuente del dato",
  sourceInfoBody: "Saldos pendientes y movimientos sincronizados desde Zeta.",
  invoiceOpenTitle: "Factura con saldo pendiente",
  invoiceOpenBody: "Saldo pendiente registrado en Zeta al último sync.",
  notClosed: "Período en curso",
  noOpenBalanceNotValidated: "Sin saldo pendiente",
  noOpenBalanceInActiveInvoices: "Sin saldo pendiente en facturas activas.",
  pendingValidation: "Pendiente de conciliación",
  externalValidationRegisteredBadge: "Conciliación registrada",
  externalValidationWithOpenAux:
    "Hay conciliación registrada y saldo pendiente visible en esta vista.",
  closedValidated: "Período cerrado",
  freshnessFresh: "Datos al día",
  freshnessWarning: "Última sync hace más de lo habitual",
  freshnessStale: "Datos desactualizados",
  exportModalTitle: "Exportar reporte",
  exportModalBody: "El PDF refleja el período y moneda seleccionados en pantalla.",
  exportModalAcknowledge: "Confirmo la exportación del reporte.",
  exportModalCancel: "Cancelar",
  exportModalConfirm: "Exportar reporte",
  rowCapWarningTitle: "Límite de filas alcanzado",
  rowCapWarningBody:
    "Se procesó el máximo de filas permitido. Contactá soporte si necesitás ampliar la ventana de datos.",
  preSyncBannerTitle: "Período histórico parcial",
  preSyncBannerBody:
    "El rango incluye facturación anterior al inicio de sincronización (2026-01-01). Los cobros de ese tramo pueden no estar cargados.",
  projection30Subtitle:
    "Proyección basada en caja actual, cobros esperados y pagos registrados.",
  projectionScenarioLabel: "Caja proyectada",
  projectionMissingPaymentsCta: "Cargá pagos próximos para completar la proyección.",
  emptyPeriodMovements: "No hay movimientos para el período seleccionado.",
  historicalPartialBadge: "Histórico parcial",
  kpiIssuedTooltip:
    "Suma de facturas emitidas dentro del rango seleccionado.",
  kpiCollectedTooltip:
    "Pagos registrados en el sistema desde el inicio operativo de sincronización.",
  kpiPendingTooltip:
    "Saldo vivo actual informado por Zeta al momento del último sync. Refleja todos los pagos históricos conocidos por Zeta.",
  kpiEffectivenessTooltip:
    "Relación entre facturación emitida y cobranzas registradas dentro del período.",
  kpiEffectivenessTooltipPreSync:
    "Relación entre facturación emitida y cobranzas registradas dentro del período. El tramo previo a 2026-01-01 puede tener cobros históricos fuera del sync.",
  kpiGrossIssuedTooltip:
    "Suma de facturas emitidas en el período. Base de facturación del período.",
  kpiCreditNotesAppliedTooltip:
    "Ajustes de facturación del período. Reducen lo facturado pero no representan ingreso de caja.",
  kpiCollectedAppliedLabel: "Cobrado aplicado",
  kpiCollectedAppliedTooltip:
    "Cobros imputados contra facturas emitidas en el período: facturado neto menos saldo pendiente al cierre del rango. Misma fuente que Cartera.",
  carteraResumenFinancieroHelp:
    "Misma base que Dashboard: ventas, cobrado aplicado y deuda del rango.",
  kpiNetEffectivenessTooltip:
    "Recibos cobrados / Facturado neto. Mide qué fracción de lo facturado fue cobrada en el período según recibos sincronizados de Zeta.",
  kpiNetEffectivenessTooltipPreSync:
    "Recibos cobrados / Facturado neto. El tramo previo a 2026-01-01 puede tener cobros históricos fuera del sync.",
} as const;

/** Copy específico de /copilot/finanzas — panorama ejecutivo. */
export const FINANZAS_COPY = {
  heroSubtitle:
    "Combina foto actual de caja y deuda con evolución mensual por fecha de comprobante y recibo.",
  heroRiskNote:
    "Estado operativo (Hoy) = señales de trabajo pendiente. Riesgo financiero (Finanzas) = lectura de caja y deuda.",
  summaryVentasTooltip: "Facturas emitidas en el mes cerrado seleccionado, neto de notas de crédito.",
  summaryCobrosTooltip:
    "Recibos con fecha dentro del mes. Cobros registrados son los recibos por fecha — pueden corresponder a facturas de meses anteriores.",
  summaryDeudaTooltip:
    "Total pendiente actual de clientes al corte. Incluye todos los períodos. El atrasado ya está dentro.",
  summaryDeudaVencidaTooltip:
    "Parte del total pendiente cuya fecha de vencimiento ya pasó.",
  summaryEstadoTooltip:
    "Lectura financiera de caja, deuda y cobranza. Distinto del estado operativo del día en Hoy.",
  summaryCajaTooltip: "Caja disponible registrada en Tesorería al corte.",
  comparisonTitle: "Ventas vs cobros registrados",
  comparisonSubtitle:
    "Meses cerrados por fecha de comprobante y fecha de recibo. La diferencia no equivale a deuda.",
  comparisonGapTooltip:
    "Diferencia operativa: ventas menos cobros registrados del mes. No equivale a deuda — los cobros pueden corresponder a facturas de otros meses.",
  evolutionTitle: "Evolución mensual de ventas y cobros registrados",
  evolutionSubtitle: "Ventas por fecha de factura y cobros registrados por fecha de recibo.",
  evolutionCollectionsExceed:
    "Los cobros registrados superan las ventas del mes; pueden incluir facturas de meses anteriores.",
  evolutionPartialMonth:
    "El mes en curso está parcial; no compararlo contra meses cerrados.",
  collectionRiskTitle: "Riesgo de cobro",
  collectionRiskSubtitle: "Clientes y montos atrasados al corte.",
  projectionExpectedCollectionsTooltip:
    "Cobros probables según historial de pago y plazos de cobro registrados.",
  projectionScenarioTooltip: "Caja disponible + cobros probables − pagos programados.",
  advancedDetailSubtitle:
    "Clientes, moneda y evolución para revisión ejecutiva.",
  labelCobrosRegistrados: "Cobros registrados",
  labelCobradoAplicado: "Cobrado aplicado",
  labelDiferenciaOperativa: "Diferencia operativa del mes",
  labelDeudaHoy: "Total pendiente",
  labelDeudaVencidaHoy: "Atrasado",
  labelCajaHoy: "Caja disponible",
} as const;
