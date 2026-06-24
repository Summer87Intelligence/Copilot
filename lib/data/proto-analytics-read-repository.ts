import { readInvoiceFinancial } from "@/lib/copilot-invoice-financial-read";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import {
  COPILOT_OPERATIONAL_START_DATE,
  MIN_FINANCIAL_DATE,
} from "@/lib/copilot-operational-period";

export const FINANCIAL_SNAPSHOT_ROW_CAP = 5000;
const ROW_CAP = FINANCIAL_SNAPSHOT_ROW_CAP;
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

/** Metadatos de la carga de facturas + `invoice_financials` para `diagnostics` del snapshot API (sin cambiar KPIs). */
export type FinancialSnapshotLoadDiagnostics = {
  active_invoice_count: number;
  invoice_financials_distinct_keys: number;
  invoice_financials_matched_invoice_ids: number;
  invoice_financials_coverage: "full" | "partial" | "unavailable";
};

/** Orden SQL compartido: recibos por `receipt_date DESC`. */
export const FINANCIAL_FACTS_ORDER_RECEIPTS = "receipt_date_desc" as const;
/** Orden SQL compartido: pagos por `payment_date DESC`. */
export const FINANCIAL_FACTS_ORDER_PAYMENTS = "payment_date_desc" as const;
/** Orden SQL compartido: facturas por `issue_date DESC`. */
export const FINANCIAL_FACTS_ORDER_INVOICES = "issue_date_desc" as const;

export type FinancialFactsBundleMeta = {
  row_cap: number;
  /** true si cualquier tabla alcanzó el límite de filas; los KPIs pueden ser parciales. */
  isTruncated: boolean;
  /** Nombres de tablas que devolvieron exactamente row_cap filas. */
  tables_at_cap: string[];
  order_receipts: typeof FINANCIAL_FACTS_ORDER_RECEIPTS;
  order_payments: typeof FINANCIAL_FACTS_ORDER_PAYMENTS;
  order_invoices: typeof FINANCIAL_FACTS_ORDER_INVOICES;
  invoice_merge_applied: true;
  balance_authoritative_source: "proto_invoices";
  snapshotLoadDiagnostics: FinancialSnapshotLoadDiagnostics;
};

/**
 * Hechos mínimos compartidos por `financial-snapshot` y `cashflow-dataset` (una sola lectura / mismas reglas).
 * Filas vienen de PostgREST como `Record<string, unknown>`; columnas garantizadas según `select` del loader.
 */
export type FinancialFactsBundle = {
  receipts: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  tax_obligations: Record<string, unknown>[];
  tax_payments: Record<string, unknown>[];
  meta: FinancialFactsBundleMeta;
};

export type LoadCashflowEngineDatasetRowsResult = {
  receipts: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  /** Aditivo: misma carga que snapshot; compatible con clientes que ignoran claves extra. */
  meta: FinancialFactsBundleMeta;
};

