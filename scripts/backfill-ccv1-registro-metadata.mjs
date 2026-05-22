#!/usr/bin/env node
/**
 * Backfill read-only-safe: solo zeta_metadata.registro_id (no balance/status).
 *
 * Caso inicial: ZETA:CCV1:0:36:A:2877 ← RegistroId 2574 (El País A-2877)
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/backfill-ccv1-registro-metadata.mjs
 *   npx tsx --env-file=.env.local scripts/backfill-ccv1-registro-metadata.mjs --apply
 *   npx tsx --env-file=.env.local scripts/backfill-ccv1-registro-metadata.mjs --invoice ZETA:CCV1:0:36:A:2877 --registro 2574 --apply
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
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

const INVOICE =
  argFlag("--invoice") ?? "ZETA:CCV1:0:36:A:2877";
const REGISTRO = argFlag("--registro") ?? "2574";

async function main() {
  if (!url || !key || !workspaceId) {
    console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
    process.exit(1);
  }

  const { mergeRegistroIdIntoInvoiceZetaMetadata } = await import(
    "../lib/integrations/zeta/zeta-invoice-registro-metadata-merge.ts"
  );
  const { extractRegistroIdsFromInvoiceZetaMetadata } = await import(
    "../lib/integrations/zeta/zeta-proto-invoice-registro-match.ts"
  );

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: inv, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, status, zeta_metadata, updated_at")
    .eq("workspace_company_id", workspaceId)
    .eq("invoice_number", INVOICE)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!inv) {
    console.error(`No se encontró ${INVOICE}`);
    process.exit(1);
  }

  const beforeIds = extractRegistroIdsFromInvoiceZetaMetadata(inv.zeta_metadata);
  const merged = mergeRegistroIdIntoInvoiceZetaMetadata(inv.zeta_metadata, REGISTRO, {
    backfill_source: "scripts/backfill-ccv1-registro-metadata.mjs",
  });
  const afterIds = extractRegistroIdsFromInvoiceZetaMetadata(merged);

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Backfill metadata RegistroId (sin balance/status)");
  console.log("══════════════════════════════════════════════════════════════\n");
  console.log(`  Modo:           ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`  invoice_number: ${inv.invoice_number}`);
  console.log(`  id:             ${inv.id}`);
  console.log(`  balance_amount: ${inv.balance_amount} (no se modifica)`);
  console.log(`  status:         ${inv.status} (no se modifica)`);
  console.log(`  registro antes: ${beforeIds.join(", ") || "—"}`);
  console.log(`  registro después: ${afterIds.join(", ")}`);
  console.log();

  if (!APPLY) {
    console.log("  Ejecutar con --apply para persistir solo zeta_metadata.\n");
    return;
  }

  const { error: upErr } = await supabase
    .from("proto_invoices")
    .update({ zeta_metadata: merged })
    .eq("id", inv.id)
    .eq("workspace_company_id", workspaceId);

  if (upErr) throw new Error(upErr.message);
  console.log("  OK — metadata actualizada.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
