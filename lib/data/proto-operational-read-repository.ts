import {
  applyProtoActiveListFilter,
  type ProtoActiveListMode,
} from "@/lib/copilot-proto-active";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

/** Tablas proto listadas en TEN-02 + importaciones crudas usadas por listados Copilot. */
export type ProtoOperationalListTable =
  | "proto_companies"
  | "proto_contacts"
  | "proto_invoices"
  | "proto_receipts"
  | "proto_payments"
  | "proto_tax_obligations"
  | "proto_raw_imports";

export type DataRow = Record<string, unknown> & {
  id?: string | number;
  created_at?: string;
};

const DEFAULT_LIMIT = 100;

type OrderCandidate = { column: string; ascending?: boolean };

async function fetchWithBestOrder(
  client: OperationalSupabase,
  table: ProtoOperationalListTable,
  orders: readonly OrderCandidate[],
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  for (const order of orders) {
    const q = applyProtoActiveListFilter(client.from(table).select("*"), activeMode);
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);

    if (!error) return (data ?? []) as DataRow[];
  }

  const fb = applyProtoActiveListFilter(client.from(table).select("*"), activeMode);
  const fallback = await fb.limit(DEFAULT_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

async function fetchByEqWithOrder(
  client: OperationalSupabase,
  table: ProtoOperationalListTable,
  field: string,
  value: string,
  orders: readonly OrderCandidate[],
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  for (const order of orders) {
    const q = applyProtoActiveListFilter(
      client.from(table).select("*").eq(field, value),
      activeMode
    );
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);
    if (!error) return (data ?? []) as DataRow[];
  }

  const fb = applyProtoActiveListFilter(
    client.from(table).select("*").eq(field, value),
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

export async function listProtoCompanies(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_companies", ORDERS.companies, activeMode);
}

export async function listProtoContacts(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_contacts", ORDERS.contacts, activeMode);
}

export async function listProtoInvoices(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_invoices", ORDERS.invoices, activeMode);
}

export async function listProtoReceipts(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_receipts", ORDERS.receipts, activeMode);
}

export async function listProtoPayments(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_payments", ORDERS.payments, activeMode);
}

export async function listProtoTaxObligations(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_tax_obligations", ORDERS.tax_obligations, activeMode);
}

export async function listProtoRawImports(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchWithBestOrder(client, "proto_raw_imports", ORDERS.raw_imports, activeMode);
}

export async function listProtoContactsByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_contacts",
    "company_id",
    companyId,
    ORDERS.contacts,
    activeMode
  );
}

export async function listProtoInvoicesByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_invoices",
    "company_id",
    companyId,
    ORDERS.invoices,
    activeMode
  );
}

export async function listProtoReceiptsByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_receipts",
    "company_id",
    companyId,
    ORDERS.receipts,
    activeMode
  );
}

export async function listProtoPaymentsByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_payments",
    "company_id",
    companyId,
    ORDERS.payments,
    activeMode
  );
}

export async function getProtoCompanyById(
  client: OperationalSupabase,
  companyId: string
): Promise<DataRow | null> {
  const { data, error } = await client
    .from("proto_companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DataRow | null) ?? null;
}

export async function getProtoInvoiceById(
  client: OperationalSupabase,
  invoiceId: string
): Promise<DataRow | null> {
  const { data, error } = await client
    .from("proto_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DataRow | null) ?? null;
}

export async function listProtoReceiptsByInvoiceId(
  client: OperationalSupabase,
  invoiceId: string,
  activeMode: ProtoActiveListMode = "active"
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_receipts",
    "invoice_id",
    invoiceId,
    ORDERS.receipts,
    activeMode
  );
}
