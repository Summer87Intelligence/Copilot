import {
  applyProtoActiveListFilter,
  type ProtoActiveListMode,
} from "@/lib/copilot-proto-active";
import { supabase } from "@/lib/supabase-client";

export type { CopilotDataEntityKey as DataEntity } from "@/lib/copilot-format";
export type { ProtoActiveListMode } from "@/lib/copilot-proto-active";

export type DataRow = Record<string, unknown> & {
  id?: string | number;
  created_at?: string;
};

export {
  mapGenericStatus,
  mapInvoiceStatus,
  mapPaymentStatus,
  mapReceiptStatus,
} from "@/lib/copilot-format";

const DEFAULT_LIMIT = 100;

type OrderCandidate = { column: string; ascending?: boolean };

async function fetchWithBestOrder(
  table: string,
  orders: readonly OrderCandidate[],
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  for (const order of orders) {
    const q = applyProtoActiveListFilter(supabase.from(table).select("*"), activeMode);
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);

    if (!error) return (data ?? []) as DataRow[];
  }

  const fb = applyProtoActiveListFilter(supabase.from(table).select("*"), activeMode);
  const fallback = await fb.limit(DEFAULT_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

async function fetchByEqWithOrder(
  table: string,
  field: string,
  value: string,
  orders: readonly OrderCandidate[],
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  for (const order of orders) {
    const q = applyProtoActiveListFilter(
      supabase.from(table).select("*").eq(field, value),
      activeMode
    );
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);
    if (!error) return (data ?? []) as DataRow[];
  }

  const fb = applyProtoActiveListFilter(
    supabase.from(table).select("*").eq(field, value),
    activeMode
  );
  const fallback = await fb.limit(DEFAULT_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

const ORDERS = {
  companies: [{ column: "created_at" }, { column: "updated_at" }],
  contacts: [{ column: "created_at" }, { column: "updated_at" }],
  invoices: [{ column: "created_at" }, { column: "issue_date" }, { column: "due_date" }],
  receipts: [{ column: "created_at" }, { column: "receipt_date" }],
  payments: [{ column: "created_at" }, { column: "payment_date" }],
  raw_imports: [{ column: "created_at" }, { column: "imported_at" }],
  tax_obligations: [
    { column: "due_date", ascending: true },
    { column: "created_at", ascending: false },
  ],
} as const;

export async function getProtoCompanies(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_companies", ORDERS.companies, activeMode);
}

export async function getProtoContacts(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_contacts", ORDERS.contacts, activeMode);
}

export async function getProtoInvoices(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_invoices", ORDERS.invoices, activeMode);
}

export async function getProtoReceipts(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_receipts", ORDERS.receipts, activeMode);
}

export async function getProtoPayments(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_payments", ORDERS.payments, activeMode);
}

export async function getProtoTaxObligationsRows(
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_tax_obligations", ORDERS.tax_obligations, activeMode);
}

export async function getProtoRawImports(): Promise<DataRow[]> {
  return fetchWithBestOrder("proto_raw_imports", ORDERS.raw_imports);
}

export async function getProtoContactsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    "proto_contacts",
    "company_id",
    companyId,
    ORDERS.contacts,
    activeMode
  );
}

export async function getProtoInvoicesByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    "proto_invoices",
    "company_id",
    companyId,
    ORDERS.invoices,
    activeMode
  );
}

export async function getProtoReceiptsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    "proto_receipts",
    "company_id",
    companyId,
    ORDERS.receipts,
    activeMode
  );
}

export async function getProtoPaymentsByCompany(
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    "proto_payments",
    "company_id",
    companyId,
    ORDERS.payments,
    activeMode
  );
}

export async function getProtoCompanyById(companyId: string): Promise<DataRow | null> {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DataRow | null) ?? null;
}

export async function getProtoInvoiceById(invoiceId: string): Promise<DataRow | null> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DataRow | null) ?? null;
}

export async function getProtoReceiptsByInvoice(
  invoiceId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    "proto_receipts",
    "invoice_id",
    invoiceId,
    ORDERS.receipts,
    activeMode
  );
}

// Compatibilidad con implementaciones previas del módulo.
export const getCompanies = getProtoCompanies;
export const getContacts = getProtoContacts;
export const getInvoices = getProtoInvoices;
export const getReceipts = getProtoReceipts;
export const getPayments = getProtoPayments;
export const getContactsByCompany = getProtoContactsByCompany;
export const getInvoicesByCompany = getProtoInvoicesByCompany;
export const getReceiptsByCompany = getProtoReceiptsByCompany;
export const getPaymentsByCompany = getProtoPaymentsByCompany;
export const getCompanyById = getProtoCompanyById;
export const getReceiptsByInvoice = getProtoReceiptsByInvoice;
