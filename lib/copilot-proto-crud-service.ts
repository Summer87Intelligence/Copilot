import type { SupabaseClient } from "@supabase/supabase-js";

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import {
  invoiceTotalBelowApplied,
  MSG_DB_USER,
  MSG_DUPLICATE_TAX,
  MSG_SUCCESS,
  MSG_WARNING_DUPLICATE_TAX,
  receiptExceedsInvoiceCap,
  operationalPaymentObligationAmountHint,
  validateCompanyIntegrity,
  validateInvoiceIntegrity,
  validateLinkedInvoiceExists,
  validatePaymentIntegrity,
  validateReceiptIntegrity,
  validateTaxObligationIntegrity,
} from "@/lib/copilot-data-integrity";
import {
  protoCrudResult,
  PROTO_CRUD_TABLES,
  PROTO_INVOICE_STATUSES,
  PROTO_PAYMENT_STATUSES,
  PROTO_RECEIPT_STATUSES,
  PROTO_TAX_OBLIGATION_STATUSES,
  PROTO_TAX_PRIORITIES,
  PROTO_COMPANY_RISK_LEVELS,
  PROTO_COMPANY_STATUSES,
  type ProtoCompanyInput,
  type ProtoCompanyPatch,
  type ProtoCrudFailure,
  type ProtoCrudResult,
  type ProtoInvoiceInput,
  type ProtoInvoicePatch,
  type ProtoPaymentInput,
  type ProtoPaymentPatch,
  type ProtoReceiptInput,
  type ProtoReceiptPatch,
  type ProtoTaxObligationInput,
  type ProtoTaxObligationPatch,
} from "@/lib/copilot-proto-crud-types";

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/**
 * Mitigación `service_role`: acota lecturas/updates por `workspace_company_id` cuando el caller
 * informa tenant (`public.companies.id`). Si se omite, se mantiene el comportamiento previo (p. ej. integraciones).
 *
 * Tablas `proto_*` tocadas por este módulo y columna tenant (SEC-02): `proto_companies`,
 * `proto_invoices`, `proto_receipts`, `proto_payments`, `proto_tax_obligations`, `proto_tax_payments`,
 * `proto_documents`. No hay excepciones sin `workspace_company_id` entre ellas.
 */
/** Evita TS2589 con builders PostgREST (inferencia profunda en `.eq` encadenado). */
function eqWorkspaceIfSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qb: any,
  workspaceCompanyId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const wid = workspaceCompanyId?.trim();
  if (!wid) return qb;
  return qb.eq("workspace_company_id", wid);
}

/** Normaliza UUID de obligación fiscal en pagos operativos. */
function paymentObligationIdFromInput(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const s = str(v);
  return s || null;
}

async function fetchTaxObligationRow(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.taxObligations).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data as Record<string, unknown> | null) ?? null;
  if (!row) return null;
  if (row.is_active === false) return null;
  return row;
}

async function softArchiveRow(
  supabase: SupabaseClient,
  table: string,
  id: string,
  workspaceCompanyId?: string
): Promise<{ error: Error | null }> {
  const ts = new Date().toISOString();
  const { error } = await eqWorkspaceIfSet(
    supabase.from(table).update({
      is_active: false,
      archived_at: ts,
      updated_at: ts,
    }).eq("id", id),
    workspaceCompanyId
  );
  return { error: error ? new Error(error.message) : null };
}

async function softRestoreRow(
  supabase: SupabaseClient,
  table: string,
  id: string,
  workspaceCompanyId?: string
): Promise<{ error: Error | null }> {
  const ts = new Date().toISOString();
  const { error } = await eqWorkspaceIfSet(
    supabase.from(table).update({
      is_active: true,
      archived_at: null,
      updated_at: ts,
    }).eq("id", id),
    workspaceCompanyId
  );
  return { error: error ? new Error(error.message) : null };
}

/**
 * Marca la obligación como pagada cuando un pago operativo cerrado en `paid` la referencia.
 * Si ya estaba pagada, no altera filas y devuelve aviso.
 */
async function syncTaxObligationAfterOperationalPaymentPaid(
  supabase: SupabaseClient,
  obligationId: string,
  paymentAmount: number,
  workspaceCompanyId?: string
): Promise<string | undefined> {
  const row = await fetchTaxObligationRow(supabase, obligationId, workspaceCompanyId);
  if (!row) return undefined;

  const status = String(row.status ?? "").toLowerCase();
  const est = num(row.estimated_amount);
  const conf = row.confirmed_amount == null ? null : num(row.confirmed_amount);

  const parts: string[] = [];
  const wAmt = operationalPaymentObligationAmountHint(est, conf, paymentAmount);
  if (wAmt) parts.push(wAmt);

  if (status === "paid") {
    parts.push(
      "La obligación ya estaba en estado pagado; no la modificamos. El vínculo con este pago operativo quedó guardado."
    );
    return parts.join(" ");
  }

  const newConf =
    conf != null && conf > 0 ? Math.max(conf, paymentAmount) : paymentAmount;

  const { error: upErr } = await eqWorkspaceIfSet(
    supabase
      .from(PROTO_CRUD_TABLES.taxObligations)
      .update({
        status: "paid",
        confirmed_amount: newConf,
        updated_at: new Date().toISOString(),
      })
      .eq("id", obligationId),
    workspaceCompanyId
  );

  if (upErr) throw new Error(upErr.message);

  return parts.length ? parts.join(" ") : undefined;
}

