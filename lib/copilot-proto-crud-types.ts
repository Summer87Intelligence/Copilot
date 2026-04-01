/** Entidades con CRUD vía `/api/copilot/data/*` (manual, importación masiva, APIs externas). */
export type ProtoCrudEntity =
  | "companies"
  | "invoices"
  | "receipts"
  | "payments"
  | "tax_obligations";

export type CopilotDataEntityEndpoints = {
  create: string;
  update: string;
  delete: string;
  restore: string;
};

/** Rutas REST por operación (create / update / delete = archivar / restore = reactivar). */
export const COPILOT_DATA_API: Record<ProtoCrudEntity, CopilotDataEntityEndpoints> = {
  companies: {
    create: "/api/copilot/data/companies/create",
    update: "/api/copilot/data/companies/update",
    delete: "/api/copilot/data/companies/delete",
    restore: "/api/copilot/data/companies/restore",
  },
  invoices: {
    create: "/api/copilot/data/invoices/create",
    update: "/api/copilot/data/invoices/update",
    delete: "/api/copilot/data/invoices/delete",
    restore: "/api/copilot/data/invoices/restore",
  },
  receipts: {
    create: "/api/copilot/data/receipts/create",
    update: "/api/copilot/data/receipts/update",
    delete: "/api/copilot/data/receipts/delete",
    restore: "/api/copilot/data/receipts/restore",
  },
  payments: {
    create: "/api/copilot/data/payments/create",
    update: "/api/copilot/data/payments/update",
    delete: "/api/copilot/data/payments/delete",
    restore: "/api/copilot/data/payments/restore",
  },
  tax_obligations: {
    create: "/api/copilot/data/tax-obligations/create",
    update: "/api/copilot/data/tax-obligations/update",
    delete: "/api/copilot/data/tax-obligations/delete",
    restore: "/api/copilot/data/tax-obligations/restore",
  },
};

export const COPILOT_DOCUMENTS_API = {
  archive: "/api/copilot/data/documents/archive",
  restore: "/api/copilot/data/documents/restore",
} as const;

/** Respuesta unificada: capa compartida para UI manual e importación futura (CSV/Excel). */

export type ProtoCrudSuccess<T> = {
  ok: true;
  data: T;
  /** Mensaje principal para toast / banner (creado, editado, eliminado). */
  message: string;
  /** Advertencia no bloqueante (p. ej. duplicado fiscal confirmado). */
  warning?: string;
};

export type ProtoCrudFailure = {
  ok: false;
  code: ProtoCrudErrorCode;
  message: string;
  /** Detalle para UI (p. ej. relaciones que bloquean). */
  details?: readonly { field?: string; reason: string }[];
};

export type ProtoCrudResult<T> = ProtoCrudSuccess<T> | ProtoCrudFailure;

export type ProtoCrudErrorCode =
  | "VALIDATION"
  | "INTEGRITY_BLOCK"
  | "NOT_FOUND"
  | "DUPLICATE_TAX_PERIOD"
  | "DATABASE";

export const PROTO_CRUD_TABLES = {
  companies: "proto_companies",
  invoices: "proto_invoices",
  receipts: "proto_receipts",
  payments: "proto_payments",
  taxObligations: "proto_tax_obligations",
} as const;

export type ProtoCrudTableName =
  (typeof PROTO_CRUD_TABLES)[keyof typeof PROTO_CRUD_TABLES];

/** Tipos fiscales alineados con `mapTaxTypeLabel` (copilot-format). */
export const PROTO_TAX_TYPES = [
  "iva",
  "bps",
  "dgi",
  "irae",
  "anticipo",
  "otros",
] as const;

export type ProtoTaxTypeId = (typeof PROTO_TAX_TYPES)[number];

export const PROTO_INVOICE_STATUSES = [
  "issued",
  "overdue",
  "paid",
  "partial",
  "cancelled",
] as const;

export const PROTO_RECEIPT_STATUSES = [
  "paid",
  "scheduled",
  "pending",
  "applied",
  "reversed",
] as const;

export const PROTO_PAYMENT_STATUSES = [
  "paid",
  "scheduled",
  "pending",
] as const;

export const PROTO_TAX_OBLIGATION_STATUSES = [
  "scheduled",
  "pending",
  "paid",
  "overdue",
] as const;

export const PROTO_TAX_PRIORITIES = ["critical", "high", "medium", "low"] as const;

/** Sugerencias de categoría para pagos (se permite cualquier string no vacío). */
export const PROTO_PAYMENT_CATEGORY_SUGGESTIONS = [
  "Proveedores",
  "Nómina",
  "Servicios",
  "Impuestos operativos",
  "Financieros",
  "Otros",
] as const;

export const PROTO_COMPANY_STATUSES = ["active", "inactive", "prospect"] as const;

export const PROTO_COMPANY_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export type ProtoCompanyInput = {
  name: string;
  industry?: string | null;
  city?: string | null;
  status?: string | null;
  risk_level?: string | null;
};

export type ProtoCompanyPatch = Partial<ProtoCompanyInput>;

export type ProtoInvoiceInput = {
  company_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  /** Si se omite en alta, se iguala a `total_amount`. */
  balance_amount?: number;
  collection_probability?: number | null;
  status?: string;
  category?: string | null;
  notes?: string | null;
};

export type ProtoInvoicePatch = Partial<ProtoInvoiceInput>;

export type ProtoReceiptInput = {
  company_id: string;
  invoice_id: string | null;
  receipt_number: string;
  receipt_date: string;
  amount: number;
  payment_method?: string | null;
  status?: string;
  reference?: string | null;
  notes?: string | null;
};

export type ProtoReceiptPatch = Partial<ProtoReceiptInput>;

export type ProtoPaymentInput = {
  company_id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  category: string;
  vendor_name?: string | null;
  status?: string;
  reference?: string | null;
  notes?: string | null;
  /** Vínculo opcional a `proto_tax_obligations` (cierre fiscal vía pago operativo). */
  obligation_id?: string | null;
};

export type ProtoPaymentPatch = Partial<ProtoPaymentInput>;

export type ProtoTaxObligationInput = {
  tax_type: string;
  period_label: string;
  due_date: string;
  estimated_amount: number;
  confirmed_amount?: number | null;
  status?: string;
  priority?: string;
  notes?: string | null;
  /** Si el servidor detecta duplicado impuesto/período, requiere true para persistir. */
  confirm_duplicate?: boolean;
};

export type ProtoTaxObligationPatch = Partial<
  Omit<ProtoTaxObligationInput, "confirm_duplicate">
> & { confirm_duplicate?: boolean };

function fail(
  code: ProtoCrudErrorCode,
  message: string,
  details?: readonly { field?: string; reason: string }[]
): ProtoCrudFailure {
  return { ok: false, code, message, details };
}

function ok<T>(data: T, message: string, warning?: string): ProtoCrudSuccess<T> {
  return warning
    ? { ok: true, data, message, warning }
    : { ok: true, data, message };
}

export const protoCrudResult = { ok, fail };