function numFromUnknown(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Clave hacia `proto_invoices.id` en filas de `public.invoice_financials` (la vista expone la PK como `id`). */
function invoiceFinancialLinkId(row: InvoiceFinancialRow): string {
  return String(row.id ?? "").trim();
}

/** Saldo derivado en la vista. */
function invoiceFinancialBalance(row: InvoiceFinancialRow): number {
  return numFromUnknown(row.balance);
}

/**
 * Mapa invoice_id → saldo desde `invoice_financials`.
 * Si la vista no responde o no hay filas, devuelve mapa vacío (se sigue usando `proto_invoices.balance_amount`).
 */
/** Expuesto para validación financiera (ETAPA 1) sin duplicar lógica de lectura de `invoice_financials`. */
export async function fetchInvoiceFinancialBalanceMap(
  client: OperationalSupabase,
  // Mantenido por estabilidad de firma: el tenant ya viene acotado en `invoiceIds`
  // (caller filtra por proto_invoices.workspace_company_id antes de pasar los ids).
  // La vista no expone workspace_company_id; no se puede ni se necesita filtrar acá.
  _workspaceCompanyId: string | undefined,
  invoiceIds: readonly string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uniq = [...new Set(invoiceIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) return map;

  // Vista `public.invoice_financials` expone (id, total_amount, payments, balance).
  // `id` es la PK pasada through desde `proto_invoices.id` (no existe `invoice_id`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (client as any).from("invoice_financials")
    .select("id, balance")
    .limit(ROW_CAP)
    .in("id", uniq.slice(0, 800));

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

/**
 * Carga única de hechos proto_* + fiscal, compartida por snapshot y cashflow.
 * — Mismo `ROW_CAP`, mismo `ORDER BY` en recibos/pagos/facturas.
 * — Mismo merge de facturas que el snapshot histórico (`readInvoiceFinancial` + IF opcional).
 */
export async function loadFinancialFactsBundle(
  client: OperationalSupabase,
  workspaceCompanyId: string
): Promise<FinancialFactsBundle> {
  const wid = workspaceCompanyId.trim();
  if (!wid) throw new Error("[copilot-analytics] workspaceCompanyId requerido para queries de analytics");

  const [recRes, payRes, invRes, taxObRes, taxPayRes] = await Promise.all([
    (() => {
      copilotProtoQueryDebugLog("proto_receipts", wid, Boolean(wid));
      let q = client
        .from("proto_receipts")
        .select("amount,invoice_id,receipt_date,company_id,currency_code")
        .eq("is_active", true)
        .gte("receipt_date", COPILOT_OPERATIONAL_START_DATE);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.order("receipt_date", { ascending: false }).limit(ROW_CAP);
    })(),
    (() => {
      copilotProtoQueryDebugLog("proto_payments", wid, Boolean(wid));
      let q = client
        .from("proto_payments")
        .select("amount,payment_date")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.order("payment_date", { ascending: false }).limit(ROW_CAP);
    })(),
    (async () => {
      copilotProtoQueryDebugLog("proto_invoices", wid, Boolean(wid));
      let qMeta = client
        .from("proto_invoices")
        .select(
          "id,company_id,issue_date,due_date,balance_amount,collection_probability,currency_code,total_amount"
        )
        .eq("is_active", true)
        .gte("issue_date", COPILOT_OPERATIONAL_START_DATE);
      if (wid) qMeta = qMeta.eq("workspace_company_id", wid);
      const invMeta = await qMeta.order("issue_date", { ascending: false }).limit(ROW_CAP);
      if (invMeta.error) return invMeta;
      const rows = (invMeta.data ?? []) as Record<string, unknown>[];
      const ids = rows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
      const balMap = await fetchInvoiceFinancialBalanceMap(client, wid, ids);
      const merged = rows.map((row) => {
        const id = String(row.id ?? "").trim();
        const r = readInvoiceFinancial({
          invoiceId: id,
          balancePersisted: row.balance_amount,
          balanceFromFinancialsMap: balMap,
        });
        return {
          id: row.id,
          company_id: row.company_id,
          issue_date: row.issue_date,
          due_date: row.due_date,
          balance_amount: r.balance_authoritative,
          collection_probability: row.collection_probability,
          currency_code: row.currency_code,
          total_amount: row.total_amount,
        };
      });
      const matchedIfCount = ids.filter((id) => balMap.has(id)).length;
      const coverage: FinancialSnapshotLoadDiagnostics["invoice_financials_coverage"] =
        ids.length === 0
          ? "full"
          : matchedIfCount === 0
            ? "unavailable"
            : matchedIfCount >= ids.length
              ? "full"
              : "partial";
      const snapshotDiagnostics: FinancialSnapshotLoadDiagnostics = {
        active_invoice_count: ids.length,
        invoice_financials_distinct_keys: balMap.size,
        invoice_financials_matched_invoice_ids: matchedIfCount,
        invoice_financials_coverage: coverage,
      };
      return { data: merged, error: null, snapshotDiagnostics };
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

  const invPayload = invRes as {
    data: unknown[] | null;
    error: { message: string } | null;
    snapshotDiagnostics?: FinancialSnapshotLoadDiagnostics;
  };
  const snapshotLoadDiagnostics: FinancialSnapshotLoadDiagnostics =
    invPayload.snapshotDiagnostics ?? {
      active_invoice_count: 0,
      invoice_financials_distinct_keys: 0,
      invoice_financials_matched_invoice_ids: 0,
      invoice_financials_coverage: "unavailable",
    };

  const receipts = (recRes.data ?? []) as Record<string, unknown>[];
  const payments = (payRes.data ?? []) as Record<string, unknown>[];
  const invoices = (invPayload.data ?? []) as Record<string, unknown>[];
  const tax_obligations = (taxObRes.data ?? []) as Record<string, unknown>[];
  const tax_payments = (taxPayRes.data ?? []) as Record<string, unknown>[];

  const tables_at_cap: string[] = [];
  if (receipts.length >= ROW_CAP) tables_at_cap.push("proto_receipts");
  if (payments.length >= ROW_CAP) tables_at_cap.push("proto_payments");
  if (invoices.length >= ROW_CAP) tables_at_cap.push("proto_invoices");
  if (tax_obligations.length >= ROW_CAP) tables_at_cap.push("proto_tax_obligations");
  if (tax_payments.length >= ROW_CAP) tables_at_cap.push("proto_tax_payments");

  const meta: FinancialFactsBundleMeta = {
    row_cap: FINANCIAL_SNAPSHOT_ROW_CAP,
    isTruncated: tables_at_cap.length > 0,
    tables_at_cap,
    order_receipts: FINANCIAL_FACTS_ORDER_RECEIPTS,
    order_payments: FINANCIAL_FACTS_ORDER_PAYMENTS,
    order_invoices: FINANCIAL_FACTS_ORDER_INVOICES,
    invoice_merge_applied: true,
    balance_authoritative_source: "proto_invoices",
    snapshotLoadDiagnostics,
  };

  return { receipts, payments, invoices, tax_obligations, tax_payments, meta };
}

/**
 * Dataset del motor de flujo de caja (columnas mínimas).
 * Delega en `loadFinancialFactsBundle` (misma carga que snapshot + meta aditiva).
 */
export async function loadCashflowEngineDatasetRows(
  client: OperationalSupabase,
  workspaceCompanyId: string
): Promise<LoadCashflowEngineDatasetRowsResult> {
  const bundle = await loadFinancialFactsBundle(client, workspaceCompanyId);
  return {
    receipts: bundle.receipts,
    payments: bundle.payments,
    invoices: bundle.invoices,
    meta: bundle.meta,
  };
}

/**
 * Filas para snapshot financiero consolidado (`copilot-financial-engine`).
 * @param workspaceCompanyId Filtra por `workspace_company_id` (= `public.companies.id` del tenant). Obligatorio.
 */
export async function loadFinancialSnapshotRows(
  client: OperationalSupabase,
  workspaceCompanyId: string
) {
  const bundle = await loadFinancialFactsBundle(client, workspaceCompanyId);
  return {
    receipts: bundle.receipts.map((r) => ({ amount: r.amount, currency_code: r.currency_code })),
    payments: bundle.payments.map((p) => ({
      amount: p.amount,
      payment_date: p.payment_date,
    })),
    invoices: bundle.invoices.map((inv) => ({
      balance_amount: inv.balance_amount,
      collection_probability: inv.collection_probability,
      currency_code: inv.currency_code,
      total_amount: inv.total_amount,
      due_date: inv.due_date,
    })),
    taxObligations: bundle.tax_obligations,
    taxPayments: bundle.tax_payments,
    snapshotLoadDiagnostics: bundle.meta.snapshotLoadDiagnostics,
    isTruncated: bundle.meta.isTruncated,
    tablesAtCap: bundle.meta.tables_at_cap,
  };
}

export async function selectProtoInvoicesInsightWindow(
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  copilotProtoQueryDebugLog("proto_invoices", wid, Boolean(wid));
  let q = client
    .from("proto_invoices")
    .select("*")
    .eq("is_active", true);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("created_at", { ascending: false }).limit(INSIGHT_ROW_LIMIT);
}

export async function selectProtoPaymentsInsightWindow(
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  copilotProtoQueryDebugLog("proto_payments", wid, Boolean(wid));
  let q = client
    .from("proto_payments")
    .select("*")
    .eq("is_active", true);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("created_at", { ascending: false }).limit(INSIGHT_ROW_LIMIT);
}

export async function selectProtoCompaniesInsightWindow(
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client
    .from("proto_companies")
    .select("*")
    .eq("is_active", true);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("created_at", { ascending: false }).limit(INSIGHT_ROW_LIMIT);
}

/** Lecturas acotadas en un solo round-trip cuando hacen falta las tres tablas. */
export async function loadInsightEngineProtoRows(
  client: OperationalSupabase,
  workspaceCompanyId: string
) {
  const [invRes, payRes, compRes] = await Promise.all([
    selectProtoInvoicesInsightWindow(client, workspaceCompanyId),
    selectProtoPaymentsInsightWindow(client, workspaceCompanyId),
    selectProtoCompaniesInsightWindow(client, workspaceCompanyId),
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
  workspaceCompanyId: string
) {
  const wid = workspaceCompanyId.trim();
  if (!wid) throw new Error("[copilot-analytics] workspaceCompanyId requerido para queries de analytics");
  const [cRes, iRes, rRes, ctRes] = await Promise.all([
    (() => {
      let q = client.from("proto_companies").select("*").eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.order("name", { ascending: true }).limit(ROW_CAP);
    })(),
    (() => {
      copilotProtoQueryDebugLog("proto_invoices", wid, Boolean(wid));
      let q = client
        .from("proto_invoices")
        .select("*")
        .eq("is_active", true)
        .gte("issue_date", MIN_FINANCIAL_DATE);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.order("id", { ascending: true }).limit(ROW_CAP);
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
    for (const inv of invRows) {
      const id = String(inv.id ?? "").trim();
      if (!id) continue;
      const r = readInvoiceFinancial({
        invoiceId: id,
        balancePersisted: inv.balance_amount,
        totalAmount: inv.total_amount,
        balanceFromFinancialsMap: balMap,
      });
      inv.balance_amount = r.balance_authoritative;
    }
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
  client: OperationalSupabase,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client.from("proto_tax_payments").select("*").eq("is_active", true);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("payment_date", { ascending: false });
}

export async function selectProtoTaxPaymentsByObligationId(
  client: OperationalSupabase,
  obligationId: string,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client
    .from("proto_tax_payments")
    .select("*")
    .eq("obligation_id", obligationId)
    .eq("is_active", true);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("payment_date", { ascending: false });
}

export async function selectProtoTaxObligationById(
  client: OperationalSupabase,
  id: string,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client.from("proto_tax_obligations").select("*").eq("id", id);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.maybeSingle();
}

export async function selectTaxAgendaForwardWindow(
  client: OperationalSupabase,
  selectCols: string,
  todayYmd: string,
  endYmd: string,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client
    .from("proto_tax_obligations")
    .select(selectCols)
    .eq("is_active", true)
    .gte("due_date", todayYmd)
    .lte("due_date", endYmd);
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("due_date", { ascending: true });
}

export async function selectTaxAgendaOverdueOpen(
  client: OperationalSupabase,
  selectCols: string,
  todayYmd: string,
  workspaceCompanyId?: string
) {
  const wid = workspaceCompanyId?.trim();
  let q = client
    .from("proto_tax_obligations")
    .select(selectCols)
    .eq("is_active", true)
    .lt("due_date", todayYmd)
    .neq("status", "paid");
  if (wid) q = q.eq("workspace_company_id", wid);
  return q.order("due_date", { ascending: true });
}

/** Paralelo de lecturas para `copilot-financial-alerts` (dataset predictivo). */
export async function loadPredictiveFinancialAlertsDatasetRows(
  client: OperationalSupabase,
  workspaceCompanyId: string
) {
  const wid = workspaceCompanyId.trim();
  if (!wid) throw new Error("[copilot-analytics] workspaceCompanyId requerido para queries de analytics");
  copilotProtoQueryDebugLog("proto_payments", undefined, false);
  copilotProtoQueryDebugLog("proto_receipts", undefined, false);
  copilotProtoQueryDebugLog("proto_invoices", undefined, false);
  const [payRes, taxObRes, taxPayRes, recRes, invRes] = await Promise.all([
    (() => {
      let q = client
        .from("proto_payments")
        .select("id,amount,payment_date,category,obligation_id")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
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
    (() => {
      let q = client
        .from("proto_receipts")
        .select("amount")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
    (() => {
      let q = client
        .from("proto_invoices")
        .select("balance_amount,collection_probability")
        .eq("is_active", true);
      if (wid) q = q.eq("workspace_company_id", wid);
      return q.limit(ROW_CAP);
    })(),
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
