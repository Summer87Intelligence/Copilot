/**
 * GET /api/copilot/financial-reconciliation
 *
 * Diagnostic report: currency coverage, pending balances, per-client data staleness,
 * and sync freshness for the authenticated tenant workspace.
 *
 * This is a read-only diagnostic endpoint — it writes nothing to the DB.
 * The core logic lives in `lib/copilot-financial-reconciliation.ts` (pure, testable).
 *
 * Staleness thresholds:
 *   ok           ≤ 24 h since last invoice update
 *   warning      > 24 h
 *   critical     > 72 h
 *   never_synced no invoice updated_at found for client
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  generateFinancialConsistencyReport,
  type CompanyInput,
  type InvoiceInput,
  type ReconciliationMode,
  type SyncStateInput,
} from "@/lib/copilot-financial-reconciliation";
import {
  getCopilotOperationalEndDate,
  getCopilotOperationalStartDate,
} from "@/lib/copilot-operational-period";

const INVOICE_LIMIT = 5000;

export async function GET(request: NextRequest) {
  const started = Date.now();

  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const wid = tenantCompanyId.trim();
  const params = request.nextUrl.searchParams;
  const mode = (params.get("mode") ?? "period_only") as ReconciliationMode;
  const periodStart =
    params.get("period_start") ??
    (mode === "period_only" ? getCopilotOperationalStartDate() : undefined);
  const periodEnd =
    params.get("period_end") ??
    (mode === "period_only" ? getCopilotOperationalEndDate() : undefined);

  if (!wid) {
    return NextResponse.json(
      { ok: false, code: "FORBIDDEN_TENANT", message: "Sin workspace válido." },
      { status: 403 }
    );
  }

  // 1. Load all invoices (active) for the workspace
  const { data: invoiceData, error: invErr } = await supabase
    .from("proto_invoices")
    .select("id, company_id, currency_code, total_amount, balance_amount, status, updated_at, issue_date, zeta_metadata")
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .limit(INVOICE_LIMIT);

  if (invErr) {
    console.error(
      JSON.stringify({
        source: "financial_reconciliation",
        kind: "db_error",
        table: "proto_invoices",
        error: invErr.message,
        workspace_id: wid,
      })
    );
    return NextResponse.json(
      { ok: false, code: "DB_ERROR", message: invErr.message },
      { status: 500 }
    );
  }

  // 2. Load active companies for name resolution
  const { data: companyData, error: compErr } = await supabase
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", wid)
    .eq("is_active", true);

  if (compErr) {
    console.error(
      JSON.stringify({
        source: "financial_reconciliation",
        kind: "db_error",
        table: "proto_companies",
        error: compErr.message,
        workspace_id: wid,
      })
    );
    return NextResponse.json(
      { ok: false, code: "DB_ERROR", message: compErr.message },
      { status: 500 }
    );
  }

  // 3. Load workspace sync state rows (per resource_flow)
  const { data: syncData } = await supabase
    .from("zeta_sync_state")
    .select("resource_flow, last_success_at, bootstrap_completed")
    .order("resource_flow");

  // 4. Map to typed inputs
  const invoices: InvoiceInput[] = ((invoiceData ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    total_amount: typeof r.total_amount === "number" ? r.total_amount : null,
    balance_amount: typeof r.balance_amount === "number" ? r.balance_amount : null,
    status: r.status != null ? String(r.status) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
    issue_date: r.issue_date != null ? String(r.issue_date) : null,
    reconciliation_missing_count: (() => {
      try {
        const meta = r.zeta_metadata as Record<string, unknown> | null;
        const rec = meta?.zeta_reconciliation as Record<string, unknown> | undefined;
        const count = rec?.pending_sync_missing_count;
        return typeof count === "number" && count > 0 ? count : null;
      } catch { return null; }
    })(),
  }));

  const companies: CompanyInput[] = ((companyData ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    name: r.name != null ? String(r.name) : null,
  }));

  const syncStates: SyncStateInput[] = ((syncData ?? []) as Record<string, unknown>[]).map((r) => ({
    resource_flow: String(r.resource_flow ?? ""),
    last_success_at: r.last_success_at != null ? String(r.last_success_at) : null,
    bootstrap_completed: Boolean(r.bootstrap_completed),
  }));

  // 5. Generate report (pure)
  const report = generateFinancialConsistencyReport({
    workspaceId: wid,
    invoices,
    companies,
    syncStates,
    mode,
    periodStart,
    periodEnd,
  });

  // 6. Observability log (Fase 2K)
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "financial_reconciliation",
      kind: "report_generated",
      workspace_id: wid,
      total_invoices: report.totalInvoices,
      invoices_without_currency: report.totalInvoicesWithoutCurrency,
      voided_invoices: report.voidedInvoices,
      truncated: invoices.length >= INVOICE_LIMIT,
      currencies: report.currencies.map((c) => ({
        currency: c.currencyCode,
        total_pending: c.totalPending,
        total_invoiced: c.totalInvoiced,
        invoice_count: c.invoiceCount,
      })),
      stale_summary: report.staleSummary,
      sync_states: report.syncStates.map((s) => ({
        resource_flow: s.resource_flow,
        age_hours: s.ageHours,
        status: s.status,
      })),
      duration_ms: Date.now() - started,
    })
  );

  return NextResponse.json({
    ok: true,
    report,
    meta: {
      invoice_limit: INVOICE_LIMIT,
      invoices_loaded: invoices.length,
      truncated: invoices.length >= INVOICE_LIMIT,
    },
  });
}