function normalizeProbability(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0.6;
  let p = raw;
  if (p > 1 && p <= 100) p = p / 100;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

function allowedStatus(
  value: string,
  allowed: readonly string[],
  fallback: string
): string {
  const v = value.trim().toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function countDocumentsForRow(
  supabase: SupabaseClient,
  relatedTable: string,
  relatedId: string,
  workspaceCompanyId?: string
): Promise<number> {
  const wid = workspaceCompanyId?.trim();
  let base = supabase
    .from("proto_documents")
    .select("id", { count: "exact", head: true })
    .eq("related_table", relatedTable)
    .eq("related_id", relatedId);
  if (wid) base = base.eq("workspace_company_id", wid);
  const q = applyProtoActiveListFilter(base, "active");
  const { count, error } = await q;
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("proto_documents") || m.includes("does not exist")) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function countReceiptsForInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  workspaceCompanyId?: string
): Promise<number> {
  const q = applyProtoActiveListFilter(
    eqWorkspaceIfSet(
      supabase
        .from(PROTO_CRUD_TABLES.receipts)
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoiceId),
      workspaceCompanyId
    ),
    "active"
  );
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function sumReceiptAmountsForInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  excludeReceiptId?: string,
  workspaceCompanyId?: string
): Promise<number> {
  const q = applyProtoActiveListFilter(
    eqWorkspaceIfSet(
      supabase
        .from(PROTO_CRUD_TABLES.receipts)
        .select("id, amount")
        .eq("invoice_id", invoiceId),
      workspaceCompanyId
    ),
    "active"
  );
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let sum = 0;
  for (const row of data ?? []) {
    if (excludeReceiptId && String(row.id) === excludeReceiptId) continue;
    sum += num(row.amount);
  }
  return sum;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function countTaxPaymentsForObligation(
  supabase: SupabaseClient,
  obligationId: string,
  workspaceCompanyId?: string
): Promise<number> {
  const q = applyProtoActiveListFilter(
    eqWorkspaceIfSet(
      supabase
        .from("proto_tax_payments")
        .select("id", { count: "exact", head: true })
        .eq("obligation_id", obligationId),
      workspaceCompanyId
    ),
    "active"
  );
  const { count, error } = await q;
  if (error) {
    if (error.message.toLowerCase().includes("proto_tax_payments")) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function countRowsEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  workspaceCompanyId?: string
): Promise<number> {
  const wid = workspaceCompanyId?.trim();
  let q = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (wid) q = q.eq("workspace_company_id", wid);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function protoCreateCompany(
  supabase: SupabaseClient,
  input: ProtoCompanyInput,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  const err = validateCompanyIntegrity(input);
  if (err) return err;

  const wid = str(workspaceCompanyId);
  const row = {
    ...(wid ? { workspace_company_id: wid } : {}),
    name: str(input.name),
    industry: input.industry != null ? str(input.industry) || null : null,
    city: input.city != null ? str(input.city) || null : null,
    status: allowedStatus(
      str(input.status) || "active",
      PROTO_COMPANY_STATUSES as unknown as string[],
      "active"
    ),
    risk_level: allowedStatus(
      str(input.risk_level) || "medium",
      PROTO_COMPANY_RISK_LEVELS as unknown as string[],
      "medium"
    ),
    is_active: true,
    archived_at: null as string | null,
  };

  const { data, error } = await supabase
    .from(PROTO_CRUD_TABLES.companies)
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  }
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.companyCreated);
}

export async function protoUpdateCompany(
  supabase: SupabaseClient,
  id: string,
  patch: ProtoCompanyPatch,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la empresa.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.companies).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos esa empresa. Puede haber sido eliminada.");
  }

  const merged: ProtoCompanyInput = {
    name: str(patch.name ?? existing.name),
    industry:
      patch.industry !== undefined
        ? patch.industry
        : (existing.industry as string | null) ?? null,
    city: patch.city !== undefined ? patch.city : (existing.city as string | null) ?? null,
    status: str(patch.status ?? existing.status),
    risk_level: str(patch.risk_level ?? existing.risk_level),
  };

  const err = validateCompanyIntegrity(merged);
  if (err) return err;

  const row = {
    name: merged.name,
    industry: merged.industry != null ? str(merged.industry) || null : null,
    city: merged.city != null ? str(merged.city) || null : null,
    status: allowedStatus(
      merged.status || "active",
      PROTO_COMPANY_STATUSES as unknown as string[],
      "active"
    ),
    risk_level: allowedStatus(
      merged.risk_level || "medium",
      PROTO_COMPANY_RISK_LEVELS as unknown as string[],
      "medium"
    ),
  };

  const { data, error } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.companies).update(row).eq("id", id).select("*"),
    workspaceCompanyId
  ).single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.companyUpdated);
}

