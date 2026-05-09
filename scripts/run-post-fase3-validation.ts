/**
 * Post-Fase 3 validation script.
 * Runs saldos sync for all clients, then generates reconciliation reports
 * (all_outstanding + period_only) and compares against PDF reference values.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-post-fase3-validation.ts [--skip-sync] [--workspace-id ID]
 *
 * Flags:
 *   --skip-sync       Skip saldos sync (just report)
 *   --workspace-id    Override workspace (default: EASY DIGITAL AGENCY)
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { runZetaSaldosPendientesPipeline } from "../lib/integrations/zeta/zeta-saldos-pipeline";
import {
  generateFinancialConsistencyReport,
  type InvoiceInput,
  type CompanyInput,
  type SyncStateInput,
} from "../lib/copilot-financial-reconciliation";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const SKIP_SYNC = args.includes("--skip-sync");
const WORKSPACE_ID = (() => {
  const idx = args.indexOf("--workspace-id");
  return idx >= 0 ? (args[idx + 1] ?? "") : "040321ff-10fd-4da3-aeca-f1865f879986";
})();

const PDF_UYU = 723_650;
const PDF_USD = 13_197.85;
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-05-07";

const MAX_PAGES = 5;
const PAGE_DELAY_MS = 300;
const CLIENT_DELAY_MS = 500;
const MAX_CLIENTS = 200;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Step 1: Saldos sync
// ---------------------------------------------------------------------------

async function runSync(): Promise<{ ok: number; errors: number; upserted: number; balanceGtTotalWarnings: string[] }> {
  console.error("\n=== STEP 1: SYNC SALDOS ===");

  const { data: companies, error } = await sb
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("workspace_company_id", WORKSPACE_ID)
    .eq("is_active", true)
    .not("Codigo", "is", null)
    .limit(MAX_CLIENTS);

  if (error) throw new Error("DB proto_companies: " + error.message);

  const eligible = (companies ?? []).filter(
    (c) => String((c as { Codigo?: unknown }).Codigo ?? "").trim().length > 0
  ) as { id: string; Codigo: string; name: string | null }[];

  console.error(`Clientes elegibles: ${eligible.length}`);

  let ok = 0;
  let errors = 0;
  let upserted = 0;
  const balanceGtTotalWarnings: string[] = [];

  // Capture console.warn to collect balance_gt_total warnings
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = args.map(String).join(" ");
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.type === "balance_gt_total") {
        balanceGtTotalWarnings.push(msg);
      }
    } catch { /* not JSON */ }
    origWarn(...args);
  };

  for (let i = 0; i < eligible.length; i++) {
    const c = eligible[i]!;
    const codigo = String(c.Codigo).trim();
    if (i > 0) await new Promise((r) => setTimeout(r, CLIENT_DELAY_MS));

    try {
      const result = await runZetaSaldosPendientesPipeline(sb, WORKSPACE_ID, randomUUID(), {
        protoCompanyId: c.id,
        clienteCodigo: codigo,
        mode: "incremental",
        maxPagesPerRun: MAX_PAGES,
        pageDelayMs: PAGE_DELAY_MS,
      });
      upserted += result.rows_upserted;
      const status =
        result.stopped_reason === "completed" ? "ok"
        : result.stopped_reason === "max_pages" ? "partial"
        : "error";
      if (status !== "error") ok++;
      else errors++;
      if (i % 20 === 0 || status === "error") {
        console.error(`[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ${String(c.name ?? "").slice(0, 35).padEnd(35)} → ${result.rows_upserted} upserted (${result.stopped_reason})`);
      }
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message.slice(0, 100) : String(e).slice(0, 100);
      console.error(`[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ERROR: ${msg}`);
    }
  }

  console.warn = origWarn;
  return { ok, errors, upserted, balanceGtTotalWarnings };
}

// ---------------------------------------------------------------------------
// Step 2: Load data from DB
// ---------------------------------------------------------------------------

