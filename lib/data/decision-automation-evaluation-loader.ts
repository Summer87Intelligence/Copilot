/**
 * Phase 4C — datos para evaluación de reglas de automatización.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOperatorAnalyticsInput } from "@/lib/data/decision-operator-analytics-loader";
import type {
  AutomationCustomerContext,
  AutomationEvaluationInput,
  DECollectionAction,
  DEPendingInvoice,
} from "@/lib/decision-engine/de-types";

function daysSince(iso: string | null, now: Date): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 999;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

async function loadPendingInvoicesLite(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DEPendingInvoice[]> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, company_id, currency_code, total_amount, balance_amount, issue_date, due_date, status")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .gt("balance_amount", 0)
    .limit(2000);

  if (error) {
    console.warn("DE automation: loadPendingInvoicesLite (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"] ?? ""),
    company_id: String(row["company_id"] ?? ""),
    currency_code: String(row["currency_code"] ?? "UYU"),
    total_amount: Number(row["total_amount"] ?? 0),
    balance_amount: Number(row["balance_amount"] ?? 0),
    issue_date: typeof row["issue_date"] === "string" ? row["issue_date"] : null,
    due_date: typeof row["due_date"] === "string" ? row["due_date"] : null,
    status: typeof row["status"] === "string" ? row["status"] : null,
  }));
}

async function loadRecentReceiptsLite(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  sinceDate: string
): Promise<{ company_id: string; amount: number; receipt_date: string }[]> {
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("company_id, amount, receipt_date")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .gte("receipt_date", sinceDate)
    .limit(500);

  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    company_id: String(row["company_id"] ?? ""),
    amount: Number(row["amount"] ?? 0),
    receipt_date: String(row["receipt_date"] ?? ""),
  }));
}

function buildCustomerContexts(
  base: Awaited<ReturnType<typeof loadOperatorAnalyticsInput>>,
  invoices: DEPendingInvoice[],
  receiptsByCompany: Map<string, number>,
  now: Date
): AutomationCustomerContext[] {
  const totalPending = invoices.reduce((s, i) => s + i.balance_amount, 0);
  const customerIds = new Set<string>();

  for (const s of base.operationalStates) customerIds.add(s.customer_id);
  for (const inv of invoices) customerIds.add(inv.company_id);

  const actionsByCustomer = new Map<string, DECollectionAction[]>();
  for (const a of base.recentActions) {
    const list = actionsByCustomer.get(a.company_id) ?? [];
    list.push(a);
    actionsByCustomer.set(a.company_id, list);
  }

  const followUpByCustomer = new Map(
    base.pendingFollowUps.map((f) => [f.customer_id, f] as const)
  );
  const stateByCustomer = new Map(
    base.operationalStates.map((s) => [s.customer_id, s] as const)
  );

  const contexts: AutomationCustomerContext[] = [];

  for (const customerId of customerIds) {
    const companyInvoices = invoices.filter((i) => i.company_id === customerId);
    const pending_balance = companyInvoices.reduce((s, i) => s + i.balance_amount, 0);
    const concentration_pct =
      totalPending > 0 ? Math.round((pending_balance / totalPending) * 1000) / 10 : 0;

    let oldest_invoice_days = 0;
    for (const inv of companyInvoices) {
      const ref = inv.due_date ?? inv.issue_date;
      const d = daysSince(ref, now);
      if (d > oldest_invoice_days) oldest_invoice_days = d;
    }

    const actions = actionsByCustomer.get(customerId) ?? [];
    const state = stateByCustomer.get(customerId) ?? null;
    const last_action_at = actions[0]?.created_at ?? null;
    const last_contact_at = state?.last_contact_at ?? actions.find((a) => a.contact_date)?.contact_date ?? null;

    const has_partial_payment_recent =
      (receiptsByCompany.get(customerId) ?? 0) > 0 && pending_balance > 0;

    contexts.push({
      customer_id: customerId,
      state,
      pending_follow_up: followUpByCustomer.get(customerId) ?? null,
      recent_actions: actions,
      concentration_pct,
      oldest_invoice_days,
      pending_balance,
      last_action_at,
      last_contact_at,
      has_partial_payment_recent,
    });
  }

  return contexts;
}

export async function loadAutomationEvaluationInput(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerIds?: string[],
  now = new Date()
): Promise<AutomationEvaluationInput> {
  const sinceReceipts = new Date(now);
  sinceReceipts.setDate(sinceReceipts.getDate() - 14);
  const sinceReceiptsStr = sinceReceipts.toISOString().split("T")[0]!;

  const [base, invoices, receipts] = await Promise.all([
    loadOperatorAnalyticsInput(supabase, tenantCompanyId),
    loadPendingInvoicesLite(supabase, tenantCompanyId),
    loadRecentReceiptsLite(supabase, tenantCompanyId, sinceReceiptsStr),
  ]);

  const receiptsByCompany = new Map<string, number>();
  for (const r of receipts) {
    if (!r.company_id) continue;
    receiptsByCompany.set(r.company_id, (receiptsByCompany.get(r.company_id) ?? 0) + r.amount);
  }

  let customers = buildCustomerContexts(base, invoices, receiptsByCompany, now);
  if (customerIds?.length) {
    const filter = new Set(customerIds);
    customers = customers.filter((c) => filter.has(c.customer_id));
  }

  return {
    customers,
    operatorNames: base.operatorNames,
    loadedAt: now.toISOString(),
  };
}