export async function protoDeleteCompany(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<{ id: string }>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la empresa a archivar.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.companies).select("id").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos esa empresa.");
  }

  const { error } = await softArchiveRow(
    supabase,
    PROTO_CRUD_TABLES.companies,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok({ id }, MSG_SUCCESS.companyArchived);
}

export async function protoRestoreCompany(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la empresa.");
  }
  const { error } = await softRestoreRow(
    supabase,
    PROTO_CRUD_TABLES.companies,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  const { data, error: rErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.companies).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (rErr || !data) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.companyRestored);
}

async function getInvoiceTotals(
  supabase: SupabaseClient,
  invoiceId: string,
  workspaceCompanyId?: string
): Promise<{ total_amount: number; company_id: string } | null> {
  const { data, error } = await eqWorkspaceIfSet(
    supabase
      .from(PROTO_CRUD_TABLES.invoices)
      .select("total_amount, company_id")
      .eq("id", invoiceId),
    workspaceCompanyId
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    total_amount: num(data.total_amount),
    company_id: str(data.company_id),
  };
}

/**
 * Neutralizado (PR3): el saldo de factura (`proto_invoices.balance_amount`) no se recalcula
 * desde recibos en escritura automática. Alineado con lectura/validación (PR2): saldo persistido
 * es autoritativo; los recibos con `invoice_id` siguen validados vía `assertReceiptFitsInvoice`.
 *
 * Se mantiene la exportación para compatibilidad con llamadas residuales; no realiza I/O.
 */
export async function syncInvoiceBalanceFromReceipts(
  _supabase: SupabaseClient,
  _invoiceId: string
): Promise<void> {
  return;
}

export async function protoCreateInvoice(
  supabase: SupabaseClient,
  input: ProtoInvoiceInput,
  workspaceCompanyId?: string,
  options?: { allowBalanceGtTotal?: boolean }
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  const err = validateInvoiceIntegrity(input, options ?? {});
  if (err) return err;

  const total = input.total_amount;
  const balance =
    input.balance_amount !== undefined ? input.balance_amount : total;
  if (options?.allowBalanceGtTotal && balance > total + 1e-6) {
    console.warn(JSON.stringify({
      type: "balance_gt_total",
      source: "protoCreateInvoice",
      invoice_number: String(input.invoice_number ?? "").trim(),
      total_amount: total,
      balance_amount: balance,
      delta: balance - total,
    }));
  }
  const wid = str(workspaceCompanyId);
  const row = {
    ...(wid ? { workspace_company_id: wid } : {}),
    company_id: str(input.company_id),
    invoice_number: str(input.invoice_number),
    issue_date: input.issue_date.slice(0, 10),
    due_date: input.due_date.slice(0, 10),
    total_amount: total,
    balance_amount: balance,
    collection_probability: normalizeProbability(input.collection_probability ?? null),
    status: allowedStatus(
      str(input.status) || "issued",
      PROTO_INVOICE_STATUSES as unknown as string[],
      "issued"
    ),
    category: input.category != null ? str(input.category) || null : null,
    notes: input.notes != null ? str(input.notes) || null : null,
    currency_code: input.currency_code != null ? str(input.currency_code).toUpperCase() || null : null,
    is_active: true,
    archived_at: null as string | null,
  };

  const { data, error } = await supabase
    .from(PROTO_CRUD_TABLES.invoices)
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  }
  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.invoiceCreated
  );
}

