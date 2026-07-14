/**
 * AUDIT — Cobrado aplicado vs cobrado registrado.
 *
 * READ-ONLY. No modifica producción, no persiste snapshots y no imprime nombres,
 * ids de clientes ni documentos: solo agregados por moneda/período.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { toSafeNumber } from "../lib/copilot-numeric-parse";
import { invoiceRowToCanonical } from "../lib/financial/canonical-debt-loader";
import {
  buildCanonicalCollectionsSnapshot,
  buildCanonicalFinancialContext,
  type CanonicalCollectionsDiagnosticCode,
  type CanonicalReceiptInput,
} from "../lib/financial/canonical";
import { fetchAllRows } from "../lib/supabase-pagination";

type DiffClassification =
  | "NO_DIFFERENCE"
  | "EXPECTED_TIMING_DIFFERENCE"
  | "DATA_QUALITY"
  | "SCOPE_DIFFERENCE"
  | "IMPLEMENTATION_DEFECT";

type AuditPeriod = {
  label: string;
  from: string;
  to: string;
  cutoff: string;
};

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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function num(v: unknown): number {
  return toSafeNumber(v) ?? 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatRate(rate: number | null): string {
  return rate == null ? "null" : `${round2(rate * 100)}%`;
}

function classifyDelta(
  delta: number,
  diagnostics: readonly { code: CanonicalCollectionsDiagnosticCode; count: number }[]
): DiffClassification {
  if (Math.abs(delta) <= 0.01) return "NO_DIFFERENCE";
  if (
    diagnostics.some((d) =>
      [
        "missing_invoice_currency",
        "missing_receipt_currency",
        "invalid_receipt_date",
        "invalid_receipt_amount",
        "receipt_without_company",
        "unsupported_receipt_status",
      ].includes(d.code)
    )
  ) {
    return "DATA_QUALITY";
  }
  if (
    diagnostics.some((d) =>
      ["negative_applied_collections", "applied_collection_rate_over_100"].includes(d.code)
    )
  ) {
    return "IMPLEMENTATION_DEFECT";
  }
  return "EXPECTED_TIMING_DIFFERENCE";
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

function receiptRowToCanonical(r: Record<string, unknown>): CanonicalReceiptInput {
  return {
    id: r.id != null ? String(r.id) : null,
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    amount: num(r.amount),
    receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
    status: r.status != null ? String(r.status) : null,
    is_active: (r.is_active as boolean | null | undefined) ?? null,
  };
}

async function main() {
  const wid = await resolveWorkspaceId();
  if (!wid) {
    console.error("No se pudo resolver workspace_company_id");
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
        .range(from, to),
  });

  const { rows: receiptRows } = await fetchAllRows<Record<string, unknown>>({
    pageSize: 1000,
    maxRows: 100_000,
    queryPage: (from, to) =>
      db
        .from("proto_receipts")
        .select("id, company_id, currency_code, amount, receipt_date, status, is_active")
        .eq("workspace_company_id", wid)
        .range(from, to),
  });

  const invoices = invoiceRows.map(invoiceRowToCanonical);
  const receipts = receiptRows.map(receiptRowToCanonical);
  const periods: AuditPeriod[] = [
    { label: "julio parcial", from: "2026-07-01", to: "2026-07-14", cutoff: "2026-07-14" },
    { label: "junio completo", from: "2026-06-01", to: "2026-06-30", cutoff: "2026-06-30" },
  ];

  console.log("=== Canonical collections audit (read-only) ===");
  console.log(`Facturas cargadas: ${invoiceRows.length}`);
  console.log(`Recibos cargados: ${receiptRows.length}`);

  for (const period of periods) {
    const context = buildCanonicalFinancialContext({
      workspaceId: wid,
      periodStart: period.from,
      periodEnd: period.to,
      cutoffDate: period.cutoff,
    });
    const snapshot = buildCanonicalCollectionsSnapshot({ context, invoices, receipts });

    console.log(`\n=== ${period.label}: ${period.from} → ${period.to} · cutoff ${period.cutoff} ===`);
    for (const cur of ["UYU", "USD"] as const) {
      const row = snapshot.byCurrency.find((r) => r.currency === cur);
      if (!row) continue;
      const delta = round2(
        row.applied.appliedCollectionsAtCutoff -
          row.registered.registeredCollectionsInPeriod
      );
      const classification = classifyDelta(delta, snapshot.diagnostics);
      console.log(
        [
          cur,
          `ventas_emitidas=${row.applied.issuedNetInPeriod}`,
          `pendiente=${row.applied.pendingBalanceAtCutoffForPeriodSales}`,
          `aplicado=${row.applied.appliedCollectionsAtCutoff}`,
          `registrado=${row.registered.registeredCollectionsInPeriod}`,
          `diferencia_aplicado_vs_registrado=${delta}`,
          `recibos=${row.registered.receiptCountInPeriod}`,
          `porcentaje_aplicado=${formatRate(row.applied.appliedCollectionRate)}`,
          `classification=${classification}`,
        ].join(" | ")
      );
    }

    const diagSummary = snapshot.diagnostics.reduce<Record<string, number>>((acc, d) => {
      acc[d.code] = (acc[d.code] ?? 0) + d.count;
      return acc;
    }, {});
    console.log(`Diagnósticos: ${JSON.stringify(diagSummary)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
