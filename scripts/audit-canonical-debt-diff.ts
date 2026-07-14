/**
 * AUDIT — Diff legacy (issue_date) vs canónico (due_date) de deuda/atraso.
 *
 * READ-ONLY. No modifica producción, no persiste snapshots, no imprime nombres
 * de clientes ni datos sensibles: solo agregados por moneda + conteos por causa.
 *
 * Uso (Windows):
 *   node --env-file=.env.local --import tsx scripts/audit-canonical-debt-diff.ts
 *   (cutoff opcional: AUDIT_CUTOFF=2026-07-14)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { fetchAllRows } from "../lib/supabase-pagination";
import { buildCanonicalFinancialContext } from "../lib/financial/canonical/report-context";
import { buildCanonicalDebtUnits } from "../lib/financial/canonical/debt-units";
import { buildCanonicalDebtMetricsFromUnits } from "../lib/financial/canonical/metrics-from-units";
import { invoiceRowToCanonical } from "../lib/financial/canonical-debt-loader";
import type { CanonicalInstallmentInput } from "../lib/financial/canonical/types";
import { toSafeNumber } from "../lib/copilot-numeric-parse";
import { buildCarteraOperatingAging } from "../lib/copilot/cartera-operating-aging";
import { selectOperationalDebtInvoicesForSummation } from "../lib/zeta/zeta-operational-debt-dedup";

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
const CUTOFF = (process.env.AUDIT_CUTOFF ?? "2026-07-14").slice(0, 10);
type DiffClassification =
  | "NO_DIFFERENCE"
  | "EXPECTED_SEMANTIC_CHANGE"
  | "DATA_QUALITY"
  | "IMPLEMENTATION_DEFECT"
  | "SCOPE_DIFFERENCE";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function ymd(v: unknown): string {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
function num(v: unknown): number {
  return toSafeNumber(v) ?? 0;
}
function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function delta(a: number, b: number): number {
  return round2(b - a);
}
function classifyMoneyDelta(d: number, fallback: DiffClassification): DiffClassification {
  return Math.abs(d) <= 0.01 ? "NO_DIFFERENCE" : fallback;
}
function printDiffRow(
  label: string,
  legacy: number,
  canonical: number,
  classification: DiffClassification
): void {
  console.log(
    `${label.padEnd(24)} legacy=${String(round2(legacy)).padStart(12)} canonical=${String(round2(canonical)).padStart(12)} delta=${String(delta(legacy, canonical)).padStart(12)} classification=${classification}`
  );
}

async function resolveWorkspaceId(): Promise<string> {
  const envWid = process.env.WORKSPACE_COMPANY_ID?.trim();
  if (envWid) return envWid;
  const { data } = await db
    .from("proto_invoices")
    .select("workspace_company_id")
    .limit(1)
    .single();
  return (data as { workspace_company_id?: string } | null)?.workspace_company_id ?? "";
}

async function main() {
  const wid = await resolveWorkspaceId();
  if (!wid) {
    console.error("❌ No se pudo resolver workspace_company_id");
    process.exit(1);
  }

  const { rows: invoiceRows } = await fetchAllRows<Record<string, unknown>>({
    pageSize: 1000,
    maxRows: 100_000,
    queryPage: (from, to) =>
      db
        .from("proto_invoices")
        .select(
          "id, company_id, currency_code, total_amount, balance_amount, status, issue_date, due_date, zeta_metadata, is_active"
        )
        .eq("workspace_company_id", wid)
        .eq("is_active", true)
        .range(from, to),
  });

  let installmentRows: Record<string, unknown>[] = [];
  try {
    const res = await fetchAllRows<Record<string, unknown>>({
      pageSize: 1000,
      maxRows: 200_000,
      queryPage: (from, to) =>
        db
          .from("proto_invoice_installments")
          .select("id, invoice_id, currency_code, cuota_saldo, cuota_vencimiento, is_active")
          .eq("workspace_company_id", wid)
          .range(from, to),
    });
    installmentRows = res.rows;
  } catch {
    installmentRows = [];
  }

  const invoices = invoiceRows.map(invoiceRowToCanonical);
  const installments: CanonicalInstallmentInput[] = installmentRows.map((r) => ({
    id: r.id != null ? String(r.id) : undefined,
    invoice_id: r.invoice_id != null ? String(r.invoice_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    cuota_saldo: num(r.cuota_saldo),
    cuota_vencimiento: r.cuota_vencimiento != null ? String(r.cuota_vencimiento) : null,
    is_active: (r.is_active as boolean | null | undefined) ?? null,
  }));

  const context = buildCanonicalFinancialContext({
    workspaceId: wid,
    periodEnd: CUTOFF,
    cutoffDate: CUTOFF,
  });

  const opInvoices = selectOperationalDebtInvoicesForSummation(
    invoices as unknown as Parameters<typeof selectOperationalDebtInvoicesForSummation>[0]
  ).map((s) => s.invoice) as unknown as typeof invoices;

  // Canónico con y sin cuotas (para medir el efecto de cuotas), sobre el mismo universo de Cartera.
  const canonUnits = buildCanonicalDebtUnits({ invoices: opInvoices, installments, context, includeAllIssueDates: true });
  const canonInvoiceOnly = buildCanonicalDebtUnits({ invoices: opInvoices, context, includeAllIssueDates: true });

  // Legacy issue_date: clasifica saldo abierto usando issue_date como proxy de antigüedad.
  const legacy: Record<string, {
    pending: number;
    current: number;
    overdue: number;
    unclassified: number;
    clients: Set<string>;
    buckets: Record<"on_time" | "late_1_7" | "late_8_14" | "late_15_30" | "late_30_plus", number>;
  }> = {
    UYU: { pending: 0, current: 0, overdue: 0, unclassified: 0, clients: new Set(), buckets: { on_time: 0, late_1_7: 0, late_8_14: 0, late_15_30: 0, late_30_plus: 0 } },
    USD: { pending: 0, current: 0, overdue: 0, unclassified: 0, clients: new Set(), buckets: { on_time: 0, late_1_7: 0, late_8_14: 0, late_15_30: 0, late_30_plus: 0 } },
  };
  for (const r of opInvoices) {
    const cur = String(r.currency_code ?? "").toUpperCase();
    if (cur !== "UYU" && cur !== "USD") continue;
    const pending = num(r.balance_amount);
    if (!(pending > 0)) continue;
    const st = String(r.status ?? "").toLowerCase();
    if (["void", "voided", "cancelled", "canceled", "anulada", "anulado"].includes(st)) continue;
    const issue = ymd(r.issue_date);
    if (issue && issue < "2026-01-01") continue;
    legacy[cur].pending = round2(legacy[cur].pending + pending);
    if (!issue) {
      legacy[cur].unclassified = round2(legacy[cur].unclassified + pending);
      continue;
    }
    const days = daysBetween(CUTOFF, issue);
    const bucket =
      days <= 0 ? "on_time" :
      days <= 7 ? "late_1_7" :
      days <= 14 ? "late_8_14" :
      days <= 30 ? "late_15_30" :
      "late_30_plus";
    legacy[cur].buckets[bucket] = round2(legacy[cur].buckets[bucket] + pending);
    if (bucket === "on_time") {
      legacy[cur].current = round2(legacy[cur].current + pending);
    } else {
      legacy[cur].overdue = round2(legacy[cur].overdue + pending);
      if (r.company_id) legacy[cur].clients.add(String(r.company_id));
    }
  }

  console.log(`CUT-OFF: ${CUTOFF}`);
  console.log(`Facturas procesadas: ${opInvoices.length} (cargadas=${invoiceRows.length})`);
  console.log(`Cuotas procesadas: ${installmentRows.length}\n`);

  // ── FASE 1C: aging OPERATIVO de Cartera (buckets por due_date) ────────────
  // Mismo universo/semántica que el route: dedup operacional + cuotas + cutoff.
  const operatingAging = buildCarteraOperatingAging({
    invoices: opInvoices,
    installments,
    cutoffDate: CUTOFF,
  });

  console.log("=== Diff legacy(issue_date) vs canonical(due_date) por moneda ===");
  for (const cur of ["UYU", "USD"] as const) {
    const block = operatingAging.byCurrency.find((b) => b.currency === cur);
    if (!block) {
      console.log(`=== ${cur} === (sin saldo)\n`);
      continue;
    }
    const L = legacy[cur];
    const cMetrics = buildCanonicalDebtMetricsFromUnits(canonUnits.units, cur, CUTOFF);
    const cInvOnly = buildCanonicalDebtMetricsFromUnits(canonInvoiceOnly.units, cur, CUTOFF);
    const bucketsSum = round2(block.buckets.reduce((s, r) => s + r.amount, 0));
    const invariant = round2(
      block.currentBalance + block.overdueBalance + block.unclassifiedDueDateBalance
    );
    console.log(`=== ${cur} ===`);
    printDiffRow("Pending", L.pending, cMetrics.pendingBalance, classifyMoneyDelta(delta(L.pending, cMetrics.pendingBalance), "SCOPE_DIFFERENCE"));
    printDiffRow("Current", L.current, block.currentBalance, classifyMoneyDelta(delta(L.current, block.currentBalance), "EXPECTED_SEMANTIC_CHANGE"));
    printDiffRow("Overdue", L.overdue, cMetrics.overdueBalance, classifyMoneyDelta(delta(L.overdue, cMetrics.overdueBalance), "EXPECTED_SEMANTIC_CHANGE"));
    printDiffRow("Unclassified", L.unclassified, cMetrics.balanceWithoutDueDate, cMetrics.balanceWithoutDueDate > 0 ? "DATA_QUALITY" : classifyMoneyDelta(delta(L.unclassified, cMetrics.balanceWithoutDueDate), "EXPECTED_SEMANTIC_CHANGE"));
    printDiffRow("Overdue clients", L.clients.size, cMetrics.overdueClients, L.clients.size === cMetrics.overdueClients ? "NO_DIFFERENCE" : "EXPECTED_SEMANTIC_CHANGE");
    for (const row of block.buckets) {
      const legacyAmount = L.buckets[row.bucket];
      printDiffRow(
        row.bucket,
        legacyAmount,
        row.amount,
        classifyMoneyDelta(delta(legacyAmount, row.amount), "EXPECTED_SEMANTIC_CHANGE")
      );
    }
    const invariantOk = invariant === round2(block.pendingBalance);
    console.log(`Invariant pending=current+overdue+unclassified: ${invariantOk ? "OK" : "MISMATCH"} (${invariant} vs ${round2(block.pendingBalance)})`);
    console.log(`Bucket sum (classifiable): ${bucketsSum} vs ${round2(block.currentBalance + block.overdueBalance)}`);
    console.log(`Overdue con cuotas vs solo factura: ${cMetrics.overdueBalance} vs ${cInvOnly.overdueBalance} classification=${cMetrics.overdueBalance === cInvOnly.overdueBalance ? "NO_DIFFERENCE" : "EXPECTED_SEMANTIC_CHANGE"}`);
    console.log("");
  }
  console.log(`Clientes con atraso (cualquier moneda): ${operatingAging.overdueClientsAnyCurrency}\n`);

  console.log("=== Diagnósticos canónicos (por causa) ===");
  console.log(JSON.stringify(canonUnits.diagnosticCounts, null, 2));
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
