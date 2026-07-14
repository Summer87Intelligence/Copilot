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
const CUTOFF = (process.env.AUDIT_CUTOFF ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

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

  // Canónico con y sin cuotas (para medir el efecto de cuotas).
  const canonUnits = buildCanonicalDebtUnits({ invoices, installments, context, includeAllIssueDates: true });
  const canonInvoiceOnly = buildCanonicalDebtUnits({ invoices, context, includeAllIssueDates: true });

  // Legacy issue_date: overdue = pendiente con (cutoff - issue_date) >= 31 (regla Hoy previa).
  const legacy: Record<string, { pending: number; overdue: number; clients: Set<string> }> = {
    UYU: { pending: 0, overdue: 0, clients: new Set() },
    USD: { pending: 0, overdue: 0, clients: new Set() },
  };
  for (const r of invoiceRows) {
    const cur = String(r.currency_code ?? "").toUpperCase();
    if (cur !== "UYU" && cur !== "USD") continue;
    const pending = num(r.balance_amount);
    if (!(pending > 0)) continue;
    const st = String(r.status ?? "").toLowerCase();
    if (["void", "voided", "cancelled", "canceled", "anulada", "anulado"].includes(st)) continue;
    const issue = ymd(r.issue_date);
    if (issue && issue < "2026-01-01") continue;
    legacy[cur].pending = round2(legacy[cur].pending + pending);
    if (issue && daysBetween(CUTOFF, issue) >= 31) {
      legacy[cur].overdue = round2(legacy[cur].overdue + pending);
      if (r.company_id) legacy[cur].clients.add(String(r.company_id));
    }
  }

  console.log(`CUT-OFF: ${CUTOFF}`);
  console.log(`Facturas activas: ${invoiceRows.length} · Cuotas: ${installmentRows.length}\n`);

  for (const cur of ["UYU", "USD"] as const) {
    const cMetrics = buildCanonicalDebtMetricsFromUnits(canonUnits.units, cur, CUTOFF);
    const cInvOnly = buildCanonicalDebtMetricsFromUnits(canonInvoiceOnly.units, cur, CUTOFF);
    const L = legacy[cur];
    console.log(`=== ${cur} ===`);
    console.log(`Legacy pending (issue):     ${L.pending}`);
    console.log(`Canonical pending (due):    ${cMetrics.pendingBalance}`);
    console.log(`  Δ pending:                ${round2(cMetrics.pendingBalance - L.pending)}`);
    console.log(`Legacy overdue (issue 31+): ${L.overdue}`);
    console.log(`Canonical overdue (due):    ${cMetrics.overdueBalance}`);
    console.log(`  Δ overdue:                ${round2(cMetrics.overdueBalance - L.overdue)}  [issue_date vs due_date]`);
    console.log(`Canonical current (due):    ${cMetrics.currentBalance}`);
    console.log(`Saldo sin due_date:         ${cMetrics.balanceWithoutDueDate}  [missing due_date]`);
    console.log(`Legacy overdue clients:     ${L.clients.size}`);
    console.log(`Canonical overdue clients:  ${cMetrics.overdueClients}`);
    console.log(`Overdue con cuotas vs solo factura: ${cMetrics.overdueBalance} vs ${cInvOnly.overdueBalance}  [invoice vs installment]`);
    console.log("");
  }

  console.log("=== Diagnósticos canónicos (por causa) ===");
  console.log(JSON.stringify(canonUnits.diagnosticCounts, null, 2));

  console.log("\n=== Clasificación de diferencias ===");
  console.log("Δ overdue (issue→due)         → EXPECTED_CORRECTION");
  console.log("Overdue por cuota ≠ factura    → EXPECTED_CORRECTION (cuotas reales)");
  console.log("missing_due_date > 0           → DATA_QUALITY");
  console.log("missing_currency > 0           → DATA_QUALITY");
  console.log("installment_balance_mismatch>0 → DATA_QUALITY");
  console.log("Δ pending ≈ 0                   → sin cambio (mismo universo abierto)");
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
