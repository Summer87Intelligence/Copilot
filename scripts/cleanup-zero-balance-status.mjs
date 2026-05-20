#!/usr/bin/env node
/**
 * Limpieza workspace-wide: facturas con balance_amount=0 y status!=paid,
 * SIN cuotas pendientes (SUM(cuota_saldo) = 0).
 *
 * Estas son facturas cobradas legítimamente cuyo status legacy quedó desactualizado
 * (el motor de saldos zerificó el balance pero no actualizó el status).
 * Son el componente "unconfirmedSuspicious" del health monitor.
 *
 * NO toca facturas con cuotas pendientes — esas son el bug histórico a corregir
 * con backfill-invoice-balance-from-installments.mjs.
 *
 * Uso:
 *   node --env-file=.env.local scripts/cleanup-zero-balance-status.mjs --dry-run
 *   node --env-file=.env.local scripts/cleanup-zero-balance-status.mjs --apply
 *   node --env-file=.env.local scripts/cleanup-zero-balance-status.mjs --apply --workspace <uuid>
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKSPACE_COMPANY_ID
 */

const SCRIPT_VERSION = "1.0.0";

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
function argFlag(name) { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? null) : null; }
function hasFlag(name) { return args.includes(name); }

const DRY_RUN = hasFlag("--dry-run") || !hasFlag("--apply");
const WORKSPACE_ARG = argFlag("--workspace");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE_ENV = process.env.WORKSPACE_COMPANY_ID;
const WORKSPACE_ID = WORKSPACE_ARG ?? WORKSPACE_ENV;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("ERROR: Supabase env missing."); process.exit(1); }
if (!WORKSPACE_ID) { console.error("ERROR: --workspace or WORKSPACE_COMPANY_ID required."); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const EPS = 0.005;
const PAGE = 500;

const VOIDED = new Set(["void", "voided", "canceled", "cancelled", "anulada", "anulado"]);

// Load all active invoices with balance=0 and non-paid status
async function loadCandidates(wid) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, status, company_id")
      .eq("workspace_company_id", wid)
      .eq("is_active", true)
      .lte("balance_amount", EPS)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((r) => {
      const st = String(r.status ?? "").trim().toLowerCase();
      return st !== "paid" && !VOIDED.has(st);
    });
    all.push(...rows);
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Check if invoice has any open installment saldo
async function hasOpenInstallments(wid, invoiceId) {
  try {
    const { data, error } = await supabase
      .from("proto_invoice_installments")
      .select("cuota_saldo")
      .eq("workspace_company_id", wid)
      .eq("invoice_id", invoiceId)
      .gt("cuota_saldo", EPS)
      .limit(1);
    if (error) return true; // conservative: assume open on error
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}

async function main() {
  const wid = WORKSPACE_ID.trim();
  console.log(`\n=== cleanup-zero-balance-status v${SCRIPT_VERSION} ===`);
  console.log(`Mode:      ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);
  console.log(`Workspace: ${wid}\n`);

  console.log("Loading candidates (balance=0, status!=paid)...");
  const candidates = await loadCandidates(wid);
  console.log(`  Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("Nothing to clean up.\n");
    return;
  }

  // Filter out those with open installments
  console.log("Checking for open installments...");
  const toFix = [];
  const withOpenInstallments = [];

  for (const inv of candidates) {
    const open = await hasOpenInstallments(wid, inv.id);
    if (open) {
      withOpenInstallments.push(inv);
    } else {
      toFix.push(inv);
    }
  }

  console.log(`  Safe to fix (no open installments): ${toFix.length}`);
  console.log(`  Skipped — has open installments: ${withOpenInstallments.length}`);

  if (withOpenInstallments.length > 0) {
    console.log("\n  Invoices with open installments (NOT touched — run backfill script):");
    for (const inv of withOpenInstallments.slice(0, 10)) {
      console.log(`    ${inv.invoice_number ?? inv.id} (status=${inv.status})`);
    }
    if (withOpenInstallments.length > 10) console.log(`    ... and ${withOpenInstallments.length - 10} more`);
  }

  if (toFix.length === 0) {
    console.log("\nAll balance=0 non-paid invoices have open installments — use backfill script instead.\n");
    return;
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN: ${toFix.length} invoice(s) WOULD be set to status=paid:`);
    for (const inv of toFix.slice(0, 20)) {
      console.log(`  ${inv.invoice_number ?? inv.id} (status=${inv.status ?? "?"})`);
    }
    if (toFix.length > 20) console.log(`  ... and ${toFix.length - 20} more`);
    console.log("\nRe-run with --apply to write changes.\n");
    return;
  }

  // Apply
  const now = new Date().toISOString();
  let ok = 0;
  let failed = 0;

  for (const inv of toFix) {
    const { error } = await supabase
      .from("proto_invoices")
      .update({
        status: "paid",
        zeta_metadata: { status_cleanup: { applied_at: now, previous_status: inv.status, reason: "zero_balance_legacy_status", script_version: SCRIPT_VERSION } },
      })
      .eq("id", inv.id)
      .eq("workspace_company_id", wid);

    if (error) {
      console.error(`  ✗ ${inv.invoice_number}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${inv.invoice_number ?? inv.id}: ${inv.status} → paid`);
      ok++;
    }
  }

  console.log(`\nDone. OK=${ok} Failed=${failed}`);
  if (failed > 0) process.exit(1);

  console.log("\nPost-apply validation:");
  console.log("  GET /api/cron/zeta-financial-health?debug=1");
  console.log("  → balance_overwrite_detected.affectedCount should decrease\n");
}

main().catch((err) => { console.error("FATAL:", err.message); process.exit(1); });
