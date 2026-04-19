import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

const ROW_CAP = 5000;
const INSIGHT_ROW_LIMIT = 100;

type ProtoFinanceTable = "proto_invoices" | "proto_receipts" | "proto_payments";

/** Diagnóstico dev: no altera consultas. */
function copilotProtoQueryDebugLog(
  table: ProtoFinanceTable,
  tenantFilter: string | null | undefined,
  usesWorkspaceCompanyIdEq: boolean
) {
  if (process.env.NODE_ENV !== "development") return;
  console.log("=== QUERY DEBUG ===");
  console.log("table:", table);
  console.log("tenant filter:", tenantFilter ?? null);
  console.log("eq workspace_company_id:", usesWorkspaceCompanyIdEq);
}

type InvoiceFinancialRow = Record<string, unknown>;

function numFromUnknown(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Clave hacia `proto_invoices.id` en filas de `public.invoice_financials`. */
function invoiceFinancialLinkId(row: InvoiceFinancialRow): string {
  const id =
    row.invoice_id ?? row.invoice_uuid ?? (typeof row.id === "string" ? row.id : null);
  return String(id ?? "").trim();
}

/** Saldo derivado en la vista (prioriza `balance` si existe). */
function invoiceFinancialBalance(row: InvoiceFinancialRow): number {
  return numFromUnknown(
    row.balance ?? row.computed_balance ?? row.net_balance ?? row.balance_amount
  );
}

/**
 * Mapa invoice_id → saldo desde `invoice_financials`.
 * Si la vista no responde o no hay filas, devuelve mapa vacío (se sigue usando `proto_invoices.balance_amount`).
 */
async function fetchInvoiceFinancialBalanceMap(
  client: OperationalSupabase,
  workspaceCompanyId: string | undefined,
  invoiceIds: readonly string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const wid = workspaceCompanyId?.trim();
  const uniq = [...new Set(invoiceIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) return map;

  // Vista `public.invoice_financials` (no siempre en tipos generados de Supabase).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (client as any).from("invoice_financials").select("*").limit(ROW_CAP);
  if (wid) {
    q = q.eq("workspace_company_id", wid);
  } else {
    q = q.in("invoice_id", uniq.slice(0, 800));
  }

  const { data, error } = await q;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[invoice_financials] omitido, se usa balance en proto_invoices:", error.message);
    }
    return map;
  }

  for (const row of (data ?? []) as InvoiceFinancialRow[]) {
    const id = invoiceFinancialLinkId(row);
    if (!id) continue;
    map.set(id, invoiceFinancialBalance(row));
  }
  return map;
}

function applyInvoiceFinancialBalancesToRows(
  invoices: Record<string, unknown>[],
  balances: Map<string, number>
): void {
  for (const inv of invoices) {
    const id = String(inv.id ?? "").trim();
    if (!id || !balances.has(id)) continue;
    inv.balance_amount = balances.get(id);
  }
}

/**
 * Dataset del motor de flujo de caja (columnas mínimas).
 */
export async function loadCashflowEngineDatasetRows(client: OperationalSupabase) {
  copilotProtoQueryDebugLog("proto_receipts", undefined, false);
  copilotProtoQueryDebugLog("proto_payments", undefined, false);
  copilotProtoQueryDebugLog("proto_invoices", undefined, false);
  const [recRes, payRes, invRes] = await Promise.all([
    client
      .from("proto_receipts")
      .select("amount,invoice_id,receipt_date,company_id")
      .eq("is_active", true)
      .order("receipt_date", { ascending: false })
      .limit(ROW_CAP),
    client
      .from("proto_payments")
      .select("amount,payment_date")
      .eq("is_active", true)
      .order("payment_date", { ascending: false })
      .limit(ROW_CAP),
    client
      .from("proto_invoices")
      .select(
        "id,company_id,issue_date,due_date,balance_amount,collection_probability"
      )
      .eq("is_active", true)
      .order("issue_date", { ascending: false })
      .limit(ROW_CAP),
  ]);

  if (recRes.error) throw new Error(recRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);

  return {
    receipts: recRes.data ?? [],
    payments: payRes.data ?? [],
    invoices: invRes.data ?? [],
  };
}

