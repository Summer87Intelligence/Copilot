/**
 * Tipos conceptuales para una futura integración con Zeta (u otro ERP/contable).
 * No representan el contrato real de ninguna API; sirven como vocabulario de dominio
 * y base para adaptadores cuando exista integración.
 *
 * IDs externos: strings opacos para no acoplarse a formatos numéricos del proveedor.
 */

/** Moneda ISO 4217 (ej. "ARS", "USD"). */
export type ZetaCurrencyCode = string;

/** Identificador de entidad en Zeta (factura, cliente, etc.). */
export type ZetaExternalId = string;

/** Identificador de empresa en nuestro sistema (alineado a multi-tenant). */
export type CompanyId = string;

export type ZetaInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partially_paid"
  | "cancelled"
  | "unknown";

/**
 * Factura de venta (documento que impacta ventas y, según estado, cobranzas).
 */
export type ZetaInvoice = {
  zetaId: ZetaExternalId;
  companyId: CompanyId;
  /** Fecha de emisión (ISO 8601 date o datetime). */
  issueDate: string;
  /** Cliente asociado, si aplica. */
  clientZetaId?: ZetaExternalId;
  currency: ZetaCurrencyCode;
  /** Total facturado en moneda de la factura. */
  totalAmount: number;
  /** Importe pendiente de cobro (si Zeta lo expone). */
  outstandingAmount?: number;
  status: ZetaInvoiceStatus;
};

export type ZetaCollectionStatus = "cleared" | "pending" | "reversed" | "unknown";

/**
 * Cobranza: aplicación de pago a factura(s) o ingreso registrado.
 */
export type ZetaCollection = {
  zetaId: ZetaExternalId;
  companyId: CompanyId;
  /** Fecha efectiva del cobro. */
  collectionDate: string;
  currency: ZetaCurrencyCode;
  amount: number;
  /** Facturas afectadas (si el modelo es N:N, puede ser lista). */
  invoiceZetaIds?: ZetaExternalId[];
  clientZetaId?: ZetaExternalId;
  status: ZetaCollectionStatus;
};

export type ZetaExpenseCategory = string;

/**
 * Gasto operativo o asiento de gasto clasificado.
 */
export type ZetaExpense = {
  zetaId: ZetaExternalId;
  companyId: CompanyId;
  /** Fecha de imputación o comprobante. */
  expenseDate: string;
  currency: ZetaCurrencyCode;
  amount: number;
  category?: ZetaExpenseCategory;
  supplierZetaId?: ZetaExternalId;
  /** Descripción libre para trazabilidad. */
  description?: string;
};

export type ZetaCashMovementType =
  | "inflow"
  | "outflow"
  | "transfer"
  | "adjustment"
  | "unknown";

/**
 * Movimiento de caja o banco (impacta liquidez disponible).
 */
export type ZetaCashMovement = {
  zetaId: ZetaExternalId;
  companyId: CompanyId;
  movementDate: string;
  currency: ZetaCurrencyCode;
  amount: number;
  type: ZetaCashMovementType;
  /** Cuenta bancaria o caja en Zeta, si aplica. */
  accountZetaId?: ZetaExternalId;
  memo?: string;
};

/**
 * Cliente (maestro comercial / deudor).
 */
export type ZetaClient = {
  zetaId: ZetaExternalId;
  companyId: CompanyId;
  /** Nombre comercial o razón social. */
  displayName: string;
  taxId?: string;
  /** Activo en el sistema contable. */
  active?: boolean;
};

/**
 * Proveedor (maestro acreedor).
 */
export type ZetaSupplier = {
  zetaId: ZetaExternalId;
  companyId: CompanyId;
  displayName: string;
  taxId?: string;
  active?: boolean;
};
