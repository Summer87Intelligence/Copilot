/**
 * PASO 1 + 2 — Reactivación controlada + re-sync abril 2026.
 *
 * PASO 1: Setea is_active=true para las 62 filas inactivas de abril 2026
 *   (category="Zeta / comprobantes por cliente", is_active=false, issue_date abril).
 *   Solo modifica: is_active, updated_at.
 *   NO toca: issue_date, balance_amount, status, recibos, ningún otro campo.
 *
 * PASO 2: Re-sync de vouchers abril 2026 via syncZetaCustomerVouchers().
 *
 * Usage:
 *   # Dry-run (solo cuenta y lista afectadas):
 *   npx tsx scripts/reactivate-abril-2026.ts
 *
 *   # Ejecutar real:
 *   EXECUTE=true npx tsx scripts/reactivate-abril-2026.ts
 *
 *   # Solo Paso 1 (sin re-sync):
 *   EXECUTE=true SKIP_SYNC=true npx tsx scripts/reactivate-abril-2026.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { syncZetaCustomerVouchers } from "../lib/integrations/zeta/zeta-customer-vouchers-pipeline";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf-8").split(/\r?\n/);
  for (const raw of lines) {
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
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const WID          = process.env.AUDIT_WORKSPACE_ID ?? "040321ff-10fd-4da3-aeca-f1865f879986";
const IS_EXECUTE   = process.env.EXECUTE === "true";
const SKIP_SYNC    = process.env.SKIP_SYNC === "true";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Filtro exacto — idéntico al criterio auditado
// ---------------------------------------------------------------------------
const FILTER = {
  workspace_company_id: WID,
  issue_date_gte: "2026-04-01",
  issue_date_lte: "2026-04-30",
  is_active: false,
  category: "Zeta / comprobantes por cliente",
} as const;

// ---------------------------------------------------------------------------
// Paso 1a — DRY RUN: leer filas afectadas
// ---------------------------------------------------------------------------

async function fetchTargetRows(): Promise<Row[]> {
  const { data, error } = await db
    .from("proto_invoices")
    .select("id, invoice_number, issue_date, status, balance_amount, created_at, updated_at")
    .eq("workspace_company_id", FILTER.workspace_company_id)
    .gte("issue_date", FILTER.issue_date_gte)
    .lte("issue_date", FILTER.issue_date_lte)
    .eq("is_active", FILTER.is_active)
    .eq("category", FILTER.category)
    .order("issue_date", { ascending: true })
    .limit(200);

  if (error) throw new Error(`fetch target rows: ${error.message}`);
  return (data ?? []) as Row[];
}

// ---------------------------------------------------------------------------
// Paso 1b — UPDATE: is_active=true, updated_at=now()
// ---------------------------------------------------------------------------

async function reactivateRow(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db
    .from("proto_invoices")
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_company_id", FILTER.workspace_company_id)
    .eq("is_active", false) // guard: solo si todavía está inactiva
    .eq("category", FILTER.category);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Paso 1c — Validar post-reactivación
// ---------------------------------------------------------------------------

async function validateReactivation(): Promise<{
  active_april_vouchers: number;
  inactive_april_vouchers: number;
}> {
  const { data, error } = await db
    .from("proto_invoices")
    .select("id, is_active")
    .eq("workspace_company_id", FILTER.workspace_company_id)
    .gte("issue_date", FILTER.issue_date_gte)
    .lte("issue_date", FILTER.issue_date_lte)
    .eq("category", FILTER.category)
    .limit(200);

  if (error) throw new Error(`validate: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return {
    active_april_vouchers:   rows.filter(r => r.is_active === true).length,
    inactive_april_vouchers: rows.filter(r => r.is_active === false).length,
  };
}

// ---------------------------------------------------------------------------
// Paso 2 — Re-sync vouchers abril 2026
// ---------------------------------------------------------------------------

async function runResync(): Promise<{
  success: boolean;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  error?: string;
}> {
  const requestId = `reactivate-abril-resync-${Date.now()}`;
  console.log(`\n[PASO 2] Iniciando re-sync vouchers abril 2026 (mes=4, anio=2026)...`);
  console.log(`  requestId: ${requestId}`);

  const outcome = await syncZetaCustomerVouchers({
    supabase: db,
    workspaceCompanyId: WID,
    ctx: { requestId, tenantId: WID },
    filters: {
      mes: "4",
      anio: "2026",
    },
  });

  return {
    success:     outcome.success,
    processed:   outcome.processed ?? 0,
    inserted:    outcome.inserted ?? 0,
    updated:     outcome.updated ?? 0,
    skipped:     outcome.skipped ?? 0,
    errors:      outcome.errors ?? 0,
    duration_ms: outcome.duration_ms ?? 0,
    error:       outcome.error ?? outcome.message,
  };
}

// ---------------------------------------------------------------------------
// Paso 3 — Métricas post-sync
// ---------------------------------------------------------------------------

async function postSyncMetrics(): Promise<{
  total_abril: number;
  active_saldos: number;
  active_vouchers: number;
  inactive_vouchers: number;
  paid_active: number;
  issued_active: number;
}> {
  const { data, error } = await db
    .from("proto_invoices")
    .select("id, is_active, category, status")
    .eq("workspace_company_id", WID)
    .gte("issue_date", FILTER.issue_date_gte)
    .lte("issue_date", FILTER.issue_date_lte)
    .limit(200);

  if (error) throw new Error(`post-sync metrics: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const vouchers = rows.filter(r => r.category === "Zeta / comprobantes por cliente");
  const saldos   = rows.filter(r => r.category === "Zeta / saldos pendientes");
  const activeVouchers = vouchers.filter(r => r.is_active === true);

  return {
    total_abril:       rows.length,
    active_saldos:     saldos.filter(r => r.is_active === true).length,
    active_vouchers:   activeVouchers.length,
    inactive_vouchers: vouchers.filter(r => r.is_active === false).length,
    paid_active:       activeVouchers.filter(r => r.status === "paid").length,
    issued_active:     activeVouchers.filter(r => r.status === "issued").length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const mode = IS_EXECUTE ? "EXECUTE" : "DRY-RUN";
  console.log(`\n========================================================`);
  console.log(`  reactivate-abril-2026 — ${mode}`);
  console.log(`  Workspace: ${WID}`);
  console.log(`  Filtro: is_active=false, issue_date [2026-04-01..2026-04-30]`);
  console.log(`          category="Zeta / comprobantes por cliente"`);
  console.log(`========================================================\n`);

  // ── Paso 1a: leer filas afectadas ──────────────────────────────────────
  console.log("[PASO 1a] Leyendo filas candidatas...");
  const targets = await fetchTargetRows();
  console.log(`  → ${targets.length} filas encontradas\n`);

  if (targets.length === 0) {
    console.log("✅  No hay filas que reactivar. Fin.");
    return;
  }

  // Log de IDs afectados
  console.log("[PASO 1a] IDs a reactivar:");
  for (const r of targets) {
    console.log(`  ${String(r.id).slice(0, 8)}… | ${r.invoice_number} | issue_date=${r.issue_date} | status=${r.status} | balance=${r.balance_amount}`);
  }

  if (!IS_EXECUTE) {
    console.log(`\n⚠️  DRY-RUN: no se aplicaron cambios.`);
    console.log(`   Para ejecutar: EXECUTE=true npx tsx scripts/reactivate-abril-2026.ts`);
    return;
  }

  // ── Paso 1b: UPDATE ────────────────────────────────────────────────────
  console.log(`\n[PASO 1b] Reactivando ${targets.length} filas (is_active=true)...`);
  let ok = 0;
  let failed = 0;
  for (const r of targets) {
    const res = await reactivateRow(String(r.id));
    if (res.ok) {
      ok++;
    } else {
      failed++;
      console.error(`  ERROR row ${r.id}: ${res.error}`);
    }
  }
  console.log(`  → OK: ${ok} | FAILED: ${failed}`);

  // ── Paso 1c: validar ───────────────────────────────────────────────────
  console.log(`\n[PASO 1c] Validando reactivación...`);
  const val = await validateReactivation();
  console.log(`  active_april_vouchers:   ${val.active_april_vouchers}`);
  console.log(`  inactive_april_vouchers: ${val.inactive_april_vouchers}`);

  if (val.inactive_april_vouchers > 0) {
    console.warn(`  ⚠️  Quedan ${val.inactive_april_vouchers} filas inactivas (posible error parcial).`);
  } else {
    console.log(`  ✅  Todas reactivadas correctamente.`);
  }

  if (SKIP_SYNC) {
    console.log(`\n[SKIP_SYNC=true] Omitiendo Paso 2. Fin.`);
    return;
  }

  // ── Paso 2: re-sync ────────────────────────────────────────────────────
  const syncResult = await runResync();
  console.log(`\n[PASO 2] Resultado re-sync:`);
  console.log(`  success:     ${syncResult.success}`);
  console.log(`  processed:   ${syncResult.processed}`);
  console.log(`  inserted:    ${syncResult.inserted}`);
  console.log(`  updated:     ${syncResult.updated}`);
  console.log(`  skipped:     ${syncResult.skipped}`);
  console.log(`  errors:      ${syncResult.errors}`);
  console.log(`  duration_ms: ${syncResult.duration_ms}`);
  if (syncResult.error) console.log(`  error:       ${syncResult.error}`);

  // ── Paso 3: métricas post-sync ─────────────────────────────────────────
  console.log(`\n[PASO 3] Métricas post-sync abril 2026:`);
  const metrics = await postSyncMetrics();
  console.log(`  total_abril:       ${metrics.total_abril}`);
  console.log(`  active_saldos:     ${metrics.active_saldos}`);
  console.log(`  active_vouchers:   ${metrics.active_vouchers}`);
  console.log(`  inactive_vouchers: ${metrics.inactive_vouchers}`);
  console.log(`  paid_active:       ${metrics.paid_active}`);
  console.log(`  issued_active:     ${metrics.issued_active}`);

  console.log(`\n========================================================`);
  console.log(`  RESUMEN FINAL`);
  console.log(`  Reactivadas:        ${ok}/${targets.length}`);
  console.log(`  Re-sync processed:  ${syncResult.processed}`);
  console.log(`  Re-sync updated:    ${syncResult.updated}`);
  console.log(`  Re-sync errores:    ${syncResult.errors}`);
  console.log(`  Vouchers activas:   ${metrics.active_vouchers} (vs 0 antes)`);
  console.log(`  Vouchers inactivas: ${metrics.inactive_vouchers} (vs ${targets.length} antes)`);
  console.log(`========================================================\n`);
}

main().catch(err => {
  console.error("[reactivate-abril-2026] ERROR:", err);
  process.exit(1);
});
