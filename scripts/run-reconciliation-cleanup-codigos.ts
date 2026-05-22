/**
 * Reconciliation cleanup acotado por Codigo Zeta.
 *
 * Uso:
 *   npx tsx scripts/run-reconciliation-cleanup-codigos.ts --codigos 160,161
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { runZetaInstallmentsPipeline } from "../lib/integrations/zeta/zeta-installments-pipeline";
import { runZetaSaldosPendientesPipeline } from "../lib/integrations/zeta/zeta-saldos-pipeline";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
const codigosArg = (() => {
  const i = args.indexOf("--codigos");
  return i >= 0 ? (args[i + 1] ?? "") : "160,161";
})();
const WORKSPACE_ID =
  (() => {
    const i = args.indexOf("--workspace-id");
    return i >= 0 ? (args[i + 1] ?? "") : "";
  })() ||
  process.env.WORKSPACE_COMPANY_ID ||
  "040321ff-10fd-4da3-aeca-f1865f879986";

const codigos = codigosArg
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const TARGET_INVOICES = [
  "ZETA:CCV1:0:161:A:2854",
  "ZETA:CCV1:0:160:A:2911",
];

type InvoiceSnapshot = {
  invoice_number: string;
  balance_amount: unknown;
  status: unknown;
  updated_at?: string;
  zeta_metadata?: unknown;
};

async function snapshotInvoices(sb: SupabaseClient, workspaceId: string) {
  const { data, error } = await sb
    .from("proto_invoices")
    .select("invoice_number, balance_amount, status, updated_at, zeta_metadata")
    .eq("workspace_company_id", workspaceId)
    .in("invoice_number", TARGET_INVOICES);
  if (error) throw error;
  return (data ?? []) as InvoiceSnapshot[];
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (codigos.length === 0) {
    console.error("Indicá --codigos 160,161");
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY) as unknown as SupabaseClient;
  const before = await snapshotInvoices(sb, WORKSPACE_ID);
  console.log("\n=== ANTES ===");
  console.log(JSON.stringify(before, null, 2));

  const { data: companies, error } = await sb
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("workspace_company_id", WORKSPACE_ID)
    .eq("is_active", true)
    .in("Codigo", codigos);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const eligible = (companies ?? []).filter((c) =>
    codigos.includes(String((c as { Codigo?: string }).Codigo ?? "").trim())
  ) as { id: string; Codigo: string; name: string | null }[];

  if (eligible.length === 0) {
    console.error("No se encontraron proto_companies para codigos:", codigos.join(","));
    process.exit(1);
  }

  console.log("\n=== PASO 1: sync cuotas (desbloquea installment guard) ===");
  for (const c of eligible) {
    const codigo = String(c.Codigo).trim();
    console.log(`\n--- Cuotas ${codigo} ${c.name ?? ""} ---`);
    const cuotas = await runZetaInstallmentsPipeline(sb, WORKSPACE_ID, randomUUID(), {
      clienteCodigo: codigo,
      maxPagesPerRun: 99,
      pageDelayMs: 400,
      updateInvoiceDueDate: false,
    });
    console.log(
      JSON.stringify(
        {
          stopped_reason: cuotas.stopped_reason,
          rows_upserted: cuotas.rows_upserted,
          rows_linked: cuotas.rows_linked,
        },
        null,
        2
      )
    );
  }

  console.log("\n=== PASO 1b: cerrar cuotas obsoletas en facturas objetivo ===");
  const { data: targetRows, error: targetErr } = await sb
    .from("proto_invoices")
    .select("id, invoice_number")
    .eq("workspace_company_id", WORKSPACE_ID)
    .in("invoice_number", TARGET_INVOICES);
  if (targetErr) throw targetErr;

  const now = new Date().toISOString();
  for (const inv of targetRows ?? []) {
    const { data: cleared, error: instErr } = await sb
      .from("proto_invoice_installments")
      .update({ cuota_saldo: 0, synced_at: now })
      .eq("workspace_company_id", WORKSPACE_ID)
      .eq("invoice_id", inv.id)
      .gt("cuota_saldo", 0)
      .select("id, cuota_numero, cuota_saldo");
    if (instErr) throw instErr;
    console.log(
      `  ${inv.invoice_number}: cuotas cerradas=${cleared?.length ?? 0}`,
      cleared
    );
  }

  console.log("\n=== PASO 2: saldos + reconciliation_cleanup ===");
  for (const c of eligible) {
    const codigo = String(c.Codigo).trim();
    console.log(`\n--- Cliente ${codigo} ${c.name ?? ""} ---`);
    const result = await runZetaSaldosPendientesPipeline(sb, WORKSPACE_ID, randomUUID(), {
      protoCompanyId: c.id,
      clienteCodigo: codigo,
      mode: "bootstrap",
      syncMode: "reconciliation_cleanup",
      maxPagesPerRun: 99,
      pageDelayMs: 400,
    });
    console.log(
      JSON.stringify(
        {
          stopped_reason: result.stopped_reason,
          rows_upserted: result.rows_upserted,
          reconciliation: result.reconciliation,
        },
        null,
        2
      )
    );
  }

  const after = await snapshotInvoices(sb, WORKSPACE_ID);
  console.log("\n=== DESPUÉS ===");
  console.log(JSON.stringify(after, null, 2));

  let ok = true;
  for (const inv of after) {
    const bal = Number(inv.balance_amount) || 0;
    const st = String(inv.status ?? "");
    if (bal > 0.005 || st !== "paid") {
      ok = false;
      console.error(`FAIL ${inv.invoice_number}: balance=${bal} status=${st}`);
    }
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
