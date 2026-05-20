#!/usr/bin/env node
/**
 * Backfill: corrige facturas con balance_amount=0 pero Σ cuota_saldo > 0.
 *
 * Estas 16 facturas históricas fueron cerradas incorrectamente por el zero-pass
 * o el orphan-auto-close antes del guard anti-close (17f3d55). El guard impide
 * que nuevas facturas queden en este estado, pero no corrige las históricas.
 *
 * Uso:
 *   # Simulación (no escribe nada):
 *   node --env-file=.env.local --import tsx scripts/backfill-invoice-balance-from-installments.mjs --dry-run
 *
 *   # Aplicar corrección:
 *   node --env-file=.env.local --import tsx scripts/backfill-invoice-balance-from-installments.mjs --apply
 *
 *   # Filtrar workspace o delta mínimo:
 *   ... --workspace <uuid> --min-delta 1.0
 *
 * Qué actualiza:
 *   - balance_amount  = Σ cuota_saldo (cuotas con saldo > EPSILON)
 *   - status          = deriveInvoiceFinancialStatusFromBalance(...)
 *   - due_date        = min(cuota_vencimiento) de cuotas abiertas
 *   - due_date_source = "zeta_cuotas_v1"
 *   - zeta_metadata.backfills.invoice_balance_from_installments = {applied_at, ...}
 *
 * Qué NO toca:
 *   - total_amount
 *   - currency_code (salvo que esté null y todas las cuotas sean monoMoneda)
 *   - vouchers metadata
 *   - company, issue_date, invoice_number
 *
 * Reglas de seguridad:
 *   - Skip si currency inconsistente entre cuotas de la misma factura
 *   - Skip si Σ cuota_saldo < min-delta
 *   - Skip si ya tiene backfill aplicado (idempotente)
 *   - No cruza workspace
 *   - Modo --apply requiere confirmación explícita vía flag
 *
 * Versión del script:
 */

const SCRIPT_VERSION = "1.0.0";

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Env + config
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
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}
function hasFlag(name) {
  return args.includes(name);
}