export async function protoUpdateInvoice(
  supabase: SupabaseClient,
  id: string,
  patch: ProtoInvoicePatch,
  workspaceCompanyId?: string,
  options?: { allowBalanceGtTotal?: boolean }
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la factura.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.invoices).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos esa factura. Puede haber sido eliminada.");
  }

  const merged: ProtoInvoiceInput = {
    company_id: str(patch.company_id ?? existing.company_id),
    invoice_number: str(patch.invoice_number ?? existing.invoice_number),
    issue_date: str(patch.issue_date ?? existing.issue_date),
    due_date: str(patch.due_date ?? existing.due_date),
    total_amount: num(patch.total_amount, num(existing.total_amount)),
    balance_amount:
      patch.balance_amount !== undefined
        ? patch.balance_amount
        : num(existing.balance_amount),
    collection_probability:
      patch.collection_probability !== undefined
        ? patch.collection_probability
        : num(existing.collection_probability, 0.6),
    status: str(patch.status ?? existing.status),
    category:
      patch.category !== undefined
        ? patch.category
        : (existing.category as string | null) ?? null,
    notes:
      patch.notes !== undefined ? patch.notes : (existing.notes as string | null) ?? null,
    currency_code:
      patch.currency_code !== undefined
        ? patch.currency_code
        : (existing.currency_code as string | null) ?? null,
  };

  const err = validateInvoiceIntegrity(merged, options ?? {});
  if (err) return err;
  if (options?.allowBalanceGtTotal && (merged.balance_amount ?? merged.total_amount) > merged.total_amount + 1e-6) {
    console.warn(JSON.stringify({
      type: "balance_gt_total",
      source: "protoUpdateInvoice",
      invoice_id: id,
      total_amount: merged.total_amount,
      balance_amount: merged.balance_amount,
      delta: (merged.balance_amount ?? merged.total_amount) - merged.total_amount,
    }));
  }

  const appliedBefore = await sumReceiptAmountsForInvoice(
    supabase,
    id,
    undefined,
    workspaceCompanyId
  );
  if (appliedBefore > merged.total_amount + 1e-6) {
    return invoiceTotalBelowApplied(appliedBefore);
  }

  const row = {
    company_id: merged.company_id,
    invoice_number: merged.invoice_number,
    issue_date: merged.issue_date.slice(0, 10),
    due_date: merged.due_date.slice(0, 10),
    total_amount: merged.total_amount,
    balance_amount: merged.balance_amount,
    collection_probability: normalizeProbability(merged.collection_probability ?? null),
    status: allowedStatus(
      merged.status || "issued",
      PROTO_INVOICE_STATUSES as unknown as string[],
      "issued"
    ),
    category: merged.category != null ? str(merged.category) || null : null,
    notes: merged.notes != null ? str(merged.notes) || null : null,
    currency_code: merged.currency_code != null ? str(merged.currency_code).toUpperCase() || null : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.invoices).update(row).eq("id", id).select("*"),
    workspaceCompanyId
  ).single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.invoiceUpdated);
}

export async function protoDeleteInvoice(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<{ id: string }>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la factura a archivar.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.invoices).select("id").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos esa factura.");
  }

  const { error } = await softArchiveRow(
    supabase,
    PROTO_CRUD_TABLES.invoices,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok({ id }, MSG_SUCCESS.invoiceDeleted);
}

export async function protoRestoreInvoice(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la factura.");
  }
  const { error } = await softRestoreRow(
    supabase,
    PROTO_CRUD_TABLES.invoices,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  const { data, error: rErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.invoices).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (rErr || !data) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.invoiceRestored);
}

/**
 * Defensa: recibo imputado a factura no puede hacer que Σ cobros activos supere el total;
 * no ajusta `balance_amount` en factura (PR3).
 */
async function assertReceiptFitsInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  amount: number,
  receiptCompanyId: string,
  excludeReceiptId?: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudFailure | null> {
  const inv = await getInvoiceTotals(supabase, invoiceId, workspaceCompanyId);
  const missing = validateLinkedInvoiceExists(inv != null);
  if (missing) return missing;
  if (str(receiptCompanyId) !== str(inv!.company_id)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La factura vinculada no corresponde a la empresa (cliente) elegida para el recibo. Revisá empresa y factura."
    );
  }
  const others = await sumReceiptAmountsForInvoice(
    supabase,
    invoiceId,
    excludeReceiptId,
    workspaceCompanyId
  );
  return receiptExceedsInvoiceCap(others, inv!.total_amount, amount);
}

export async function protoCreateReceipt(
  supabase: SupabaseClient,
  input: ProtoReceiptInput,
  workspaceCompanyId?: string,
  options: { allowUnlinkedCompany?: boolean } = {}
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  const err = validateReceiptIntegrity(input, options);
  if (err) return err;

  const invoiceId = input.invoice_id != null && str(input.invoice_id) ? str(input.invoice_id) : null;
  if (invoiceId) {
    const fit = await assertReceiptFitsInvoice(
      supabase,
      invoiceId,
      input.amount,
      str(input.company_id),
      undefined,
      workspaceCompanyId
    );
    if (fit) return fit;
  }

  const wid = str(workspaceCompanyId);
  const row = {
    ...(wid ? { workspace_company_id: wid } : {}),
    company_id: str(input.company_id) || null,
    invoice_id: invoiceId,
    receipt_number: str(input.receipt_number),
    receipt_date: input.receipt_date.slice(0, 10),
    amount: input.amount,
    currency_code: input.currency_code != null ? str(input.currency_code).toUpperCase() || null : null,
    payment_method: input.payment_method != null ? str(input.payment_method) || null : null,
    status: allowedStatus(
      str(input.status) || "paid",
      PROTO_RECEIPT_STATUSES as unknown as string[],
      "paid"
    ),
    reference: input.reference != null ? str(input.reference) || null : null,
    notes: input.notes != null ? str(input.notes) || null : null,
    is_active: true,
    archived_at: null as string | null,
  };

  const { data, error } = await supabase
    .from(PROTO_CRUD_TABLES.receipts)
    .insert(row)
    .select("*")
    .single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.receiptCreated
  );
}

