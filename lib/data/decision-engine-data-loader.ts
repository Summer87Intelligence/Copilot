/**
 * Decision Engine — Data Loader.
 * Carga los datos necesarios para el motor desde Supabase.
 * NO hace cálculos: solo fetch + mapeo a tipos DE.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";
import type {
  DECollectionAction,
  DECompany,
  DEPendingInvoice,
  DERecentInvoice,
  DERecentReceipt,
  DecisionEngineDataBundle,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function ninetyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().split("T")[0]!;
}

// ---------------------------------------------------------------------------
// Loaders individuales
// ---------------------------------------------------------------------------

async function loadPendingInvoices(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DEPendingInvoice[]> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, company_id, currency_code, total_amount, balance_amount, issue_date, due_date, status")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .gt("balance_amount", 0)
    .gte("issue_date", COPILOT_OPERATIONAL_START_DATE)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(2000);

  if (error) throw new Error(`DE: loadPendingInvoices: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id:             str(row["id"]),
    company_id:     str(row["company_id"]),
    currency_code:  str(row["currency_code"]) || "UYU",
    total_amount:   num(row["total_amount"]),
    balance_amount: num(row["balance_amount"]),
    issue_date:     strOrNull(row["issue_date"]),
    due_date:       strOrNull(row["due_date"]),
    status:         strOrNull(row["status"]),
  }));
}

async function loadRecentInvoices(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DERecentInvoice[]> {
  const since = ninetyDaysAgo();
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, company_id, currency_code, total_amount, issue_date")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .neq("status", "void")
    .neq("status", "cancelled")
    .gte("issue_date", since)
    .limit(2000);

  if (error) throw new Error(`DE: loadRecentInvoices: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id:            str(row["id"]),
    company_id:    str(row["company_id"]),
    currency_code: str(row["currency_code"]) || "UYU",
    total_amount:  num(row["total_amount"]),
    issue_date:    str(row["issue_date"]),
  }));
}

async function loadRecentReceipts(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DERecentReceipt[]> {
  const since = ninetyDaysAgo();
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id, company_id, currency_code, amount, receipt_date")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .neq("status", "void")
    .gte("receipt_date", since)
    .limit(2000);

  if (error) throw new Error(`DE: loadRecentReceipts: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id:            str(row["id"]),
    company_id:    strOrNull(row["company_id"]),
    currency_code: str(row["currency_code"]) || "UYU",
    amount:        num(row["amount"]),
    receipt_date:  str(row["receipt_date"]),
  }));
}

async function loadCompanies(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DECompany[]> {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .limit(500);

  if (error) throw new Error(`DE: loadCompanies: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id:   str(row["id"]),
    name: str(row["name"]),
  }));
}

async function loadRecentActions(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DECollectionAction[]> {
  const { data, error } = await supabase
    .from("collection_actions")
    .select(
      "id, company_id, action_type, status, priority, notes, promise_date, promise_amount, promise_currency, contact_date, created_at"
    )
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    // Si la tabla aún no existe (migration pendiente), no bloquear
    console.warn("DE: loadRecentActions error (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id:               str(row["id"]),
    company_id:       str(row["company_id"]),
    action_type:      str(row["action_type"]),
    status:           str(row["status"]),
    priority:         str(row["priority"]),
    notes:            strOrNull(row["notes"]),
    promise_date:     strOrNull(row["promise_date"]),
    promise_amount:   numOrNull(row["promise_amount"]),
    promise_currency: strOrNull(row["promise_currency"]),
    contact_date:     strOrNull(row["contact_date"]),
    created_at:       str(row["created_at"]),
  }));
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function loadDecisionEngineBundle(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DecisionEngineDataBundle> {
  const [pendingInvoices, recentInvoices, recentReceipts, companies, recentActions] =
    await Promise.all([
      loadPendingInvoices(supabase, tenantCompanyId),
      loadRecentInvoices(supabase, tenantCompanyId),
      loadRecentReceipts(supabase, tenantCompanyId),
      loadCompanies(supabase, tenantCompanyId),
      loadRecentActions(supabase, tenantCompanyId),
    ]);

  return {
    pendingInvoices,
    recentInvoices,
    recentReceipts,
    companies,
    recentActions,
    loadedAt: new Date().toISOString(),
  };
}
