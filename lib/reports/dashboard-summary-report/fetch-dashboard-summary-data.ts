/**
 * Server-side data fetcher for the Dashboard Summary PDF.
 *
 * Fetches raw Supabase data ONCE, then runs generateFinancialConsistencyReport
 * multiple times (period, outstanding, per calendar month) without HTTP calls.
 * Mirrors exactly what app/copilot/dashboard/page.tsx computes client-side.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readInvoiceZetaClientName } from "@/lib/copilot-clients-directory";
import {
  generateFinancialConsistencyReport,
  type CompanyInput,
  type FinancialConsistencyReport,
  type InvoiceInput,
  type ReceiptInput,
} from "@/lib/copilot-financial-reconciliation";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import {
  determineDashboardState,
  extractActiveDebtClientRows,
  extractClientStates,
  extractDashboardCurrencyData,
  extractMonthlyPoint,
  extractRecentMovements,
  extractTopBillingForCurrency,
  extractTopDebtorsForCurrency,
  getMonthRangesForPeriod,
  type DashboardActiveDebtRow,
  type DashboardClientStates,
  type DashboardCurrencyData,
  type DashboardMonthlyPoint,
  type DashboardRecentMovement,
  type DashboardState,
} from "@/lib/copilot-dashboard-summary";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { treasuryCashPositionGet } from "@/lib/treasury/services/treasury-cash-opening-balance-service";
import { plannedCashObligationList } from "@/lib/treasury/services/planned-cash-obligation-service";
import {
  addDaysYmd,
  loadInactiveRecurringTemplateIds,
  summarizeScheduledOutflows,
} from "@/lib/treasury/treasury-scheduled-payments";
import { DEFAULT_MAX_ROWS, DEFAULT_PAGE_SIZE, fetchAllRows, fetchAllRowsSafe } from "@/lib/supabase-pagination";

export type DashboardSummaryFetchedData = {
  currencyData: DashboardCurrencyData[];
  clientStates: DashboardClientStates;
  dashboardState: DashboardState;
  monthlyData: DashboardMonthlyPoint[];
  activeDebtRows: DashboardActiveDebtRow[];
  recentMovements: DashboardRecentMovement[];
  top10DebtorsUYU: { name: string; value: number }[];
  top10DebtorsUSD: { name: string; value: number }[];
  top10BillingUYU: { name: string; value: number }[];
  top10BillingUSD: { name: string; value: number }[];
};

export async function fetchDashboardSummaryData(
  supabase: SupabaseClient,
  workspaceId: string,
  from: string,
  to: string
): Promise<DashboardSummaryFetchedData> {
  const today = new Date().toISOString().slice(0, 10);
  const paginationOpts = { pageSize: DEFAULT_PAGE_SIZE, maxRows: DEFAULT_MAX_ROWS };

  // ── Parallel data load ─────────────────────────────────────────────────────
  const [invoiceFetch, companyFetch, receiptFetch, portfolio, cashResult, outflowResult, inactiveTemplates] =
    await Promise.all([
      fetchAllRows<Record<string, unknown>>({
        ...paginationOpts,
        queryPage: (rangeFrom, rangeTo) =>
          supabase
            .from("proto_invoices")
            .select(
              "id, company_id, currency_code, total_amount, balance_amount, status, updated_at, issue_date, due_date, due_date_source, zeta_metadata"
            )
            .eq("workspace_company_id", workspaceId)
            .eq("is_active", true)
            .gte("issue_date", MIN_FINANCIAL_DATE)
            .order("id", { ascending: true })
            .range(rangeFrom, rangeTo),
      }),
      fetchAllRowsSafe<Record<string, unknown>>({
        ...paginationOpts,
        queryPage: (rangeFrom, rangeTo) =>
          supabase
            .from("proto_companies")
            .select("id, name")
            .eq("workspace_company_id", workspaceId)
            .eq("is_active", true)
            .order("id", { ascending: true })
            .range(rangeFrom, rangeTo),
      }),
      fetchAllRowsSafe<Record<string, unknown>>({
        ...paginationOpts,
        queryPage: (rangeFrom, rangeTo) =>
          supabase
            .from("proto_receipts")
            .select("id, company_id, currency_code, amount, receipt_date, status")
            .eq("workspace_company_id", workspaceId)
            .eq("is_active", true)
            .gte("receipt_date", MIN_FINANCIAL_DATE)
            .lte("receipt_date", to)
            .order("receipt_date", { ascending: true })
            .order("id", { ascending: true })
            .range(rangeFrom, rangeTo),
      }),
      getClientPortfolio(supabase, workspaceId),
      treasuryCashPositionGet(supabase, workspaceId),
      plannedCashObligationList(supabase, workspaceId, { direction: "outflow" }, 500),
      loadInactiveRecurringTemplateIds(supabase, workspaceId),
    ]);

  // ── Map raw rows to typed inputs ───────────────────────────────────────────
  const invoices: InvoiceInput[] = (invoiceFetch.rows ?? []).map((r) => ({
    id: String(r.id ?? ""),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    total_amount: toSafeNumber(r.total_amount),
    balance_amount: toSafeNumber(r.balance_amount),
    status: r.status != null ? String(r.status) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
    issue_date: r.issue_date != null ? String(r.issue_date) : null,
    due_date: r.due_date != null ? String(r.due_date) : null,
    due_date_source: r.due_date_source != null ? String(r.due_date_source) : null,
    is_credit_note: isCreditNoteFromMetadata(r.zeta_metadata),
    zeta_client_name: readInvoiceZetaClientName(r.zeta_metadata),
    reconciliation_missing_count: null,
  }));

  const companies: CompanyInput[] = (!companyFetch.fetchError ? companyFetch.rows : []).map((r) => ({
    id: String(r.id ?? ""),
    name: r.name != null ? String(r.name) : null,
  }));

  const receipts: ReceiptInput[] = (!receiptFetch.fetchError ? receiptFetch.rows : []).map((r) => ({
    id: String(r.id ?? ""),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    amount: toSafeNumber(r.amount),
    receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
    status: r.status != null ? String(r.status) : null,
  }));

  // ── Financial consistency reports ──────────────────────────────────────────
  const sharedInput = { workspaceId, invoices, companies, syncStates: [], receipts };

  const periodReport: FinancialConsistencyReport = generateFinancialConsistencyReport({
    ...sharedInput,
    mode: "period_only",
    periodStart: from,
    periodEnd: to,
  });

  const outstandingReport: FinancialConsistencyReport = generateFinancialConsistencyReport({
    ...sharedInput,
    mode: "all_outstanding",
  });

  // ── Treasury ───────────────────────────────────────────────────────────────
  const cashPositions = cashResult.ok ? cashResult.data.positions : [];
  const horizonEnd = addDaysYmd(today, 30);
  const outflowSummaries = outflowResult.ok
    ? summarizeScheduledOutflows(outflowResult.data.items, {
        asOfDate: today,
        horizonEndDate: horizonEnd,
        inactiveRecurringTemplateIds: inactiveTemplates,
      })
    : [];

  // ── Dashboard currency data ────────────────────────────────────────────────
  const currencyData = extractDashboardCurrencyData({
    periodReport,
    outstandingReport,
    cashPositions,
    outflowSummaries,
    portfolioRows: portfolio.rows,
  });

  // ── Monthly trend — one report per calendar month in range ─────────────────
  const monthRanges = getMonthRangesForPeriod(from, to, 12);
  const monthlyData: DashboardMonthlyPoint[] = monthRanges.map((m) => {
    const monthReport: FinancialConsistencyReport = generateFinancialConsistencyReport({
      ...sharedInput,
      mode: "period_only",
      periodStart: m.from,
      periodEnd: m.to,
    });
    return extractMonthlyPoint(monthReport, m.yearMonth);
  });

  // ── Portfolio-derived ──────────────────────────────────────────────────────
  const clientStates = extractClientStates(portfolio.rows);
  const dashboardState = determineDashboardState(currencyData, clientStates);
  const activeDebtRows = extractActiveDebtClientRows(portfolio.rows);
  const top10DebtorsUYU = extractTopDebtorsForCurrency(portfolio.rows, "UYU");
  const top10DebtorsUSD = extractTopDebtorsForCurrency(portfolio.rows, "USD");
  const top10BillingUYU = extractTopBillingForCurrency(portfolio.rows, "UYU");
  const top10BillingUSD = extractTopBillingForCurrency(portfolio.rows, "USD");
  const recentMovements = extractRecentMovements(portfolio.details, from, to, 30);

  return {
    currencyData,
    clientStates,
    dashboardState,
    monthlyData,
    activeDebtRows,
    recentMovements,
    top10DebtorsUYU,
    top10DebtorsUSD,
    top10BillingUYU,
    top10BillingUSD,
  };
}