async function loadData() {
  const [invoiceRes, companyRes, syncRes] = await Promise.all([
    sb
      .from("proto_invoices")
      .select("id, company_id, currency_code, total_amount, balance_amount, status, updated_at, issue_date")
      .eq("workspace_company_id", WORKSPACE_ID)
      .eq("is_active", true)
      .limit(10000),
    sb
      .from("proto_companies")
      .select("id, name, Codigo")
      .eq("workspace_company_id", WORKSPACE_ID)
      .eq("is_active", true),
    sb
      .from("zeta_sync_state")
      .select("resource_flow, last_success_at, bootstrap_completed")
      .order("resource_flow"),
  ]);

  if (invoiceRes.error) throw new Error("proto_invoices: " + invoiceRes.error.message);
  if (companyRes.error) throw new Error("proto_companies: " + companyRes.error.message);

  const invoices: InvoiceInput[] = ((invoiceRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    total_amount: typeof r.total_amount === "number" ? r.total_amount : null,
    balance_amount: typeof r.balance_amount === "number" ? r.balance_amount : null,
    status: r.status != null ? String(r.status) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
    issue_date: r.issue_date != null ? String(r.issue_date) : null,
  }));

  const companies: CompanyInput[] = ((companyRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    name: r.name != null ? String(r.name) : null,
  }));

  const syncStates: SyncStateInput[] = ((syncRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    resource_flow: String(r.resource_flow ?? ""),
    last_success_at: r.last_success_at != null ? String(r.last_success_at) : null,
    bootstrap_completed: Boolean(r.bootstrap_completed),
  }));

  // Build name + Codigo map
  const companyInfo = new Map<string, { name: string | null; codigo: string | null }>();
  for (const r of (companyRes.data ?? []) as Record<string, unknown>[]) {
    companyInfo.set(String(r.id ?? ""), {
      name: r.name != null ? String(r.name) : null,
      codigo: r.Codigo != null ? String(r.Codigo).trim() : null,
    });
  }

  return { invoices, companies, syncStates, companyInfo };
}

// ---------------------------------------------------------------------------
// Step 3: Per-client pending breakdown (for gap diagnosis)
// ---------------------------------------------------------------------------

