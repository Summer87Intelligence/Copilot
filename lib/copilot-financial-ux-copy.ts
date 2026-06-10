export const FINANCIAL_UX_COPY = {
  warningTitle: "Saldo operativo, no cierre financiero",
  warningBody:
    "Estos datos reflejan saldos operativos de Zeta (saldos pendientes). Para confirmar cierre financiero del período, validá con el export oficial de Zeta.",
  reportWarningBody:
    "Los totales mostrados son operativos. No usar este reporte como certificación de cierre financiero sin conciliación con export oficial de Zeta.",
  sourceInfoTitle: "Fuente del dato",
  sourceInfoBody:
    "Saldo operativo: Zeta saldos pendientes. Cierre financiero: export oficial de Zeta.",
  invoiceOpenTitle: "Factura con saldo operativo pendiente",
  invoiceOpenBody:
    "Esta factura figura abierta en saldos pendientes de Zeta. No interpretar como cierre/no cierre contable definitivo sin export oficial.",
  notClosed: "Período no cerrado",
  /** Sin facturas con saldo operativo pendiente; no implica cierre financiero validado. */
  noOpenBalanceNotValidated: "Sin saldo (no validado)",
  noOpenBalanceInActiveInvoices: "Sin saldo (no validado) en facturas activas.",
  pendingValidation: "Pendiente validación externa",
  externalValidationRegisteredBadge: "Validación externa registrada",
  externalValidationWithOpenAux:
    "Existe validación externa, pero aún hay saldo operativo abierto en esta vista.",
  closedValidated: "Cerrado validado",
  freshnessFresh: "Datos al día",
  freshnessWarning: "Datos con posible desfase",
  freshnessStale: "Datos desactualizados",
  exportModalTitle: "Antes de exportar",
  exportModalBody:
    "Estás exportando un reporte operativo. Para decisiones de cierre financiero, debés validarlo con export oficial de Zeta.",
  exportModalAcknowledge:
    "Entiendo que este reporte no certifica cierre financiero.",
  exportModalCancel: "Cancelar",
  exportModalConfirm: "Exportar reporte operativo",
  rowCapWarningTitle: "Datos potencialmente incompletos",
  rowCapWarningBody:
    "Los datos pueden estar incompletos porque se alcanzó el límite máximo de filas procesadas. Los KPIs financieros pueden estar subestimados. Contactá soporte para ampliar la ventana de datos.",
  preSyncBannerTitle: "Período histórico parcial",
  preSyncBannerBody:
    "El rango seleccionado incluye facturación previa al inicio operativo de sincronización (2026-01-01). Algunas cobranzas históricas podrían no estar disponibles en el sistema.",
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
    "Relación entre facturación emitida y cobranzas registradas dentro del período. Puede estar subestimado si el período incluye facturas anteriores al inicio operativo de sincronización.",
  kpiGrossIssuedTooltip:
    "Suma de facturas emitidas en el período. Base de facturación del período.",
  kpiCreditNotesAppliedTooltip:
    "Ajustes de facturación del período. Reducen lo facturado pero no representan ingreso de caja.",
  kpiCollectedAppliedLabel: "Cobros aplicados a facturas",
  kpiCollectedAppliedTooltip:
    "Importe de cobros aplicados a facturas dentro del período seleccionado. No representa necesariamente el total cobrado mostrado en Dashboard.",
  carteraResumenFinancieroHelp:
    "Las métricas de Cartera muestran deuda y cobros aplicados a facturas. Pueden diferir de los indicadores operativos mostrados en Dashboard.",
  dashboardCobradoPeriodoTooltip:
    "Importe cobrado dentro del período seleccionado según el criterio financiero del Dashboard.",
  kpiNetEffectivenessTooltip:
    "Recibos cobrados / Facturado neto. Mide qué fracción de lo facturado fue cobrada en el período según recibos sincronizados de Zeta.",
  kpiNetEffectivenessTooltipPreSync:
    "Recibos cobrados / Facturado neto. Puede estar subestimado si el período incluye facturas anteriores al inicio operativo de sincronización.",
} as const;
