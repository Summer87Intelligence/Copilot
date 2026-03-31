/**
 * Modelo financiero normalizado para Summer87 Copilot.
 * Agnóstico del ERP: cualquier fuente (Zeta u otra) debe mapearse aquí antes
 * de validación, agregación a snapshots o el motor de insights.
 *
 * No define contrato de API externa; fechas y decimales siguen reglas que
 * fijará la integración real (zona horaria, redondeo, multi-moneda).
 */

/** Moneda ISO 4217 (ej. "ARS", "USD"). */
export type FinanceCurrencyCode = string;

/** Empresa en el producto (multi-tenant). */
export type FinanceCompanyId = string;

/** Identificador opaco del registro en el sistema contable origen. */
export type FinanceExternalId = string;

export type FinanceInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partially_paid"
  | "cancelled"
  | "unknown";

/**
 * Factura de venta normalizada.
 * Pendiente con API real: numeración interna vs. CAE, IVA desglosado, tipo de cambio.
 */
export type NormalizedInvoice = {
  externalId: FinanceExternalId;
  companyId: FinanceCompanyId;
  /** Emisión; ISO 8601 date o datetime (contrato TZ por definir). */
  issueDate: string;
  clientExternalId?: FinanceExternalId;
  currency: FinanceCurrencyCode;
  totalAmount: number;
  outstandingAmount?: number;
  status: FinanceInvoiceStatus;
};

export type FinanceCollectionStatus =
  | "cleared"
  | "pending"
  | "reversed"
  | "unknown";

/**
 * Cobranza normalizada.
 * Pendiente con API real: vínculo N:N factura–cobro, medios de pago, conciliación bancaria.
 */
export type NormalizedCollection = {
  externalId: FinanceExternalId;
  companyId: FinanceCompanyId;
  collectionDate: string;
  currency: FinanceCurrencyCode;
  amount: number;
  invoiceExternalIds?: FinanceExternalId[];
  clientExternalId?: FinanceExternalId;
  status: FinanceCollectionStatus;
};

/** Rubro o plan de cuentas en términos del producto (mapeo de categorías externas). */
export type FinanceExpenseCategoryCode = string;

/**
 * Gasto u operación de egreso clasificada.
 * Pendiente con API real: imputación contable, centros de costo, comprobantes asociados.
 */
export type NormalizedExpense = {
  externalId: FinanceExternalId;
  companyId: FinanceCompanyId;
  expenseDate: string;
  currency: FinanceCurrencyCode;
  amount: number;
  category?: FinanceExpenseCategoryCode;
  supplierExternalId?: FinanceExternalId;
  description?: string;
};

export type FinanceCashMovementKind =
  | "inflow"
  | "outflow"
  | "transfer"
  | "adjustment"
  | "unknown";

/**
 * Movimiento de tesorería (caja / banco).
 * Pendiente con API real: saldos por cuenta, pendientes de conciliación.
 */
export type NormalizedCashMovement = {
  externalId: FinanceExternalId;
  companyId: FinanceCompanyId;
  movementDate: string;
  currency: FinanceCurrencyCode;
  amount: number;
  kind: FinanceCashMovementKind;
  accountExternalId?: FinanceExternalId;
  memo?: string;
};

/**
 * Cliente (maestro comercial / deudor).
 * Pendiente con API real: condición fiscal, límites de crédito, segmentación.
 */
export type NormalizedClient = {
  externalId: FinanceExternalId;
  companyId: FinanceCompanyId;
  displayName: string;
  taxId?: string;
  active?: boolean;
};

/**
 * Proveedor (maestro acreedor).
 * Pendiente con API real: plazos de pago habituales, retenciones.
 */
export type NormalizedSupplier = {
  externalId: FinanceExternalId;
  companyId: FinanceCompanyId;
  displayName: string;
  taxId?: string;
  active?: boolean;
};

/**
 * Lote ya normalizado listo para validación y agregación (futuro: snapshot, no conectado aún).
 * `sourceSystem` permite auditar procedencia cuando existan varios conectores.
 */
export type NormalizedFinancePayload = {
  sourceSystem: "zeta";
  companyId: FinanceCompanyId;
  invoices: NormalizedInvoice[];
  collections: NormalizedCollection[];
  expenses: NormalizedExpense[];
  cashMovements: NormalizedCashMovement[];
  clients: NormalizedClient[];
  suppliers: NormalizedSupplier[];
  /** Reservado: id de corrida de sync cuando exista job de integración. */
  syncRunId?: string;
};