function buildClientBreakdown(
  invoices: InvoiceInput[],
  companyInfo: Map<string, { name: string | null; codigo: string | null }>,
  periodStart?: string,
  periodEnd?: string
) {
  type ClientRow = {
    companyId: string;
    name: string | null;
    codigo: string | null;
    pendingUYU: number;
    pendingUSD: number;
    invoiceCount: number;
    nullCurrencyCount: number;
    staleHours: number | null;
    outsidePeriod: number;
  };

  const map = new Map<string, ClientRow>();
  const nowMs = Date.now();
  const clientLatestMs = new Map<string, number>();

  for (const inv of invoices) {
    const status = (inv.status ?? "").trim().toLowerCase();
    const voided = ["void", "voided", "canceled", "cancelled", "anulada", "anulado", "annulled", "annul"].includes(status);
    if (voided) continue;

    const cid = inv.company_id?.trim() ?? "";
    if (!cid) continue;

    if (inv.updated_at) {
      const ms = Date.parse(inv.updated_at);
      if (Number.isFinite(ms)) {
        const prev = clientLatestMs.get(cid) ?? 0;
        if (ms > prev) clientLatestMs.set(cid, ms);
      }
    }

    if (!map.has(cid)) {
      const info = companyInfo.get(cid);
      map.set(cid, {
        companyId: cid,
        name: info?.name ?? null,
        codigo: info?.codigo ?? null,
        pendingUYU: 0,
        pendingUSD: 0,
        invoiceCount: 0,
        nullCurrencyCount: 0,
        outsidePeriod: 0,
        staleHours: null,
      });
    }

    const row = map.get(cid)!;

    // Period filter
    if (periodStart && periodEnd) {
      const d = (inv.issue_date ?? "").slice(0, 10);
      const inPeriod = /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= periodStart && d <= periodEnd;
      if (!inPeriod) {
        row.outsidePeriod++;
        continue;
      }
    }

    row.invoiceCount++;

    const code = (inv.currency_code ?? "").trim().toUpperCase();
    if (!code || !["USD", "UYU"].includes(code)) {
      row.nullCurrencyCount++;
      continue;
    }

    const total = Math.max(0, inv.total_amount ?? 0);
    if (!(total > 0)) continue;
    const pending = inv.balance_amount != null ? Math.max(0, inv.balance_amount) : total;

    if (code === "UYU") row.pendingUYU = Math.round((row.pendingUYU + pending) * 100) / 100;
    if (code === "USD") row.pendingUSD = Math.round((row.pendingUSD + pending) * 100) / 100;
  }

  // Stale hours
  for (const [cid, row] of map) {
    const lastMs = clientLatestMs.get(cid) ?? null;
    row.staleHours = lastMs !== null ? Math.max(0, (nowMs - lastMs) / 3_600_000) : null;
  }

  return [...map.values()].sort((a, b) => b.pendingUYU - a.pendingUYU);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`\nWorkspace: ${WORKSPACE_ID}`);
  console.error(`PDF reference: UYU=${PDF_UYU.toLocaleString()} / USD=${PDF_USD.toLocaleString()}`);
  console.error(`Period: ${PERIOD_START} → ${PERIOD_END}`);
  console.error(`Skip sync: ${SKIP_SYNC}`);

  // Step 1: Sync
  let syncResult: Awaited<ReturnType<typeof runSync>> | null = null;
  if (!SKIP_SYNC) {
    syncResult = await runSync();
    console.error(`\nSync summary: ok=${syncResult.ok} errors=${syncResult.errors} upserted=${syncResult.upserted}`);
    console.error(`balance_gt_total warnings: ${syncResult.balanceGtTotalWarnings.length}`);
    if (syncResult.balanceGtTotalWarnings.length > 0) {
      console.error("\n--- balance_gt_total warnings ---");
      for (const w of syncResult.balanceGtTotalWarnings.slice(0, 20)) {
        console.error(w);
      }
    }
  }

  // Step 2: Load
  console.error("\n=== STEP 2: LOADING DATA ===");
  const { invoices, companies, syncStates, companyInfo } = await loadData();
  console.error(`Invoices loaded: ${invoices.length} | Companies: ${companies.length}`);

  // Step 3: Reports
  console.error("\n=== STEP 3: RECONCILIATION REPORTS ===");

  const reportAll = generateFinancialConsistencyReport({
    workspaceId: WORKSPACE_ID,
    invoices,
    companies,
    syncStates,
    mode: "all_outstanding",
  });

  const reportPeriod = generateFinancialConsistencyReport({
    workspaceId: WORKSPACE_ID,
    invoices,
    companies,
    syncStates,
    mode: "period_only",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });

  // Step 4: Per-client breakdown (period_only)
  const clientBreakdown = buildClientBreakdown(invoices, companyInfo, PERIOD_START, PERIOD_END);
  const clientBreakdownAll = buildClientBreakdown(invoices, companyInfo);

  // Step 5: Output
  function printReport(label: string, report: typeof reportAll) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`REPORTE: ${label}`);
    console.log("=".repeat(60));

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    const usd = report.currencies.find((c) => c.currencyCode === "USD");

    const uyuPending = uyu?.totalPending ?? 0;
    const usdPending = usd?.totalPending ?? 0;

    const diffUYU = uyuPending - PDF_UYU;
    const diffUSD = usdPending - PDF_USD;

    console.log(`\n--- TOTALES ---`);
    console.log(`UYU pending:   ${uyuPending.toLocaleString("es-UY", { maximumFractionDigits: 2 }).padStart(14)}`);
    console.log(`USD pending:   ${usdPending.toLocaleString("es-UY", { maximumFractionDigits: 2 }).padStart(14)}`);
    console.log(`UYU invoices:  ${String(uyu?.invoiceCount ?? 0).padStart(14)}`);
    console.log(`USD invoices:  ${String(usd?.invoiceCount ?? 0).padStart(14)}`);

    console.log(`\n--- DIFERENCIA vs PDF ---`);
    console.log(`UYU diff:  ${diffUYU >= 0 ? "+" : ""}${diffUYU.toLocaleString("es-UY", { maximumFractionDigits: 2 }).padStart(14)}  (${((diffUYU / PDF_UYU) * 100).toFixed(2)}%)`);
    console.log(`USD diff:  ${diffUSD >= 0 ? "+" : ""}${diffUSD.toLocaleString("es-UY", { maximumFractionDigits: 2 }).padStart(14)}  (${((diffUSD / PDF_USD) * 100).toFixed(2)}%)`);

    const recUYU = PDF_UYU > 0 ? ((uyuPending / PDF_UYU) * 100).toFixed(2) : "N/A";
    const recUSD = PDF_USD > 0 ? ((usdPending / PDF_USD) * 100).toFixed(2) : "N/A";
    console.log(`\nReconciliation %  UYU: ${recUYU}%  USD: ${recUSD}%`);

    console.log(`\n--- INVOICES ---`);
    console.log(`Total (no voided):     ${report.totalInvoices}`);
    console.log(`Without currency:      ${report.totalInvoicesWithoutCurrency}`);
    console.log(`Voided:                ${report.voidedInvoices}`);
    if (report.mode === "period_only") {
      console.log(`Excluded by period:    ${report.gaps.invoicesExcludedByPeriodFilter}`);
    }

    console.log(`\n--- GAPS ---`);
    console.log(`invoicesWithoutCurrency:       ${report.gaps.invoicesWithoutCurrency}`);
    console.log(`invoicesExcludedByPeriodFilter:${report.gaps.invoicesExcludedByPeriodFilter}`);
    console.log(`clientsWithStaleData:          ${report.gaps.clientsWithStaleData}`);
    const sp = report.gaps.stalePendingByCurrency;
    if (sp.UYU) console.log(`  stalePending UYU:            ${sp.UYU.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`);
    if (sp.USD) console.log(`  stalePending USD:            ${sp.USD.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`);

    console.log(`\n--- METRICS ---`);
    console.log(`stale_ratio:           ${report.metrics.stale_ratio}`);
    console.log(`unknown_currency_ratio:${report.metrics.unknown_currency_ratio}`);
    if (report.metrics.period_exclusion_ratio !== null) {
      console.log(`period_exclusion_ratio:${report.metrics.period_exclusion_ratio}`);
    }

    console.log(`\n--- SYNC STATES ---`);
    for (const s of report.syncStates) {
      console.log(`  ${s.resource_flow.padEnd(40)} ${s.status.padEnd(12)} age=${s.ageHours != null ? s.ageHours.toFixed(1) + "h" : "never"}`);
    }

    console.log(`\n--- STALE CLIENTS (worst-first, top 10) ---`);
    for (const c of report.staleClients.slice(0, 10)) {
      if (c.status === "ok") break;
      console.log(`  ${(c.companyName ?? "?").slice(0, 35).padEnd(35)} ${c.status.padEnd(12)} ${c.ageHours != null ? c.ageHours.toFixed(1) + "h" : "never"}`);
    }
    console.log(`  [ok: ${report.staleSummary.ok} | warning: ${report.staleSummary.warning} | critical: ${report.staleSummary.critical} | never_synced: ${report.staleSummary.never_synced}]`);
  }

  printReport("ALL_OUTSTANDING", reportAll);
  printReport(`PERIOD_ONLY (${PERIOD_START} → ${PERIOD_END})`, reportPeriod);

  // Step 6: Top contributors to differences
  console.log(`\n${"=".repeat(60)}`);
  console.log("DIAGNÓSTICO: TOP CLIENTES POR PENDING UYU (period_only)");
  console.log("=".repeat(60));

  const topUYU = clientBreakdown.filter((c) => c.pendingUYU > 0).slice(0, 20);
  let runningUYU = 0;
  const uyuPeriod = reportPeriod.currencies.find((c) => c.currencyCode === "UYU")?.totalPending ?? 0;
  for (const c of topUYU) {
    runningUYU += c.pendingUYU;
    const pct = uyuPeriod > 0 ? ((c.pendingUYU / uyuPeriod) * 100).toFixed(1) : "?";
    const stale = c.staleHours != null ? `${c.staleHours.toFixed(0)}h` : "never";
    console.log(`  [${(c.codigo ?? "?").padStart(4)}] ${(c.name ?? "?").slice(0, 35).padEnd(35)} UYU=${c.pendingUYU.toLocaleString("es-UY", { maximumFractionDigits: 0 }).padStart(10)} (${pct}%) inv=${c.invoiceCount} stale=${stale}`);
  }
  console.log(`  SUBTOTAL top 20: ${runningUYU.toLocaleString("es-UY", { maximumFractionDigits: 0 })} / total period ${uyuPeriod.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`);

  console.log(`\n--- TOP CLIENTES POR PENDING USD (period_only) ---`);
  const topUSD = clientBreakdown.filter((c) => c.pendingUSD > 0).slice(0, 10);
  const usdPeriod = reportPeriod.currencies.find((c) => c.currencyCode === "USD")?.totalPending ?? 0;
  for (const c of topUSD) {
    const pct = usdPeriod > 0 ? ((c.pendingUSD / usdPeriod) * 100).toFixed(1) : "?";
    const stale = c.staleHours != null ? `${c.staleHours.toFixed(0)}h` : "never";
    console.log(`  [${(c.codigo ?? "?").padStart(4)}] ${(c.name ?? "?").slice(0, 35).padEnd(35)} USD=${c.pendingUSD.toLocaleString("es-UY", { maximumFractionDigits: 2 }).padStart(10)} (${pct}%) inv=${c.invoiceCount} stale=${stale}`);
  }

  // Clientes con currency null
  const nullCurrencyClients = clientBreakdown.filter((c) => c.nullCurrencyCount > 0);
  if (nullCurrencyClients.length > 0) {
    console.log(`\n--- CLIENTES CON FACTURAS SIN CURRENCY (period_only) ---`);
    for (const c of nullCurrencyClients.slice(0, 15)) {
      console.log(`  [${(c.codigo ?? "?").padStart(4)}] ${(c.name ?? "?").slice(0, 35).padEnd(35)} sin-currency=${c.nullCurrencyCount}`);
    }
  }

  // Facturas fuera de período (clientes con más exclusiones)
  const excludedClients = clientBreakdown.filter((c) => c.outsidePeriod > 0).sort((a, b) => b.outsidePeriod - a.outsidePeriod);
  if (excludedClients.length > 0) {
    console.log(`\n--- CLIENTES CON FACTURAS FUERA DEL PERÍODO ---`);
    for (const c of excludedClients.slice(0, 10)) {
      console.log(`  [${(c.codigo ?? "?").padStart(4)}] ${(c.name ?? "?").slice(0, 35).padEnd(35)} outside-period=${c.outsidePeriod}`);
    }
  }

  // All_outstanding vs period_only diff
  const allUYU = reportAll.currencies.find((c) => c.currencyCode === "UYU")?.totalPending ?? 0;
  const allUSD = reportAll.currencies.find((c) => c.currencyCode === "USD")?.totalPending ?? 0;
  const periodUYU = reportPeriod.currencies.find((c) => c.currencyCode === "UYU")?.totalPending ?? 0;
  const periodUSD = reportPeriod.currencies.find((c) => c.currencyCode === "USD")?.totalPending ?? 0;

  console.log(`\n${"=".repeat(60)}`);
  console.log("COMPARACIÓN ALL_OUTSTANDING vs PERIOD_ONLY");
  console.log("=".repeat(60));
  console.log(`UYU all_outstanding: ${allUYU.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`);
  console.log(`UYU period_only:     ${periodUYU.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`);
  console.log(`UYU diff (all-period):${(allUYU - periodUYU).toLocaleString("es-UY", { maximumFractionDigits: 2 })}  ← facturas pre-${PERIOD_START} o post-${PERIOD_END}`);
  console.log(`USD all_outstanding: ${allUSD.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`);
  console.log(`USD period_only:     ${periodUSD.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`);
  console.log(`USD diff (all-period):${(allUSD - periodUSD).toLocaleString("es-UY", { maximumFractionDigits: 2 })}  ← facturas fuera del período`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("VEREDICTO FINAL");
  console.log("=".repeat(60));

  // Which mode matches PDF better?
  const allMatchUYU = Math.abs(allUYU - PDF_UYU);
  const periodMatchUYU = Math.abs(periodUYU - PDF_UYU);
  const allMatchUSD = Math.abs(allUSD - PDF_USD);
  const periodMatchUSD = Math.abs(periodUSD - PDF_USD);

  const allTotal = allMatchUYU + allMatchUSD;
  const periodTotal = periodMatchUYU + periodMatchUSD;

  const betterMode = allTotal <= periodTotal ? "all_outstanding" : "period_only";
  console.log(`PDF se aproxima más a: ${betterMode}`);
  console.log(`  |all_outstanding - PDF| UYU=${allMatchUYU.toFixed(0)} USD=${allMatchUSD.toFixed(2)}`);
  console.log(`  |period_only - PDF|     UYU=${periodMatchUYU.toFixed(0)} USD=${periodMatchUSD.toFixed(2)}`);

  const uyuBest = Math.min(allMatchUYU, periodMatchUYU);
  const usdBest = Math.min(allMatchUSD, periodMatchUSD);
  const uyuBestMode = allMatchUYU <= periodMatchUYU ? "all" : "period";
  const usdBestMode = allMatchUSD <= periodMatchUSD ? "all" : "period";

  console.log(`\nGap residual mínimo:`);
  console.log(`  UYU: ${uyuBest.toFixed(0)} (${uyuBestMode} mode)  →  ${uyuBest <= 5000 ? "✓ DENTRO DE TOLERANCIA" : uyuBest <= 20000 ? "⚠ DIFERENCIA MENOR" : "✗ GAP SIGNIFICATIVO"}`);
  console.log(`  USD: ${usdBest.toFixed(2)} (${usdBestMode} mode)  →  ${usdBest <= 100 ? "✓ DENTRO DE TOLERANCIA" : usdBest <= 1000 ? "⚠ DIFERENCIA MENOR" : "✗ GAP SIGNIFICATIVO"}`);

  const canMoveToUI =
    uyuBest <= 20000 &&
    usdBest <= 1000;

  console.log(`\n¿Listo para pasar a UI? ${canMoveToUI ? "✓ SÍ — diferencias dentro de rango explicable" : "✗ NO — todavía hay gaps técnicos que cerrar primero"}`);

  if (syncResult) {
    console.log(`\nSync: ${syncResult.ok} ok / ${syncResult.errors} errores / ${syncResult.upserted} upserted`);
    console.log(`balance_gt_total warnings: ${syncResult.balanceGtTotalWarnings.length}`);
  }

  console.log("\nFIN DEL DIAGNÓSTICO\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
