import {
  applyProtoActiveListFilter,
  type ProtoActiveListMode,
} from "@/lib/copilot-proto-active";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

/**
 * Tablas proto operativas con listado genérico (`is_active` / modos active|inactive|all).
 * `proto_raw_imports` no entra: no comparte ese esquema de activación (ver `listProtoRawImports`).
 */
export type ProtoOperationalListTable =
  | "proto_companies"
  | "proto_contacts"
  | "proto_invoices"
  | "proto_receipts"
  | "proto_payments"
  | "proto_tax_obligations"
  | "proto_tax_payments";

export type DataRow = Record<string, unknown> & {
  id?: string | number;
  created_at?: string;
};

const DEFAULT_LIMIT = 100;

/** Tablas proto_* con columna `workspace_company_id` (SEC-02). */
const PROTO_TABLES_WITH_WORKSPACE = new Set<ProtoOperationalListTable>([
  "proto_companies",
  "proto_contacts",
  "proto_invoices",
  "proto_receipts",
  "proto_payments",
  "proto_tax_obligations",
  "proto_tax_payments",
]);

type OrderCandidate = { column: string; ascending?: boolean };

async function fetchWithBestOrder(
  client: OperationalSupabase,
  table: ProtoOperationalListTable,
  orders: readonly OrderCandidate[],
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  const wid = workspaceCompanyId?.trim();
  const scopeWs = Boolean(wid && PROTO_TABLES_WITH_WORKSPACE.has(table));
  for (const order of orders) {
    let base = client.from(table).select("*");
    if (scopeWs) base = base.eq("workspace_company_id", wid!);
    const q = applyProtoActiveListFilter(base, activeMode);
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);

    if (!error) return (data ?? []) as DataRow[];
  }

  let fbBase = client.from(table).select("*");
  if (scopeWs) fbBase = fbBase.eq("workspace_company_id", wid!);
  const fb = applyProtoActiveListFilter(fbBase, activeMode);
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
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  const wid = workspaceCompanyId?.trim();
  const scopeWs = Boolean(wid && PROTO_TABLES_WITH_WORKSPACE.has(table));
  for (const order of orders) {
    let b = client.from(table).select("*").eq(field, value);
    if (scopeWs) b = b.eq("workspace_company_id", wid!);
    const q = applyProtoActiveListFilter(b, activeMode);
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);
    if (!error) return (data ?? []) as DataRow[];
  }

  let fbB = client.from(table).select("*").eq(field, value);
  if (scopeWs) fbB = fbB.eq("workspace_company_id", wid!);
  const fb = applyProtoActiveListFilter(fbB, activeMode);
  const fallback = await fb.limit(DEFAULT_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

const ORDERS = {
  companies: [{ column: "created_at" }, { column: "updated_at" }],
  contacts: [{ column: "created_at" }, { column: "updated_at" }],
  invoices: [{ column: "issue_date" }, { column: "invoice_number" }],
  receipts: [{ column: "created_at" }, { column: "receipt_date" }],
  payments: [{ column: "created_at" }, { column: "payment_date" }],
  raw_imports: [{ column: "created_at" }, { column: "imported_at" }],
  tax_obligations: [
    { column: "due_date", ascending: true },
    { column: "created_at", ascending: false },
  ],
  tax_payments: [
    { column: "payment_date", ascending: false },
    { column: "created_at", ascending: false },
  ],
} as const;

/**
 * Lista todas las filas del tenant (sin `.limit`): pantalla Datos / dataset deben ver el catálogo completo.
 * Orden: `created_at` desc, con fallback a `updated_at` si la columna de orden no existe en el esquema.
 */
export async function listProtoCompanies(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  const wid = workspaceCompanyId?.trim();
  const scopeWs = Boolean(wid);
  for (const order of ORDERS.companies as readonly OrderCandidate[]) {
    let base = client.from("proto_companies").select("*");
    if (scopeWs) base = base.eq("workspace_company_id", wid!);
    const q = applyProtoActiveListFilter(base, activeMode);
    const { data, error } = await q.order(order.column, {
      ascending: order.ascending ?? false,
    });
    if (!error) return (data ?? []) as DataRow[];
  }

  let fbBase = client.from("proto_companies").select("*");
  if (scopeWs) fbBase = fbBase.eq("workspace_company_id", wid!);
  const fb = applyProtoActiveListFilter(fbBase, activeMode);
  const fallback = await fb;
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

export async function listProtoContacts(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchWithBestOrder(
    client,
    "proto_contacts",
    ORDERS.contacts,
    activeMode,
    workspaceCompanyId
  );
}

/**
 * Catálogo completo de facturas del tenant (sin `.limit`): el dataset Copilot y filtros por mes
 * necesitan todas las filas; `fetchWithBestOrder` trunca en DEFAULT_LIMIT.
 *
 * Orden de negocio: `issue_date DESC` (más reciente primero) + `invoice_number DESC` (mismo día → Nº mayor primero).
 * Nunca usar `created_at` como orden principal (inserción en DB ≠ fecha de emisión).
 */
export async function listProtoInvoices(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  const wid = workspaceCompanyId?.trim();
  const scopeWs = Boolean(wid);

  // Principal: issue_date DESC + invoice_number DESC (orden negocio Zeta)
  {
    let base = client.from("proto_invoices").select("*");
    if (scopeWs) base = base.eq("workspace_company_id", wid!);
    const q = applyProtoActiveListFilter(base, activeMode);
    const { data, error } = await q
      .order("issue_date", { ascending: false })
      .order("invoice_number", { ascending: false });
    if (!error) return (data ?? []) as DataRow[];
  }

  // Fallback: issue_date DESC solo (si invoice_number no existe en el esquema)
  {
    let base = client.from("proto_invoices").select("*");
    if (scopeWs) base = base.eq("workspace_company_id", wid!);
    const q = applyProtoActiveListFilter(base, activeMode);
    const { data, error } = await q.order("issue_date", { ascending: false });
    if (!error) return (data ?? []) as DataRow[];
  }

  // Fallback final sin orden garantizado
  let fbBase = client.from("proto_invoices").select("*");
  if (scopeWs) fbBase = fbBase.eq("workspace_company_id", wid!);
  const fb = applyProtoActiveListFilter(fbBase, activeMode);
  const fallback = await fb;
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

export async function listProtoReceipts(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchWithBestOrder(
    client,
    "proto_receipts",
    ORDERS.receipts,
    activeMode,
    workspaceCompanyId
  );
}

export async function listProtoPayments(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchWithBestOrder(
    client,
    "proto_payments",
    ORDERS.payments,
    activeMode,
    workspaceCompanyId
  );
}

export async function listProtoTaxObligations(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchWithBestOrder(
    client,
    "proto_tax_obligations",
    ORDERS.tax_obligations,
    activeMode,
    workspaceCompanyId
  );
}

export async function listProtoTaxPayments(
  client: OperationalSupabase,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchWithBestOrder(
    client,
    "proto_tax_payments",
    ORDERS.tax_payments,
    activeMode,
    workspaceCompanyId
  );
}

/**
 * Importaciones crudas: la tabla no expone `is_active` (ni el filtro genérico de archivo).
 * No se aplica `workspace_company_id` aquí: no está en `PROTO_TABLES_WITH_WORKSPACE` hasta
 * confirmar columna en esquema; el aislamiento queda en RLS / políticas si existen.
 *
 * `activeMode` se ignora de forma conservadora (no hay columnas equivalentes documentadas).
 */
export async function listProtoRawImports(
  client: OperationalSupabase,
  _activeMode: ProtoActiveListMode = "active",
  _workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  void _activeMode;
  void _workspaceCompanyId;
  for (const order of ORDERS.raw_imports as readonly OrderCandidate[]) {
    const base = client.from("proto_raw_imports").select("*");
    const { data, error } = await base
      .order(order.column, { ascending: order.ascending ?? false })
      .limit(DEFAULT_LIMIT);

    if (!error) return (data ?? []) as DataRow[];
  }

  const fallback = await client.from("proto_raw_imports").select("*").limit(DEFAULT_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as DataRow[];
}

export async function listProtoContactsByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_contacts",
    "company_id",
    companyId,
    ORDERS.contacts,
    activeMode,
    workspaceCompanyId
  );
}

export async function listProtoInvoicesByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_invoices",
    "company_id",
    companyId,
    ORDERS.invoices,
    activeMode,
    workspaceCompanyId
  );
}

