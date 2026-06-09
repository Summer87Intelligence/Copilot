/**
 * Auditoría READ-ONLY: rollup canónico de deuda activa / vencida entre Hoy, Cartera y Dashboard.
 *
 * Verifica que todos los módulos muestren la misma métrica:
 *   deuda_activa  → pendingAtCutoff (all_outstanding)
 *   deuda_vencida → portfolio overdue (due_date < hoy)
 *
 * Usage:
 *   npm run audit:debt-rollup-consistency
 *
 * Output: tmp/debt-rollup-consistency.csv
 * Exit 1 si alguna diferencia > 0.01 UYU/USD
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getClientPortfolio } from "../lib/copilot-clients-portfolio";
import { extractDashboardCurrencyData } from "../lib/copilot-dashboard-summary";
import {
  generateFinancialConsistencyReport,
  type CompanyInput,
  type InvoiceInput,
  type ReceiptInput,
  type SyncStateInput,
} from "../lib/copilot-financial-reconciliation";
import { isCreditNoteFromMetadata } from "../lib/copilot-zeta-credit-note";
import { MIN_FINANCIAL_DATE } from "../lib/copilot-operational-period";
import { toSafeNumber } from "../lib/copilot-numeric-parse";
import { mergeZetaSyncStateRows } from "../lib/integrations/zeta/zeta-sync-resource-keys";
import { fetchAllRows, fetchAllRowsSafe } from "../lib/supabase-pagination";
import {
  CANONICAL_DEBT_TOLERANCE,
  canonicalActiveDebtFromReport,
  canonicalActiveDebtFromStaleClients,
  canonicalDebtRoughlyEqual,
  resolveCanonicalActiveDebt,
  resolveCanonicalOverdueDebt,
  sumPortfolioRowActiveDebt,
} from "../lib/financial/canonical-debt-metrics";

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const WID =
  process.env.WORKSPACE_COMPANY_ID?.trim() ||
  process.env.AUDIT_WORKSPACE_ID?.trim() ||
  "";
const OUTPUT = path.join(process.cwd(), "tmp", "debt-rollup-consistency.csv");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type AuditRow = {
  check_id: string;
  metric: string;
  currency: string;
  source_a: string;
  value_a: number;
  source_b: string;
  value_b: number;
  delta: number;
  status: "OK" | "FAIL";
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function resolveWorkspaceId(supabase: SupabaseClient): Promise<string> {
  if (WID) return WID;
  const { data } = await supabase
    .from("proto_invoices")
    .select("workspace_company_id")
    .limit(1)
    .single();
  return (data as { workspace_company_id: string } | null)?.workspace_company_id ?? "";
}

async function loadOutstandingReport(workspaceId: string) {
  const paginationOpts = { pageSize: 1000, maxRows: 50_000 };

  const [invoiceFetch, companyFetch, receiptFetch, syncRes] = await Promise.all([
    fetchAllRows<Record<string, unknown>>({
      ...paginationOpts,
      queryPage: (from, to) =>
        db
          .from("proto_invoices")
          .select(
            "id, company_id, currency_code, total_amount, balance_amount, status, updated_at, issue_date, due_date, due_date_source, zeta_metadata"
          )
          .eq("workspace_company_id", workspaceId)
          .eq("is_active", true)
          .gte("issue_date", MIN_FINANCIAL_DATE)
          .order("id", { ascending: true })
          .range(from, to),
    }),
    fetchAllRowsSafe<Record<string, unknown>>({
      ...paginationOpts,
      queryPage: (from, to) =>
        db
          .from("proto_companies")
          .select("id, name")
          .eq("workspace_company_id", workspaceId)
          .eq("is_active", true)
          .order("id", { ascending: true })
          .range(from, to),
    }),
    fetchAllRowsSafe<Record<string, unknown>>({
      ...paginationOpts,
      queryPage: (from, to) =>
        db
          .from("proto_receipts")
          .select("id, company_id, currency_code, amount, receipt_date, status")
          .eq("workspace_company_id", workspaceId)
          .eq("is_active", true)
          .gte("receipt_date", MIN_FINANCIAL_DATE)
          .order("receipt_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    }),
    db
      .from("zeta_sync_state")
      .select("resource_flow, last_success_at, bootstrap_completed")
      .order("resource_flow"),
  ]);

  const invoices: InvoiceInput[] = invoiceFetch.rows.map((r) => ({
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
  }));

  const companies: CompanyInput[] = companyFetch.rows.map((r) => ({
    id: String(r.id ?? ""),
    name: r.name != null ? String(r.name) : null,
  }));

  const receipts: ReceiptInput[] = receiptFetch.rows.map((r) => ({
    id: String(r.id ?? ""),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    amount: toSafeNumber(r.amount),
    receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
    status: r.status != null ? String(r.status) : null,
  }));

  const syncStates: SyncStateInput[] = mergeZetaSyncStateRows(
    ((syncRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      resource_flow: String(r.resource_flow ?? ""),
      last_success_at: r.last_success_at != null ? String(r.last_success_at) : null,
      bootstrap_completed: Boolean(r.bootstrap_completed),
    }))
  );

  const report = generateFinancialConsistencyReport({
    workspaceId,
    invoices,
    companies,
    receipts,
    syncStates,
    mode: "all_outstanding",
  });

  return report;
}

function hoyOverdueFromPortfolio(
  portfolioRows: { overdue_uyu?: number; overdue_usd?: number }[]
) {
  return resolveCanonicalOverdueDebt({ portfolioRows });
}

function addPair(
  rows: AuditRow[],
  checkId: string,
  metric: string,
  currency: "UYU" | "USD",
  sourceA: string,
  valueA: number,
  sourceB: string,
  valueB: number
) {
  const delta = round2(valueA - valueB);
  rows.push({
    check_id: checkId,
    metric,
    currency,
    source_a: sourceA,
    value_a: round2(valueA),
    source_b: sourceB,
    value_b: round2(valueB),
    delta,
    status: Math.abs(delta) <= CANONICAL_DEBT_TOLERANCE ? "OK" : "FAIL",
  });
}

async function main() {
  const workspaceId = await resolveWorkspaceId(db);
  if (!workspaceId) {
    console.error("❌ No se pudo resolver workspace_company_id");
    process.exit(1);
  }

  console.log(`\n[audit:debt-rollup] workspace=${workspaceId}\n`);

  const [report, portfolio] = await Promise.all([
    loadOutstandingReport(workspaceId),
    getClientPortfolio(db, workspaceId),
  ]);

  const canonicalActive = canonicalActiveDebtFromReport(report);
  const canonicalOverdue = resolveCanonicalOverdueDebt({
    portfolioRows: portfolio.rows,
    agingByCurrency: report.agingByCurrency,
  });
  const clientRowActive = canonicalActiveDebtFromStaleClients(report);
  const portfolioRowActive = sumPortfolioRowActiveDebt(portfolio.rows);

  const hoyOverdue = hoyOverdueFromPortfolio(portfolio.rows);
  const hoyActive = resolveCanonicalActiveDebt({
    outstandingReportCurrencies: report.currencies,
    portfolioRows: portfolio.rows,
  });

  const dashboardRows = extractDashboardCurrencyData({
    periodReport: null,
    outstandingReport: report,
    cashPositions: [],
    outflowSummaries: [],
    portfolioRows: portfolio.rows,
  });
  const dashboardActive = {
    UYU: dashboardRows.find((d) => d.currency === "UYU")?.deudaActiva ?? 0,
    USD: dashboardRows.find((d) => d.currency === "USD")?.deudaActiva ?? 0,
  };
  const dashboardOverdue = {
    UYU: dashboardRows.find((d) => d.currency === "UYU")?.deudaVencida ?? 0,
    USD: dashboardRows.find((d) => d.currency === "USD")?.deudaVencida ?? 0,
  };

  const auditRows: AuditRow[] = [];

  for (const currency of ["UYU", "USD"] as const) {
    addPair(
      auditRows,
      `DR-${currency}-01`,
      "deuda_activa",
      currency,
      "Hoy (pendingReceivables)",
      hoyActive[currency],
      "Cartera (pendingAtCutoff)",
      canonicalActive[currency]
    );
    addPair(
      auditRows,
      `DR-${currency}-02`,
      "deuda_activa",
      currency,
      "Dashboard (deudaActiva)",
      dashboardActive[currency],
      "Cartera (pendingAtCutoff)",
      canonicalActive[currency]
    );
    addPair(
      auditRows,
      `DR-${currency}-03`,
      "deuda_activa",
      currency,
      "SUM(staleClients.pending)",
      clientRowActive[currency],
      "Cartera (pendingAtCutoff)",
      canonicalActive[currency]
    );
    addPair(
      auditRows,
      `DR-${currency}-04`,
      "deuda_vencida",
      currency,
      "Hoy (portfolio overdue)",
      hoyOverdue[currency],
      "Portfolio overdue (due_date < hoy)",
      canonicalOverdue[currency]
    );
    addPair(
      auditRows,
      `DR-${currency}-05`,
      "deuda_vencida",
      currency,
      "Dashboard (deudaVencida)",
      dashboardOverdue[currency],
      "Portfolio overdue (due_date < hoy)",
      canonicalOverdue[currency]
    );
  }

  // Informativo: portfolio hub row sum (legacy) vs canónico
  for (const currency of ["UYU", "USD"] as const) {
    addPair(
      auditRows,
      `DR-${currency}-INFO`,
      "deuda_activa_portfolio_hub",
      currency,
      "Portfolio hub Σ debt_*",
      portfolioRowActive[currency],
      "Canónico pendingAtCutoff",
      canonicalActive[currency]
    );
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const header =
    "check_id,metric,currency,source_a,value_a,source_b,value_b,delta,status\n";
  const body = auditRows
    .map(
      (r) =>
        `${r.check_id},${r.metric},${r.currency},${r.source_a},${r.value_a},${r.source_b},${r.value_b},${r.delta},${r.status}`
    )
    .join("\n");
  fs.writeFileSync(OUTPUT, header + body + "\n", "utf-8");

  const coreRows = auditRows.filter((r) => !r.check_id.endsWith("-INFO"));
  const fails = coreRows.filter((r) => r.status === "FAIL");

  console.log("Canónico (Cartera pendingAtCutoff):");
  console.log(`  UYU active=${canonicalActive.UYU.toLocaleString("es-UY")} overdue=${canonicalOverdue.UYU.toLocaleString("es-UY")}`);
  console.log(`  USD active=${canonicalActive.USD.toLocaleString("es-UY")} overdue=${canonicalOverdue.USD.toLocaleString("es-UY")}`);
  console.log("\nHoy (post-fix):");
  console.log(`  UYU active=${hoyActive.UYU.toLocaleString("es-UY")} overdue=${hoyOverdue.UYU.toLocaleString("es-UY")}`);
  console.log(`  USD active=${hoyActive.USD.toLocaleString("es-UY")} overdue=${hoyOverdue.USD.toLocaleString("es-UY")}`);
  console.log("\nPortfolio hub legacy Σ (informativo):");
  console.log(`  UYU=${portfolioRowActive.UYU.toLocaleString("es-UY")} USD=${portfolioRowActive.USD.toLocaleString("es-UY")}`);

  console.log(`\n📄 CSV: ${OUTPUT}`);
  console.log(`Checks: ${coreRows.filter((r) => r.status === "OK").length}/${coreRows.length} OK`);

  if (fails.length > 0) {
    console.error("\n❌ Gate FAIL — diferencias de rollup:");
    for (const f of fails) {
      console.error(
        `  [${f.check_id}] ${f.metric} ${f.currency}: ${f.source_a}=${f.value_a} vs ${f.source_b}=${f.value_b} (Δ=${f.delta})`
      );
    }
    process.exit(1);
  }

  if (!canonicalDebtRoughlyEqual(portfolioRowActive, canonicalActive)) {
    console.log(
      "\nℹ️  Portfolio hub Σ debt_* difiere del canónico (esperado si hub no incluye todo el universo)."
    );
  }

  console.log("\n✅ Gate PASS — rollup canónico consistente entre Hoy, Cartera y Dashboard.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