export async function protoUpdateReceipt(
  supabase: SupabaseClient,
  id: string,
  patch: ProtoReceiptPatch,
  workspaceCompanyId?: string,
  options: { allowUnlinkedCompany?: boolean } = {}
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del recibo.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.receipts).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos ese recibo.");
  }

  const prevInvoiceId =
    existing.invoice_id != null ? str(existing.invoice_id) : null;

  const merged: ProtoReceiptInput = {
    company_id:
      patch.company_id !== undefined
        ? str(patch.company_id) || null
        : str(existing.company_id) || null,
    invoice_id:
      patch.invoice_id !== undefined
        ? patch.invoice_id != null && str(patch.invoice_id)
          ? str(patch.invoice_id)
          : null
        : prevInvoiceId,
    receipt_number: str(patch.receipt_number ?? existing.receipt_number),
    receipt_date: str(patch.receipt_date ?? existing.receipt_date),
    amount: num(patch.amount, num(existing.amount)),
    currency_code:
      patch.currency_code !== undefined
        ? patch.currency_code
        : (existing.currency_code as string | null) ?? null,
    payment_method:
      patch.payment_method !== undefined
        ? patch.payment_method
        : (existing.payment_method as string | null) ?? null,
    status: str(patch.status ?? existing.status),
    reference:
      patch.reference !== undefined
        ? patch.reference
        : (existing.reference as string | null) ?? null,
    notes:
      patch.notes !== undefined ? patch.notes : (existing.notes as string | null) ?? null,
  };

  const verr = validateReceiptIntegrity(merged, options);
  if (verr) return verr;

  if (merged.invoice_id) {
    const fit = await assertReceiptFitsInvoice(
      supabase,
      merged.invoice_id,
      merged.amount,
      str(merged.company_id),
      id,
      workspaceCompanyId
    );
    if (fit) return fit;
  }

  const row = {
    company_id: str(merged.company_id) || null,
    invoice_id: merged.invoice_id,
    receipt_number: merged.receipt_number,
    receipt_date: merged.receipt_date.slice(0, 10),
    amount: merged.amount,
    currency_code: merged.currency_code != null ? str(merged.currency_code).toUpperCase() || null : null,
    payment_method:
      merged.payment_method != null ? str(merged.payment_method) || null : null,
    status: allowedStatus(
      merged.status || "paid",
      PROTO_RECEIPT_STATUSES as unknown as string[],
      "paid"
    ),
    reference: merged.reference != null ? str(merged.reference) || null : null,
    notes: merged.notes != null ? str(merged.notes) || null : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.receipts).update(row).eq("id", id).select("*"),
    workspaceCompanyId
  ).single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.receiptUpdated
  );
}

export async function protoDeleteReceipt(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<{ id: string }>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del recibo a archivar.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.receipts).select("invoice_id").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos ese recibo.");
  }

  const { error } = await softArchiveRow(
    supabase,
    PROTO_CRUD_TABLES.receipts,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  return protoCrudResult.ok({ id }, MSG_SUCCESS.receiptDeleted);
}

export async function protoRestoreReceipt(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del recibo.");
  }
  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase
      .from(PROTO_CRUD_TABLES.receipts)
      .select("invoice_id, company_id, amount")
      .eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr || !existing) return protoCrudResult.fail("NOT_FOUND", "No encontramos ese recibo.");

  const { error } = await softRestoreRow(
    supabase,
    PROTO_CRUD_TABLES.receipts,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  const invoiceId = existing.invoice_id != null ? str(existing.invoice_id) : null;
  if (invoiceId) {
    const fit = await assertReceiptFitsInvoice(
      supabase,
      invoiceId,
      num(existing.amount),
      str(existing.company_id),
      id,
      workspaceCompanyId
    );
    if (fit) {
      await softArchiveRow(
        supabase,
        PROTO_CRUD_TABLES.receipts,
        id,
        workspaceCompanyId
      );
      return fit;
    }
  }

  const { data, error: rErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.receipts).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (rErr || !data) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.receiptRestored);
}