export async function listProtoReceiptsByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_receipts",
    "company_id",
    companyId,
    ORDERS.receipts,
    activeMode,
    workspaceCompanyId
  );
}

export async function listProtoPaymentsByCompanyId(
  client: OperationalSupabase,
  companyId: string,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_payments",
    "company_id",
    companyId,
    ORDERS.payments,
    activeMode,
    workspaceCompanyId
  );
}

export async function getProtoCompanyById(
  client: OperationalSupabase,
  companyId: string,
  workspaceCompanyId?: string | null
): Promise<DataRow | null> {
  let q = client.from("proto_companies").select("*").eq("id", companyId);
  const wid = workspaceCompanyId?.trim();
  if (wid) q = q.eq("workspace_company_id", wid);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DataRow | null) ?? null;
}

export async function getProtoInvoiceById(
  client: OperationalSupabase,
  invoiceId: string,
  workspaceCompanyId?: string | null
): Promise<DataRow | null> {
  let q = client.from("proto_invoices").select("*").eq("id", invoiceId);
  const wid = workspaceCompanyId?.trim();
  if (wid) q = q.eq("workspace_company_id", wid);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DataRow | null) ?? null;
}

export async function listProtoReceiptsByInvoiceId(
  client: OperationalSupabase,
  invoiceId: string,
  activeMode: ProtoActiveListMode = "active",
  workspaceCompanyId?: string | null
): Promise<DataRow[]> {
  return fetchByEqWithOrder(
    client,
    "proto_receipts",
    "invoice_id",
    invoiceId,
    ORDERS.receipts,
    activeMode,
    workspaceCompanyId
  );
}
