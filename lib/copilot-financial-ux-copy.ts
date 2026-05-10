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
} as const;