export async function protoCreatePayment(
  supabase: SupabaseClient,
  input: ProtoPaymentInput,
  workspaceCompanyId?: string,
  options: { allowUnlinkedCompany?: boolean } = {}
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  const err = validatePaymentIntegrity(input, options);
  if (err) return err;

  const oid = paymentObligationIdFromInput(input.obligation_id);
  if (oid) {
    const ob = await fetchTaxObligationRow(supabase, oid, workspaceCompanyId);
    if (!ob) {
      return protoCrudResult.fail(
        "VALIDATION",
        "La obligación fiscal seleccionada no existe. Elegí otra o quitá el vínculo."
      );
    }
  }

  const statusNorm = allowedStatus(
    str(input.status) || "paid",
    PROTO_PAYMENT_STATUSES as unknown as string[],
    "paid"
  );

  const wid = str(workspaceCompanyId);
  const row = {
    ...(wid ? { workspace_company_id: wid } : {}),
    company_id: options.allowUnlinkedCompany && !str(input.company_id) ? null : str(input.company_id),
    payment_number: str(input.payment_number),
    payment_date: input.payment_date.slice(0, 10),
    amount: input.amount,
    category: str(input.category),
    vendor_name: input.vendor_name != null ? str(input.vendor_name) || null : null,
    status: statusNorm,
    reference: input.reference != null ? str(input.reference) || null : null,
    notes: input.notes != null ? str(input.notes) || null : null,
    obligation_id: oid,
    ...(input.currency_code !== undefined ? { currency_code: input.currency_code } : {}),
    ...(input.source !== undefined ? { source: input.source ?? "manual" } : {}),
    ...(input.zeta_metadata !== undefined ? { zeta_metadata: input.zeta_metadata } : {}),
    is_active: true,
    archived_at: null as string | null,
  };

  const { data, error } = await supabase
    .from(PROTO_CRUD_TABLES.payments)
    .insert(row)
    .select("*")
    .single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  let warning: string | undefined;
  if (statusNorm === "paid" && oid) {
    try {
      warning = await syncTaxObligationAfterOperationalPaymentPaid(
        supabase,
        oid,
        input.amount,
        workspaceCompanyId
      );
    } catch {
      await softArchiveRow(
        supabase,
        PROTO_CRUD_TABLES.payments,
        String(data.id),
        workspaceCompanyId
      );
      return protoCrudResult.fail(
        "DATABASE",
        "No pudimos cerrar la obligación fiscal con este pago; el alta se canceló. Revisá los datos e intentá de nuevo."
      );
    }
  }

  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.paymentCreated,
    warning
  );
}

export async function protoUpdatePayment(
  supabase: SupabaseClient,
  id: string,
  patch: ProtoPaymentPatch,
  workspaceCompanyId?: string,
  options: { allowUnlinkedCompany?: boolean } = {}
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del pago.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.payments).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos ese pago.");
  }

  const mergedObligationId =
    patch.obligation_id !== undefined
      ? paymentObligationIdFromInput(patch.obligation_id)
      : paymentObligationIdFromInput(
          existing.obligation_id as string | null | undefined
        );

  if (mergedObligationId) {
    const ob = await fetchTaxObligationRow(
      supabase,
      mergedObligationId,
      workspaceCompanyId
    );
    if (!ob) {
      return protoCrudResult.fail(
        "VALIDATION",
        "La obligación fiscal seleccionada no existe. Elegí otra o quitá el vínculo."
      );
    }
  }

  const mergedCompanyId =
    patch.company_id !== undefined
      ? patch.company_id
      : ((existing.company_id as string | null | undefined) ?? null);
  const merged: ProtoPaymentInput = {
    company_id: mergedCompanyId != null ? str(mergedCompanyId) || null : null,
    payment_number: str(patch.payment_number ?? existing.payment_number),
    payment_date: str(patch.payment_date ?? existing.payment_date),
    amount: num(patch.amount, num(existing.amount)),
    category: str(patch.category ?? existing.category),
    vendor_name:
      patch.vendor_name !== undefined
        ? patch.vendor_name
        : (existing.vendor_name as string | null) ?? null,
    status: str(patch.status ?? existing.status),
    reference:
      patch.reference !== undefined
        ? patch.reference
        : (existing.reference as string | null) ?? null,
    notes:
      patch.notes !== undefined ? patch.notes : (existing.notes as string | null) ?? null,
    obligation_id: mergedObligationId,
    currency_code:
      patch.currency_code !== undefined
        ? patch.currency_code
        : ((existing.currency_code as "USD" | "UYU" | null | undefined) ?? null),
    source:
      patch.source !== undefined
        ? patch.source
        : ((existing.source as "manual" | "zeta" | null | undefined) ?? "manual"),
    zeta_metadata:
      patch.zeta_metadata !== undefined
        ? patch.zeta_metadata
        : ((existing.zeta_metadata as Record<string, unknown> | null | undefined) ?? null),
  };

  const verr = validatePaymentIntegrity(merged, options);
  if (verr) return verr;

  const statusNorm = allowedStatus(
    merged.status || "paid",
    PROTO_PAYMENT_STATUSES as unknown as string[],
    "paid"
  );

  const row = {
    company_id: options.allowUnlinkedCompany && !str(merged.company_id) ? null : str(merged.company_id),
    payment_number: merged.payment_number,
    payment_date: merged.payment_date.slice(0, 10),
    amount: merged.amount,
    category: merged.category,
    vendor_name: merged.vendor_name != null ? str(merged.vendor_name) || null : null,
    status: statusNorm,
    reference: merged.reference != null ? str(merged.reference) || null : null,
    notes: merged.notes != null ? str(merged.notes) || null : null,
    obligation_id: mergedObligationId,
    ...(patch.currency_code !== undefined ? { currency_code: merged.currency_code ?? null } : {}),
    ...(patch.source !== undefined ? { source: merged.source ?? "manual" } : {}),
    ...(patch.zeta_metadata !== undefined ? { zeta_metadata: merged.zeta_metadata ?? null } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.payments).update(row).eq("id", id).select("*"),
    workspaceCompanyId
  ).single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  let warning: string | undefined;
  if (statusNorm === "paid" && mergedObligationId) {
    try {
      warning = await syncTaxObligationAfterOperationalPaymentPaid(
        supabase,
        mergedObligationId,
        merged.amount,
        workspaceCompanyId
      );
    } catch {
      warning =
        "El pago se guardó pero no pudimos actualizar el estado de la obligación fiscal. Revisá la obligación en Datos y confirmá que figure como pagada si corresponde.";
    }
  }

  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.paymentUpdated,
    warning
  );
}

