#!/usr/bin/env node
/**
 * Rollback del backfill backfill-invoice-balance-from-installments.
 *
 * Identifica facturas con zeta_metadata.backfills.invoice_balance_from_installments
 * y revierte exactamente los campos que el backfill modificó:
 *   - balance_amount → previous_balance
 *   - status         → previous_status
 *   - due_date       → previous_due_date  (solo si fue guardado)
 *
 * Preserva el registro de auditoría agregando rollback_at / rollback_reason
 * dentro del mismo bloque de metadata.
 *
 * Uso:
 *   node --env-file=.env.local scripts/rollback-invoice-balance-backfill.mjs --dry-run
 *   node --env-file=.env.local scripts/rollback-invoice-balance-backfill.mjs --apply
 *   node --env-file=.env.local scripts/rollback-invoice-balance-backfill.mjs --apply --workspace <uuid>
 *
 * Regla: NO usa Σ cuota_saldo como fuente de verdad de saldo contable.
 * Los installments son datos de aging/diagnóstico, no de apertura de deuda.
 * La fuente de verdad es RESTFacturaClienteV4QuerySaldosPendientes (saldos Zeta).
 */

const ROLLBACK_REASON = "installment_saldo_not_valid_as_accounting_balance: revert to zeta_saldos_source_of_truth";
const SCRIPT_VERSION = "1.0.0";

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

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
function argFlag(n) { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? null) : null; }
function hasFlag(n) { return args.includes(n); }

const DRY_RUN = hasFlag("--dry-run") || !hasFlag("--apply");
const WORKSPACE_ARG = argFlag("--workspace");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE_ID = WORKSPACE_ARG ?? process.env.WORKSPACE_COMPANY_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("ERROR: Supabase env missing."); process.exit(1); }
if (!WORKSPACE_ID) { console.error("ERROR: --workspace or WORKSPACE_COMPANY_ID required."); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PAGE = 1000;

// ---------------------------------------------------------------------------
// Load all active invoices, filter by backfill marker in JS
// ---------------------------------------------------------------------------

async function loadBackfilledInvoices(wid) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, balance_amount, status, due_date, due_date_source, company_id, zeta_metadata")
      .eq("workspace_company_id", wid)
      .eq("is_active", true)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Load failed: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // Filter: has backfill marker AND has NOT been rolled back yet
  return all.filter((r) => {
    const b = getBackfillRecord(r.zeta_metadata);
    if (!b) return false;
    if (b.rollback_at) return false; // already rolled back — skip
    return true;
  });
}

function getBackfillRecord(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const backfills = metadata.backfills;
  if (!backfills || typeof backfills !== "object") return null;
  const rec = backfills.invoice_balance_from_installments;
  if (!rec || typeof rec !== "object") return null;
  return rec;
}

// ---------------------------------------------------------------------------
// Build rollback patch
// ---------------------------------------------------------------------------