/**
 * Filas para snapshot financiero consolidado (`copilot-financial-engine`).
 * @param workspaceCompanyId Si se informa, filtra por `workspace_company_id` (= `public.companies.id` del tenant).
 */
export async function loadFinancialSnapshotRows(
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  const [recRes, payRes, invRes, taxObRes, taxPayRes] = await Promise.all([
    (() => {
      copilotProtoQueryDebugLog("proto_receipts", wid, Boolean(wid));
      let q = client
        .from("proto_receipts")
        .select("amount")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (() => {
      copilotProtoQueryDebugLog("proto_payments", wid, Boolean(wid));
      let q = client
        .from("proto_payments")
        .select("amount,payment_date")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (async () => {
      copilotProtoQueryDebugLog("proto_invoices", wid, Boolean(wid));
      let qMeta = client
        .from("proto_invoices")
        .select("id,collection_probability,balance_amount")
        .eq("is_active", true);
      if (wid) qMeta = qMeta.eq("workspace_company_id", wid);
      const invMeta = await qMeta.limit(ROW_CAP);
      if (invMeta.error) return invMeta;
      const rows = (invMeta.data ?? []) as Record<string, unknown>[];
      const ids = rows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
      const balMap = await fetchInvoiceFinancialBalanceMap(client, wid, ids);
      const merged = rows.map((row) => {
        const id = String(row.id ?? "").trim();
        const fallback = numFromUnknown(row.balance_amount);
        const bal = balMap.has(id) ? (balMap.get(id) ?? fallback) : fallback;
        return {
          balance_amount: bal,
          collection_probability: row.collection_probability,
        };
      });
      return { data: merged, error: null };
    })(),
    (() => {
      let q = client
        .from("proto_tax_obligations")
        .select("*")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (() => {
      let q = client
        .from("proto_tax_payments")
        .select("*")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
  ]);

  if (recRes.error) throw new Error(recRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);
  if (taxObRes.error) throw new Error(taxObRes.error.message);
  if (taxPayRes.error) throw new Error(taxPayRes.error.message);

  return {
    receipts: recRes.data ?? [],
    payments: payRes.data ?? [],
    invoices: invRes.data ?? [],
    taxObligations: taxObRes.data ?? [],
    taxPayments: taxPayRes.data ?? [],
  };
}

/** Columnas `amount` para caja simplificada (`copilot-financial-intelligence`). */
export async function loadCashStatusAmountRows(client: OperationalSupabase) {
  copilotProtoQueryDebugLog("proto_receipts", undefined, false);
  copilotProtoQueryDebugLog("proto_payments", undefined, false);
  const [inRes, outRes] = await Promise.all([
    client
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_payments")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (inRes.error) throw new Error(inRes.error.message);
  if (outRes.error) throw new Error(outRes.error.message);

  return { inflows: inRes.data ?? [], outflows: outRes.data ?? [] };
}

export async function selectProtoInvoicesInsightWindow(client: OperationalSupabase) {
  copilotProtoQueryDebugLog("proto_invoices", undefined, false);
  return client
    .from("proto_invoices")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_ROW_LIMIT);
}

export async function selectProtoPaymentsInsightWindow(client: OperationalSupabase) {
  copilotProtoQueryDebugLog("proto_payments", undefined, false);
  return client
    .from("proto_payments")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_ROW_LIMIT);
}

export async function selectProtoCompaniesInsightWindow(client: OperationalSupabase) {
  return client
    .from("proto_companies")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_ROW_LIMIT);
}

/** Lecturas acotadas en un solo round-trip cuando hacen falta las tres tablas. */
export async function loadInsightEngineProtoRows(client: OperationalSupabase) {
  const [invRes, payRes, compRes] = await Promise.all([
    selectProtoInvoicesInsightWindow(client),
    selectProtoPaymentsInsightWindow(client),
    selectProtoCompaniesInsightWindow(client),
  ]);

  if (invRes.error) throw new Error(invRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (compRes.error) throw new Error(compRes.error.message);

  return {
    invoices: (invRes.data ?? []) as Record<string, unknown>[],
    payments: (payRes.data ?? []) as Record<string, unknown>[],
    companies: (compRes.data ?? []) as Record<string, unknown>[],
  };
}

/** Paralelo de lecturas para `copilot-clients-portfolio`. */
export async function loadClientPortfolioSourceRows(
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  const [cRes, iRes, rRes, ctRes] = await Promise.all([
    (() => {
      let q = client.from("proto_companies").select("*").eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (() => {
      copilotProtoQueryDebugLog("proto_invoices", wid, Boolean(wid));
      let q = client.from("proto_invoices").select("*").eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (() => {
      copilotProtoQueryDebugLog("proto_receipts", wid, Boolean(wid));
      let q = client.from("proto_receipts").select("*").eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (() => {
      let q = client.from("proto_contacts").select("*").eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
  ]);

  if (!iRes.error && Array.isArray(iRes.data) && iRes.data.length > 0) {
    const invRows = iRes.data as Record<string, unknown>[];
    const ids = invRows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
    const balMap = await fetchInvoiceFinancialBalanceMap(client, wid, ids);
    applyInvoiceFinancialBalancesToRows(invRows, balMap);
  }

  return { cRes, iRes, rRes, ctRes };
}

export async function selectProtoTaxObligationsActiveOrdered(
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client
    .from("proto_tax_obligations")
    .select("*")
    .eq("is_active", true);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("due_date", { ascending: true });
}

export async function selectProtoTaxPaymentsActiveOrdered(
  client: OperationalSupabase
) {
  return client
    .from("proto_tax_payments")
    .select("*")
    .eq("is_active", true)
    .order("payment_date", { ascending: false });
}

export async function selectProtoTaxPaymentsByObligationId(
  client: OperationalSupabase,
  obligationId: string
) {
  return client
    .from("proto_tax_payments")
    .select("*")
    .eq("obligation_id", obligationId)
    .eq("is_active", true)
    .order("payment_date", { ascending: false });
}

export async function selectProtoTaxObligationById(
  client: OperationalSupabase,
  id: string
) {
  return client.from("proto_tax_obligations").select("*").eq("id", id).maybeSingle();
}

export async function selectTaxAgendaForwardWindow(
  client: OperationalSupabase,
  selectCols: string,
  todayYmd: string,
  endYmd: string
) {
  return client
    .from("proto_tax_obligations")
    .select(selectCols)
    .eq("is_active", true)
    .gte("due_date", todayYmd)
    .lte("due_date", endYmd)
    .order("due_date", { ascending: true });
}

export async function selectTaxAgendaOverdueOpen(
  client: OperationalSupabase,
  selectCols: string,
  todayYmd: string
) {
  return client
    .from("proto_tax_obligations")
    .select(selectCols)
    .eq("is_active", true)
    .lt("due_date", todayYmd)
    .neq("status", "paid")
    .order("due_date", { ascending: true });
}

/** Paralelo de lecturas para `copilot-financial-alerts` (dataset predictivo). */
export async function loadPredictiveFinancialAlertsDatasetRows(
  client: OperationalSupabase
) {
  copilotProtoQueryDebugLog("proto_payments", undefined, false);
  copilotProtoQueryDebugLog("proto_receipts", undefined, false);
  copilotProtoQueryDebugLog("proto_invoices", undefined, false);
  const [payRes, taxObRes, taxPayRes, recRes, invRes] = await Promise.all([
    client
      .from("proto_payments")
      .select("id,amount,payment_date,category,obligation_id")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_tax_obligations")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_tax_payments")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_invoices")
      .select("balance_amount,collection_probability")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (payRes.error) throw new Error(payRes.error.message);
  if (taxObRes.error) throw new Error(taxObRes.error.message);
  if (taxPayRes.error) throw new Error(taxPayRes.error.message);
  if (recRes.error) throw new Error(recRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);

  return {
    payments: payRes.data ?? [],
    obligations: taxObRes.data ?? [],
    taxPayments: taxPayRes.data ?? [],
    receipts: recRes.data ?? [],
    invoices: invRes.data ?? [],
  };
}