const DRY_RUN = hasFlag("--dry-run") || !hasFlag("--apply");
const WORKSPACE_ARG = argFlag("--workspace");
const MIN_DELTA = parseFloat(argFlag("--min-delta") ?? "0.01");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE_ENV = process.env.WORKSPACE_COMPANY_ID;
const WORKSPACE_ID = WORKSPACE_ARG ?? WORKSPACE_ENV;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos.");
  process.exit(1);
}
if (!WORKSPACE_ID) {
  console.error("ERROR: Especificar --workspace <uuid> o WORKSPACE_COMPANY_ID en env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EPS = 0.005;
const PAGE_SIZE = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function safeNum(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseYmd(s) {
  if (!s) return null;
  const d = String(s).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  return Number.isFinite(ms) ? d : null;
}

function deriveStatus(balanceAmount, totalAmount) {
  if (balanceAmount <= EPS) return "paid";
  if (totalAmount != null && totalAmount > EPS && balanceAmount < totalAmount - EPS) return "partial";
  return "issued";
}

function mergeBackfillMetadata(existing, patch) {
  const base =
    existing != null && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const backfills = base.backfills != null && typeof base.backfills === "object"
    ? { ...base.backfills }
    : {};
  backfills.invoice_balance_from_installments = patch;
  base.backfills = backfills;
  return base;
}

function alreadyBackfilled(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  const b = metadata.backfills;
  if (!b || typeof b !== "object") return false;
  return b.invoice_balance_from_installments != null;
}

// ---------------------------------------------------------------------------
// Load candidates: invoices with balance_amount=0 that are NOT paid/voided
// ---------------------------------------------------------------------------

const VOIDED = new Set(["paid", "void", "voided", "canceled", "cancelled", "anulada", "anulado"]);

async function loadCandidateInvoices(wid) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select(
        "id, invoice_number, balance_amount, total_amount, status, currency_code, issue_date, due_date, due_date_source, company_id, zeta_metadata"
      )
      .eq("workspace_company_id", wid)
      .eq("is_active", true)
      .lte("balance_amount", EPS)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`loadCandidateInvoices: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  // Filter: not already terminal status AND not already backfilled
  return all.filter((r) => {
    const st = String(r.status ?? "").trim().toLowerCase();
    if (VOIDED.has(st) && st !== "paid") return false; // allow paid through (they're the problem)
    if (alreadyBackfilled(r.zeta_metadata)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Load installments for a batch of invoice IDs
// ---------------------------------------------------------------------------

async function loadInstallmentsForInvoices(wid, invoiceIds) {
  const all = [];
  const ids = [...invoiceIds];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await supabase
      .from("proto_invoice_installments")
      .select("invoice_id, cuota_saldo, cuota_vencimiento, currency_code")
      .eq("workspace_company_id", wid)
      .in("invoice_id", batch)
      .gt("cuota_saldo", EPS);
    if (error) throw new Error(`loadInstallments: ${error.message}`);
    all.push(...(data ?? []));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Load company names for display
// ---------------------------------------------------------------------------

async function loadCompanyNames(wid, companyIds) {
  const map = new Map();
  const ids = [...new Set(companyIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data } = await supabase
      .from("proto_companies")
      .select("id, name")
      .eq("workspace_company_id", wid)
      .in("id", batch);
    for (const r of data ?? []) map.set(r.id, r.name ?? null);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Build action plan
// ---------------------------------------------------------------------------

function buildPlan(invoices, installmentRows) {
  // Group installments by invoice_id
  const byInvoice = new Map();
  for (const row of installmentRows) {
    const id = row.invoice_id;
    if (!byInvoice.has(id)) byInvoice.set(id, []);
    byInvoice.get(id).push(row);
  }

  const actions = [];
  const skipped = [];

  for (const inv of invoices) {
    const rows = byInvoice.get(inv.id);
    if (!rows || rows.length === 0) {
      skipped.push({ invoice_id: inv.id, invoice_number: inv.invoice_number, reason: "no_open_installments" });
      continue;
    }

    // Check currency consistency
    const currencies = new Set(
      rows.map((r) => (r.currency_code ?? "").trim().toUpperCase()).filter(Boolean)
    );
    const invCurrency = (inv.currency_code ?? "").trim().toUpperCase();
    if (invCurrency && currencies.size > 0 && !currencies.has(invCurrency)) {
      skipped.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        reason: `currency_mismatch: inv=${invCurrency} cuotas=[${[...currencies].join(",")}]`,
      });
      continue;
    }
    if (currencies.size > 1) {
      skipped.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        reason: `mixed_currency_installments: [${[...currencies].join(",")}]`,
      });
      continue;
    }

    // Sum open installments
    let total = 0;
    let oldestDueDate = null;
    let newestDueDate = null;

    for (const row of rows) {
      const saldo = round2(Math.max(0, safeNum(row.cuota_saldo)));
      if (saldo <= EPS) continue;
      total += saldo;
      const d = parseYmd(row.cuota_vencimiento);
      if (d) {
        if (!oldestDueDate || d < oldestDueDate) oldestDueDate = d;
        if (!newestDueDate || d > newestDueDate) newestDueDate = d;
      }
    }
    total = round2(total);

    if (total < MIN_DELTA) {
      skipped.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        reason: `delta_below_min: saldo=${total} < min_delta=${MIN_DELTA}`,
      });
      continue;
    }

    const newStatus = deriveStatus(total, safeNum(inv.total_amount) || undefined);
    const currency = invCurrency || ([...currencies][0] ?? null);

    actions.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      company_id: inv.company_id,
      currency,
      old_balance: round2(safeNum(inv.balance_amount)),
      new_balance: total,
      old_status: String(inv.status ?? "").trim(),
      new_status: newStatus,
      old_due_date: inv.due_date ?? null,
      new_due_date: oldestDueDate,
      installment_count: rows.length,
      oldest_due_date: oldestDueDate,
      newest_due_date: newestDueDate,
      total_amount: safeNum(inv.total_amount),
      existing_zeta_metadata: inv.zeta_metadata,
    });
  }

  return { actions, skipped };
}

// ---------------------------------------------------------------------------
// Print dry-run table
// ---------------------------------------------------------------------------

function printTable(actions, companyNames) {
  const cols = [
    { key: "invoice_number", label: "Invoice #", width: 30 },
    { key: "company", label: "Company", width: 28 },
    { key: "currency", label: "CCY", width: 5 },
    { key: "old_balance", label: "Old Bal", width: 10 },
    { key: "new_balance", label: "New Bal", width: 10 },
    { key: "old_status", label: "Old St", width: 9 },
    { key: "new_status", label: "New St", width: 9 },
    { key: "installment_count", label: "#Cuotas", width: 8 },
    { key: "new_due_date", label: "New Due", width: 12 },
  ];

  const header = cols.map((c) => c.label.padEnd(c.width)).join(" | ");
  const sep = cols.map((c) => "-".repeat(c.width)).join("-+-");
  console.log("\n" + sep);
  console.log(header);
  console.log(sep);

  for (const a of actions) {
    const company = companyNames.get(a.company_id) ?? a.company_id ?? "-";
    const row = [
      String(a.invoice_number ?? "-").slice(0, cols[0].width).padEnd(cols[0].width),
      company.slice(0, cols[1].width).padEnd(cols[1].width),
      (a.currency ?? "-").padEnd(cols[2].width),
      String(a.old_balance).padStart(cols[3].width),
      String(a.new_balance).padStart(cols[4].width),
      String(a.old_status ?? "-").padEnd(cols[5].width),
      String(a.new_status).padEnd(cols[6].width),
      String(a.installment_count).padStart(cols[7].width),
      (a.new_due_date ?? "-").padEnd(cols[8].width),
    ];
    console.log(row.join(" | "));
  }
  console.log(sep + "\n");
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyAction(wid, action) {
  const now = new Date().toISOString();
  const newMeta = mergeBackfillMetadata(action.existing_zeta_metadata, {
    applied_at: now,
    previous_balance: action.old_balance,
    new_balance: action.new_balance,
    previous_status: action.old_status,
    previous_due_date: action.old_due_date,
    new_due_date: action.new_due_date,
    reason: "installment_saldo_gt_invoice_balance",
    script_version: SCRIPT_VERSION,
  });

  const patch = {
    balance_amount: action.new_balance,
    status: action.new_status,
    zeta_metadata: newMeta,
  };
  if (action.new_due_date) {
    patch.due_date = action.new_due_date;
    patch.due_date_source = "zeta_cuotas_v1";
  }

  const { error } = await supabase
    .from("proto_invoices")
    .update(patch)
    .eq("id", action.invoice_id)
    .eq("workspace_company_id", wid);

  if (error) throw new Error(`applyAction ${action.invoice_id}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const wid = WORKSPACE_ID.trim();
  const mode = DRY_RUN ? "DRY-RUN" : "APPLY";
  console.log(`\n=== backfill-invoice-balance-from-installments v${SCRIPT_VERSION} ===`);
  console.log(`Mode:         ${mode}`);
  console.log(`Workspace:    ${wid}`);
  console.log(`Min delta:    ${MIN_DELTA}`);
  console.log(`Epsilon:      ${EPS}\n`);

  // 1. Load candidate invoices (balance=0, active, not already backfilled)
  console.log("Loading candidate invoices (balance=0, active)...");
  const candidates = await loadCandidateInvoices(wid);
  console.log(`  Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("\nNo candidates found. Nothing to do.");
    return;
  }

  // 2. Load open installments for candidates
  console.log("Loading open installments...");
  const invoiceIds = candidates.map((r) => r.id);
  const installmentRows = await loadInstallmentsForInvoices(wid, invoiceIds);
  console.log(`  Open installment rows: ${installmentRows.length}`);

  // 3. Build plan
  const { actions, skipped } = buildPlan(candidates, installmentRows);
  console.log(`  Actions planned:  ${actions.length}`);
  console.log(`  Skipped (no action needed): ${skipped.length}`);

  if (skipped.length > 0) {
    console.log("\nSkipped:");
    for (const s of skipped) {
      console.log(`  ${s.invoice_number ?? s.invoice_id}: ${s.reason}`);
    }
  }

  if (actions.length === 0) {
    console.log("\nNo actionable divergences found.");
    return;
  }

  // 4. Load company names for display
  const companyIds = actions.map((a) => a.company_id).filter(Boolean);
  const companyNames = await loadCompanyNames(wid, companyIds);

  // 5. Print table
  printTable(actions, companyNames);

  if (DRY_RUN) {
    console.log(`DRY-RUN: ${actions.length} invoice(s) WOULD be updated.`);
    console.log("Re-run with --apply to write changes.\n");
    return;
  }

  // 6. Apply
  console.log(`Applying ${actions.length} correction(s)...`);
  let ok = 0;
  let failed = 0;
  const errors = [];

  for (const action of actions) {
    try {
      await applyAction(wid, action);
      console.log(`  ✓ ${action.invoice_number}: ${action.old_balance} → ${action.new_balance} (${action.old_status} → ${action.new_status})`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${action.invoice_number}: ${err.message}`);
      errors.push({ invoice: action.invoice_number, error: err.message });
      failed++;
    }
  }

  console.log(`\nDone. OK=${ok} Failed=${failed}`);
  if (errors.length > 0) {
    console.error("\nErrors:");
    for (const e of errors) console.error(`  ${e.invoice}: ${e.error}`);
    process.exit(1);
  }

  console.log("\nPost-apply validation:");
  console.log("  1. Run health debug: GET /api/cron/zeta-financial-health?debug=1");
  console.log("     → balance_overwrite_detected.affectedCount debe bajar a 0 (o reducirse)");
  console.log("  2. Run: node --env-file=.env.local --import tsx scripts/audit-excel-pending-vs-db.mjs");
  console.log("     → Verificar que el audit 40/40 sigue OK");
  console.log("  3. Check coverage: si existe scripts/audit-installment-aging-coverage.mjs, correrlo también\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