export async function protoDeletePayment(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<{ id: string }>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del pago a archivar.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.payments).select("id").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos ese pago.");
  }

  const { error } = await softArchiveRow(
    supabase,
    PROTO_CRUD_TABLES.payments,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok({ id }, MSG_SUCCESS.paymentDeleted);
}

export async function protoRestorePayment(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del pago.");
  }
  const { error } = await softRestoreRow(
    supabase,
    PROTO_CRUD_TABLES.payments,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  const { data, error: rErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.payments).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (rErr || !data) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.paymentRestored);
}

async function findDuplicateTaxObligation(
  supabase: SupabaseClient,
  taxType: string,
  periodLabel: string,
  excludeId?: string,
  workspaceCompanyId?: string
): Promise<boolean> {
  const tt = taxType.trim().toLowerCase();
  const pl = periodLabel.trim().toLowerCase();
  const { data, error } = await eqWorkspaceIfSet(
    supabase
      .from(PROTO_CRUD_TABLES.taxObligations)
      .select("id, tax_type, period_label")
      .eq("is_active", true)
      .ilike("tax_type", tt),
    workspaceCompanyId
  );
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ReadonlyArray<{
    id?: unknown;
    period_label?: unknown;
    tax_type?: unknown;
  }>;
  return rows.some((r) => {
    if (excludeId && String(r.id) === excludeId) return false;
    const p = str(r.period_label).trim().toLowerCase();
    const t = str(r.tax_type).trim().toLowerCase();
    return t === tt && p === pl;
  });
}

export async function protoCreateTaxObligation(
  supabase: SupabaseClient,
  input: ProtoTaxObligationInput,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  const err = validateTaxObligationIntegrity(input);
  if (err) return err;

  const taxType = str(input.tax_type).toLowerCase();
  const periodLabel = str(input.period_label);

  const dup = await findDuplicateTaxObligation(
    supabase,
    taxType,
    periodLabel,
    undefined,
    workspaceCompanyId
  );
  if (dup && !input.confirm_duplicate) {
    return {
      ok: false,
      code: "DUPLICATE_TAX_PERIOD",
      message: MSG_DUPLICATE_TAX.create,
      details: [{ field: "period_label", reason: "Duplicado" }],
    };
  }

  const wid = str(workspaceCompanyId);
  const row = {
    ...(wid ? { workspace_company_id: wid } : {}),
    tax_type: taxType,
    period_label: periodLabel,
    due_date: input.due_date.slice(0, 10),
    estimated_amount: input.estimated_amount,
    confirmed_amount:
      input.confirmed_amount === undefined || input.confirmed_amount === null
        ? null
        : input.confirmed_amount,
    status: allowedStatus(
      str(input.status) || "scheduled",
      PROTO_TAX_OBLIGATION_STATUSES as unknown as string[],
      "scheduled"
    ),
    priority: allowedStatus(
      str(input.priority) || "medium",
      PROTO_TAX_PRIORITIES as unknown as string[],
      "medium"
    ),
    notes: input.notes != null ? str(input.notes) || null : null,
    is_active: true,
    archived_at: null as string | null,
  };

  const { data, error } = await supabase
    .from(PROTO_CRUD_TABLES.taxObligations)
    .insert(row)
    .select("*")
    .single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  const warning =
    dup && input.confirm_duplicate ? MSG_WARNING_DUPLICATE_TAX.afterCreate : undefined;

  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.taxCreated,
    warning
  );
}

