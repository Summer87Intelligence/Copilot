#!/usr/bin/env node
/**
 * Diagnóstico read-only: facturas legacy `ZETA:{registroId}` vs CCV1 canónica.
 * No archiva ni elimina.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/diag-legacy-zeta-invoice.mjs
 *   npx tsx --env-file=.env.local scripts/diag-legacy-zeta-invoice.mjs --legacy ZETA:2574
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}
function loadEnvLocal() {
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

const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEGACY = argFlag("--legacy") ?? "ZETA:2574";
const CANONICAL = argFlag("--canonical") ?? "ZETA:CCV1:0:36:A:2877";

async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { isZetaLegacyShadowInvoiceNumber } = await import(
    "../lib/integrations/zeta/zeta-invoice-registro-metadata-merge.ts"
  );
  const { extractRegistroIdsFromInvoiceZetaMetadata } = await import(
    "../lib/integrations/zeta/zeta-proto-invoice-registro-match.ts"
  );

  const fetchInv = async (num) => {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select(
        "id, invoice_number, balance_amount, total_amount, status, is_active, archived_at, company_id, issue_date, created_at, updated_at, zeta_metadata, category, notes"
      )
      .eq("workspace_company_id", workspaceId)
      .eq("invoice_number", num)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };

  const legacy = await fetchInv(LEGACY);
  const canon = await fetchInv(CANONICAL);

  const registroFromLegacy = LEGACY.startsWith("ZETA:") ? LEGACY.slice(5) : "";

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Diagnóstico legacy ZETA:{registroId} vs CCV1");
  console.log("══════════════════════════════════════════════════════════════\n");

  const printRow = (label, row) => {
    if (!row) {
      console.log(`  ${label}: (no existe)`);
      return;
    }
    console.log(`  ${label}:`);
    console.log(`    id: ${row.id}`);
    console.log(`    invoice_number: ${row.invoice_number}`);
    console.log(`    balance: ${row.balance_amount} | total: ${row.total_amount} | status: ${row.status}`);
    console.log(`    is_active: ${row.is_active} | archived_at: ${row.archived_at ?? "—"}`);
    console.log(`    updated_at: ${row.updated_at}`);
    console.log(`    category: ${row.category ?? "—"}`);
    console.log(`    registro_ids metadata: ${extractRegistroIdsFromInvoiceZetaMetadata(row.zeta_metadata).join(", ") || "—"}`);
  };

  printRow("Legacy", legacy);
  console.log();
  printRow("Canónica CCV1", canon);
  console.log();

  console.log("── Evaluación ──");
  console.log(`  Legacy es shadow pattern: ${isZetaLegacyShadowInvoiceNumber(LEGACY)}`);
  console.log(`  RegistroId implícito legacy: ${registroFromLegacy}`);

  if (legacy && canon) {
    const sameCompany = String(legacy.company_id) === String(canon.company_id);
    console.log(`  Mismo company_id: ${sameCompany}`);
    console.log(`  Legacy balance=0 y CCV1 activa: ${num(legacy.balance_amount) <= 0.005 && canon.is_active !== false}`);
  }

  console.log();
  console.log("── Recomendación (no aplicada por este script) ──");
  console.log("  1. NO eliminar ZETA:2574 todavía.");
  console.log("  2. Tras backfill RegistroId en CCV1, futuras sync saldos deben usar zeta_saldos_persist_registro o ccv1.");
  console.log("  3. Candidata a archivar (is_active=false) cuando:");
  console.log("     - CCV1 tiene registro_id=2574 en metadata");
  console.log("     - 2+ syncs saldos sin writes a legacy (ver ZETA_BALANCE_WRITE_DIAG + watch list)");
  console.log("     - balance legacy permanece 0");
  console.log("  4. Opcional: metadata zeta_legacy_shadow_v1 { canonical_invoice_number, deprecated: true } en legacy.");
  console.log();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