function buildRollbackPatch(row, now) {
  const meta = row.zeta_metadata;
  const rec = getBackfillRecord(meta);

  if (!rec) return null;

  const prevBalance = typeof rec.previous_balance === "number" ? rec.previous_balance : 0;
  const prevStatus = typeof rec.previous_status === "string" ? rec.previous_status : "paid";
  const prevDueDate = typeof rec.previous_due_date === "string" ? rec.previous_due_date : null;

  // Build updated metadata: preserve backfill record + add rollback stamp
  const updatedMeta = {
    ...(meta != null && typeof meta === "object" ? meta : {}),
    backfills: {
      ...(meta?.backfills != null && typeof meta.backfills === "object" ? meta.backfills : {}),
      invoice_balance_from_installments: {
        ...rec,
        rollback_at: now,
        rollback_reason: ROLLBACK_REASON,
        rollback_script_version: SCRIPT_VERSION,
        // snapshot of what we're reverting FROM (for audit trail)
        rolled_back_balance: typeof row.balance_amount === "number"
          ? row.balance_amount
          : Number(row.balance_amount) || 0,
        rolled_back_status: row.status ?? null,
        rolled_back_due_date: row.due_date ?? null,
      },
    },
  };

  const patch = {
    balance_amount: prevBalance,
    status: prevStatus,
    zeta_metadata: updatedMeta,
  };

  // Restore due_date only if previous_due_date was recorded
  if (Object.prototype.hasOwnProperty.call(rec, "previous_due_date")) {
    patch.due_date = prevDueDate;
    // Clear due_date_source if we're clearing the date,
    // otherwise leave as-is (we didn't save previous_due_date_source)
    if (prevDueDate === null) {
      patch.due_date_source = null;
    }
    // If prevDueDate is non-null we preserve current due_date_source
    // (installments pipeline may have set it to zeta_cuotas_v1 legitimately)
  }

  return {
    patch,
    prevBalance,
    prevStatus,
    prevDueDate,
    newBalance: rec.new_balance ?? null,
    appliedAt: rec.applied_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const wid = WORKSPACE_ID.trim();
  const now = new Date().toISOString();

  console.log(`\n=== rollback-invoice-balance-backfill v${SCRIPT_VERSION} ===`);
  console.log(`Mode:      ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);
  console.log(`Workspace: ${wid}`);
  console.log(`Time:      ${now}\n`);

  console.log("Loading invoices with backfill marker...");
  const backfilled = await loadBackfilledInvoices(wid);
  console.log(`  Found: ${backfilled.length} invoice(s) to roll back\n`);

  if (backfilled.length === 0) {
    console.log("Nothing to roll back.\n");
    return;
  }

  // Build all patches and print preview
  const plan = [];
  for (const row of backfilled) {
    const result = buildRollbackPatch(row, now);
    if (!result) continue;
    plan.push({ row, ...result });
  }

  // Print table
  const w = [32, 12, 12, 10, 10];
  const header =
    "Invoice #".padEnd(w[0]) + " | " +
    "Old Bal".padStart(w[1]) + " | " +
    "New Bal".padStart(w[2]) + " | " +
    "Old St".padEnd(w[3]) + " | " +
    "New St".padEnd(w[4]);
  const sep = "-".repeat(w.reduce((a, b) => a + b + 3, 0));

  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const p of plan) {
    const curBal = typeof p.row.balance_amount === "number"
      ? p.row.balance_amount
      : Number(p.row.balance_amount) || 0;
    console.log(
      String(p.row.invoice_number ?? p.row.id).slice(0, w[0]).padEnd(w[0]) + " | " +
      String(curBal).padStart(w[1]) + " | " +
      String(p.prevBalance).padStart(w[2]) + " | " +
      String(p.row.status ?? "-").slice(0, w[3]).padEnd(w[3]) + " | " +
      String(p.prevStatus).slice(0, w[4]).padEnd(w[4])
    );
  }
  console.log(sep + "\n");

  if (DRY_RUN) {
    console.log(`DRY-RUN: ${plan.length} invoice(s) WOULD be rolled back.`);
    console.log("Re-run with --apply to execute.\n");
    return;
  }

  // Apply
  console.log(`Applying rollback for ${plan.length} invoice(s)...`);
  let ok = 0;
  let failed = 0;

  for (const p of plan) {
    const { error } = await supabase
      .from("proto_invoices")
      .update(p.patch)
      .eq("id", p.row.id)
      .eq("workspace_company_id", wid);

    if (error) {
      console.error(`  ✗ ${p.row.invoice_number}: ${error.message}`);
      failed++;
    } else {
      const curBal = typeof p.row.balance_amount === "number"
        ? p.row.balance_amount
        : Number(p.row.balance_amount) || 0;
      console.log(
        `  ✓ ${p.row.invoice_number}: balance ${curBal} → ${p.prevBalance}` +
        ` | status ${p.row.status} → ${p.prevStatus}`
      );
      ok++;
    }
  }

  console.log(`\nRollback complete. OK=${ok} Failed=${failed}`);

  if (failed > 0) {
    console.error("\nWARNING: Some rollbacks failed. Re-run to retry.\n");
    process.exit(1);
  }

  console.log("\nPost-rollback validation:");
  console.log("  node --env-file=.env.local scripts/audit-excel-pending-vs-db.mjs");
  console.log("  Expected: 40 facturas, Gap UYU=0, Gap USD=0\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