export async function protoUpdateTaxObligation(
  supabase: SupabaseClient,
  id: string,
  patch: ProtoTaxObligationPatch,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la obligación fiscal.");
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.taxObligations).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail(
      "NOT_FOUND",
      "No encontramos esa obligación fiscal. Puede haber sido eliminada."
    );
  }

  const merged: ProtoTaxObligationInput = {
    tax_type: str(patch.tax_type ?? existing.tax_type),
    period_label: str(patch.period_label ?? existing.period_label),
    due_date: str(patch.due_date ?? existing.due_date),
    estimated_amount: num(patch.estimated_amount, num(existing.estimated_amount)),
    confirmed_amount:
      patch.confirmed_amount !== undefined
        ? patch.confirmed_amount
        : (existing.confirmed_amount as number | null) ?? null,
    status: str(patch.status ?? existing.status),
    priority: str(patch.priority ?? existing.priority),
    notes:
      patch.notes !== undefined ? patch.notes : (existing.notes as string | null) ?? null,
    confirm_duplicate: patch.confirm_duplicate,
  };

  const verr = validateTaxObligationIntegrity(merged);
  if (verr) return verr;

  const dup = await findDuplicateTaxObligation(
    supabase,
    merged.tax_type,
    merged.period_label,
    id,
    workspaceCompanyId
  );
  if (dup && !patch.confirm_duplicate) {
    return {
      ok: false,
      code: "DUPLICATE_TAX_PERIOD",
      message: MSG_DUPLICATE_TAX.update,
      details: [{ field: "period_label", reason: "Duplicado" }],
    };
  }

  const row = {
    tax_type: merged.tax_type.toLowerCase(),
    period_label: merged.period_label,
    due_date: merged.due_date.slice(0, 10),
    estimated_amount: merged.estimated_amount,
    confirmed_amount:
      merged.confirmed_amount === null || merged.confirmed_amount === undefined
        ? null
        : merged.confirmed_amount,
    status: allowedStatus(
      merged.status || "scheduled",
      PROTO_TAX_OBLIGATION_STATUSES as unknown as string[],
      "scheduled"
    ),
    priority: allowedStatus(
      merged.priority || "medium",
      PROTO_TAX_PRIORITIES as unknown as string[],
      "medium"
    ),
    notes: merged.notes != null ? str(merged.notes) || null : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await eqWorkspaceIfSet(
    supabase
      .from(PROTO_CRUD_TABLES.taxObligations)
      .update(row)
      .eq("id", id)
      .select("*"),
    workspaceCompanyId
  ).single();

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);

  const warning =
    dup && patch.confirm_duplicate ? MSG_WARNING_DUPLICATE_TAX.afterUpdate : undefined;

  return protoCrudResult.ok(
    data as Record<string, unknown>,
    MSG_SUCCESS.taxUpdated,
    warning
  );
}

export async function protoDeleteTaxObligation(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<{ id: string }>> {
  if (!str(id)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Falta el identificador de la obligación fiscal a archivar."
    );
  }

  const { data: existing, error: exErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.taxObligations).select("id").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos esa obligación fiscal.");
  }

  const { error } = await softArchiveRow(
    supabase,
    PROTO_CRUD_TABLES.taxObligations,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok({ id }, MSG_SUCCESS.taxDeleted);
}

export async function protoRestoreTaxObligation(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId?: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador de la obligación fiscal.");
  }
  const { error } = await softRestoreRow(
    supabase,
    PROTO_CRUD_TABLES.taxObligations,
    id,
    workspaceCompanyId
  );
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  const { data, error: rErr } = await eqWorkspaceIfSet(
    supabase.from(PROTO_CRUD_TABLES.taxObligations).select("*").eq("id", id),
    workspaceCompanyId
  ).maybeSingle();
  if (rErr || !data) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.taxRestored);
}

export async function protoArchiveDocument(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId: string
): Promise<ProtoCrudResult<{ id: string }>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del documento.");
  }
  const wid = workspaceCompanyId.trim();
  if (!wid) {
    return protoCrudResult.fail("VALIDATION", "Falta el workspace para archivar el documento.");
  }
  const { data: existing, error: exErr } = await supabase
    .from("proto_documents")
    .select("id")
    .eq("id", id)
    .eq("workspace_company_id", wid)
    .maybeSingle();
  if (exErr) {
    const m = exErr.message.toLowerCase();
    if (m.includes("proto_documents") || m.includes("does not exist")) {
      return protoCrudResult.fail("NOT_FOUND", "La tabla de documentos no está disponible.");
    }
    return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  }
  if (!existing) {
    return protoCrudResult.fail("NOT_FOUND", "No encontramos ese documento.");
  }
  const ts = new Date().toISOString();
  const { error } = await supabase
    .from("proto_documents")
    .update({
      is_active: false,
      archived_at: ts,
      updated_at: ts,
    })
    .eq("id", id)
    .eq("workspace_company_id", wid);
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok({ id }, MSG_SUCCESS.documentArchived);
}

export async function protoRestoreDocument(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId: string
): Promise<ProtoCrudResult<Record<string, unknown>>> {
  if (!str(id)) {
    return protoCrudResult.fail("VALIDATION", "Falta el identificador del documento.");
  }
  const wid = workspaceCompanyId.trim();
  if (!wid) {
    return protoCrudResult.fail("VALIDATION", "Falta el workspace para restaurar el documento.");
  }
  const ts = new Date().toISOString();
  const { error } = await supabase
    .from("proto_documents")
    .update({
      is_active: true,
      archived_at: null,
      updated_at: ts,
    })
    .eq("id", id)
    .eq("workspace_company_id", wid);
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  const { data, error: rErr } = await supabase
    .from("proto_documents")
    .select("*")
    .eq("id", id)
    .eq("workspace_company_id", wid)
    .maybeSingle();
  if (rErr || !data) return protoCrudResult.fail("DATABASE", MSG_DB_USER);
  return protoCrudResult.ok(data as Record<string, unknown>, MSG_SUCCESS.documentRestored);
}
