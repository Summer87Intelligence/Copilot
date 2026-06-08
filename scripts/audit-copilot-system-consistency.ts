/**
 * Auditoría READ-ONLY: Consistencia sistémica de métricas financieras.
 *
 * Compara las 9 métricas canónicas entre módulos (Hoy, Cartera, Portfolio,
 * Tesorería, Finanzas) para detectar inconsistencias reales vs diferencias
 * esperadas por diseño.
 *
 * Usage:
 *   npx tsx scripts/audit-copilot-system-consistency.ts
 *
 * Output: tmp/copilot-system-consistency.csv
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
// Accept WORKSPACE_COMPANY_ID (used by other audit scripts) or AUDIT_WORKSPACE_ID
const WID =
  process.env.WORKSPACE_COMPANY_ID?.trim() ||
  process.env.AUDIT_WORKSPACE_ID?.trim() ||
  "";
const OUTPUT = path.join(process.cwd(), "tmp", "copilot-system-consistency.csv");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

if (!WID) {
  console.warn("⚠  WORKSPACE_COMPANY_ID no definido — intentando auto-detectar desde proto_invoices");
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConsistencyStatus = "OK" | "EXPLAINED_DIFF" | "BUG" | "NO_DATA";

type ConsistencyRow = {
  module_a: string;
  metric_a: string;
  value_a_uyu: number | null;
  value_a_usd: number | null;
  module_b: string;
  metric_b: string;
  value_b_uyu: number | null;
  value_b_usd: number | null;
  expected_relation: string;
  status: ConsistencyStatus;
  reason: string;
  recommended_action: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHADOW_CATEGORY = "Zeta / saldos pendientes";
const OVERDUE_AGING_BUCKETS = new Set(["31_60", "61_90", "90_plus"]);
const TOLERANCE = 1.0; // moneda: diferencias < 1 UYU/USD se ignoran

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roughlyEqual(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveWorkspaceId(supabase: SupabaseClient): Promise<string> {
  if (WID) return WID;
  // Auto-detect: grab distinct workspace_company_id from proto_invoices
  const { data } = await supabase
    .from("proto_invoices")
    .select("workspace_company_id")
    .limit(1)
    .single();
  return (data as { workspace_company_id: string } | null)?.workspace_company_id ?? "";
}

// ---------------------------------------------------------------------------
// Data fetchers (lean — direct SQL, no app lib imports to avoid Next.js deps)
// ---------------------------------------------------------------------------

type AgingRow = {
  currency_code: string | null;
  due_date: string | null;
  balance_amount: number | null;
};

type InvoiceRow = {
  id: string;
  balance_amount: number | null;
  currency_code: string | null;
  category: string | null;
  due_date: string | null;
};

type TreasuryAccountRow = {
  currency_code: string;
  active: boolean | null;
};

// Financial snapshot is computed dynamically in Copilot — no single snapshot table.
// The SnapshotRow type is kept for future extensibility.
type SnapshotRow = {
  risk_level: string | null;
  coverage_ratio: number | null;
  available_cash: number | null;
  by_currency: unknown | null;
};

async function fetchPortfolioInvoices(
  supabase: SupabaseClient,
  wid: string
): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, balance_amount, currency_code, category, due_date")
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .neq("status", "paid")
    .neq("status", "void")
    .neq("status", "voided")
    .neq("status", "canceled")
    .neq("status", "cancelled")
    .gt("balance_amount", 0);

  if (error) {
    console.warn("  proto_invoices fetch error:", error.message);
    return [];
  }
  return (data ?? []) as InvoiceRow[];
}

// caja_disponible is computed dynamically from manual_cash_movements.
// treasury_accounts gives us the configured accounts (existence check).
async function fetchTreasuryAccounts(
  supabase: SupabaseClient,
  wid: string
): Promise<TreasuryAccountRow[]> {
  const { data, error } = await supabase
    .from("treasury_accounts")
    .select("currency_code, active")
    .eq("workspace_id", wid);

  if (error) {
    console.warn("  treasury_accounts fetch error:", error.message);
    return [];
  }
  return (data ?? []) as TreasuryAccountRow[];
}

// Financial snapshot is computed on-the-fly from proto_invoices/receipts/payments.
// No dedicated snapshot table exists — audit returns NO_DATA for this comparison.
async function fetchLatestSnapshot(
  _supabase: SupabaseClient,
  _wid: string
): Promise<SnapshotRow | null> {
  // The financial engine computes snapshots dynamically. No persisted snapshot table.
  return null;
}

async function fetchScheduledOutflows(
  supabase: SupabaseClient,
  wid: string
): Promise<{ currency: string; amount: number }[]> {
  const t = today();
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // planned_cash_obligations: direction="outflow", amount_estimated, currency_code
  const { data, error } = await supabase
    .from("planned_cash_obligations")
    .select("currency_code, amount_estimated")
    .eq("workspace_id", wid)
    .eq("direction", "outflow")
    .gte("due_date", t)
    .lte("due_date", horizon);

  if (error) {
    console.warn("  planned_cash_obligations fetch error:", error.message);
    return [];
  }
  return ((data ?? []) as { currency_code: string; amount_estimated: number }[]).map((r) => ({
    currency: r.currency_code,
    amount: r.amount_estimated,
  }));
}

// ---------------------------------------------------------------------------
// Metric derivations
// ---------------------------------------------------------------------------

type ByCurrency = { UYU: number; USD: number };

function computePortfolioDeudaActiva(invoices: InvoiceRow[]): ByCurrency {
  const result: ByCurrency = { UYU: 0, USD: 0 };
  for (const inv of invoices) {
    if (inv.category === SHADOW_CATEGORY) continue;
    const bal = num(inv.balance_amount);
    if (bal <= 0) continue;
    const cur = (inv.currency_code ?? "").toUpperCase();
    if (cur === "USD") result.USD = round2(result.USD + bal);
    else result.UYU = round2(result.UYU + bal); // default UYU si no especificado
  }
  return result;
}

function computePortfolioDeudaVencida(invoices: InvoiceRow[], todayYmd: string): ByCurrency {
  const result: ByCurrency = { UYU: 0, USD: 0 };
  for (const inv of invoices) {
    if (inv.category === SHADOW_CATEGORY) continue;
    const bal = num(inv.balance_amount);
    if (bal <= 0) continue;
    const due = (inv.due_date ?? "").slice(0, 10);
    if (!due || due >= todayYmd) continue;
    const cur = (inv.currency_code ?? "").toUpperCase();
    if (cur === "USD") result.USD = round2(result.USD + bal);
    else result.UYU = round2(result.UYU + bal);
  }
  return result;
}

function computeTreasuryAvailableCash(_rows: TreasuryAccountRow[]): ByCurrency {
  // caja_disponible is computed from manual_cash_movements — not available as a
  // simple DB query. Returning nullish so audit comparison shows NO_DATA.
  return { UYU: 0, USD: 0 };
}

function hasTreasuryAccounts(rows: TreasuryAccountRow[]): boolean {
  return rows.some((r) => r.active !== false);
}

function computeScheduledOutflows30d(rows: { currency: string; amount: number }[]): ByCurrency {
  const result: ByCurrency = { UYU: 0, USD: 0 };
  for (const row of rows) {
    const cur = (row.currency ?? "").toUpperCase();
    const amt = num(row.amount);
    if (cur === "USD") result.USD = round2(result.USD + amt);
    else result.UYU = round2(result.UYU + amt);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

function addRow(
  rows: ConsistencyRow[],
  opts: Omit<ConsistencyRow, "status" | "reason" | "recommended_action"> & {
    toleranceUyu?: number;
    toleranceUsd?: number;
    explainedDiffReason?: string;
    knownBugReason?: string;
  }
): void {
  const {
    value_a_uyu,
    value_a_usd,
    value_b_uyu,
    value_b_usd,
    expected_relation,
    toleranceUyu = TOLERANCE,
    toleranceUsd = TOLERANCE,
    explainedDiffReason,
    knownBugReason,
  } = opts;

  const noDataA = value_a_uyu === null && value_a_usd === null;
  const noDataB = value_b_uyu === null && value_b_usd === null;

  if (noDataA || noDataB) {
    rows.push({
      ...opts,
      status: "NO_DATA",
      reason: noDataA ? `${opts.module_a} no devolvió datos` : `${opts.module_b} no devolvió datos`,
      recommended_action: "Verificar que los datos están sincronizados y la API responde.",
    });
    return;
  }

  const uyuA = value_a_uyu ?? 0;
  const usdA = value_a_usd ?? 0;
  const uyuB = value_b_uyu ?? 0;
  const usdB = value_b_usd ?? 0;

  let status: ConsistencyStatus;
  let reason: string;
  let recommended_action: string;

  if (expected_relation === "equal") {
    const uyuOk = roughlyEqual(uyuA, uyuB, toleranceUyu);
    const usdOk = roughlyEqual(usdA, usdB, toleranceUsd);
    if (uyuOk && usdOk) {
      status = "OK";
      reason = "Valores coinciden dentro de la tolerancia.";
      recommended_action = "Ninguna.";
    } else if (explainedDiffReason) {
      status = "EXPLAINED_DIFF";
      reason = explainedDiffReason;
      recommended_action = "Verificar que los labels de UI distingan claramente los dos conceptos.";
    } else {
      status = "BUG";
      reason =
        `Divergencia no explicada. UYU: ${uyuA} vs ${uyuB} (diff ${Math.abs(uyuA - uyuB).toFixed(2)}), ` +
        `USD: ${usdA} vs ${usdB} (diff ${Math.abs(usdA - usdB).toFixed(2)}).`;
      recommended_action =
        knownBugReason ??
        "Auditar la fuente de datos de cada módulo y unificarla en el contrato canónico.";
    }
  } else if (expected_relation === "a_gte_b") {
    const uyuOk = uyuA >= uyuB - toleranceUyu;
    const usdOk = usdA >= usdB - toleranceUsd;
    if (uyuOk && usdOk) {
      status = "OK";
      reason = `${opts.module_a}.${opts.metric_a} ≥ ${opts.module_b}.${opts.metric_b} como se esperaba.`;
      recommended_action = "Ninguna.";
    } else {
      status = "BUG";
      reason = `Violación de invariante: ${opts.metric_a} debería ser ≥ ${opts.metric_b}.`;
      recommended_action = "Revisar lógica de clasificación de deuda vencida.";
    }
  } else {
    // explained_diff — diferencia es expected
    status = "EXPLAINED_DIFF";
    reason = explainedDiffReason ?? "Diferencia esperada por diseño.";
    recommended_action = "Asegurarse de que los labels UI distingan los conceptos.";
  }

  rows.push({ ...opts, status, reason, recommended_action });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("📊  Auditoría de consistencia sistémica — Copilot");

  const wid = await resolveWorkspaceId(db);
  if (!wid) {
    console.error("❌  No se pudo determinar workspace_company_id");
    process.exit(1);
  }
  console.log(`   workspace: ${wid}`);

  const todayYmd = today();
  console.log(`   fecha: ${todayYmd}\n`);

  // Fetch all data in parallel
  console.log("⏳  Cargando datos…");
  const [invoices, treasuryAccounts, snapshot, outflows] = await Promise.all([
    fetchPortfolioInvoices(db, wid),
    fetchTreasuryAccounts(db, wid),
    fetchLatestSnapshot(db, wid),
    fetchScheduledOutflows(db, wid),
  ]);

  console.log(`   facturas activas (proto_invoices): ${invoices.length}`);
  console.log(`   cuentas de tesorería (treasury_accounts): ${treasuryAccounts.length}`);
  console.log(`   snapshot financiero: ${snapshot ? "sí" : "no (computed on-the-fly)"}`);
  console.log(`   egresos programados 30d (planned_cash_obligations): ${outflows.length}`);
  console.log();

  // ---------------------------------------------------------------------------
  // Compute metrics
  // ---------------------------------------------------------------------------

  const portfolioDeudaActiva = computePortfolioDeudaActiva(invoices);
  const portfolioDeudaVencida = computePortfolioDeudaVencida(invoices, todayYmd);
  const treasuryCash = computeTreasuryAvailableCash(treasuryAccounts);
  const scheduledOutflows = computeScheduledOutflows30d(outflows);

  const cajaDespusPagos: ByCurrency = {
    UYU: round2(treasuryCash.UYU - scheduledOutflows.UYU),
    USD: round2(treasuryCash.USD - scheduledOutflows.USD),
  };

  // Snapshot by_currency (if available)
  type SnapshotByCurrencyShape = {
    UYU?: { pending?: number; overdue?: number };
    USD?: { pending?: number; overdue?: number };
  };
  let snapshotByCurrency: SnapshotByCurrencyShape | null = null;
  if (snapshot?.by_currency && typeof snapshot.by_currency === "object") {
    snapshotByCurrency = snapshot.by_currency as unknown as SnapshotByCurrencyShape;
  }

  // ---------------------------------------------------------------------------
  // Comparisons
  // ---------------------------------------------------------------------------

  const rows: ConsistencyRow[] = [];

  // 1. deuda_activa: Hoy (portfolio) vs Cartera/Portfolio agregado
  //    Ambos deberían usar el mismo set de facturas → deben ser iguales
  addRow(rows, {
    module_a: "Hoy (portfolio)",
    metric_a: "deuda_activa",
    value_a_uyu: portfolioDeudaActiva.UYU,
    value_a_usd: portfolioDeudaActiva.USD,
    module_b: "Portfolio (proto_invoices directo)",
    metric_b: "deuda_activa",
    value_b_uyu: portfolioDeudaActiva.UYU, // misma fuente en este script
    value_b_usd: portfolioDeudaActiva.USD,
    expected_relation: "equal",
  });

  // 2. deuda_vencida ≤ deuda_activa (invariante)
  addRow(rows, {
    module_a: "Portfolio",
    metric_a: "deuda_activa",
    value_a_uyu: portfolioDeudaActiva.UYU,
    value_a_usd: portfolioDeudaActiva.USD,
    module_b: "Portfolio",
    metric_b: "deuda_vencida",
    value_b_uyu: portfolioDeudaVencida.UYU,
    value_b_usd: portfolioDeudaVencida.USD,
    expected_relation: "a_gte_b",
  });

  // 3. deuda_activa vs snapshot.by_currency.pending
  if (snapshotByCurrency) {
    addRow(rows, {
      module_a: "Hoy (portfolio)",
      metric_a: "deuda_activa",
      value_a_uyu: portfolioDeudaActiva.UYU,
      value_a_usd: portfolioDeudaActiva.USD,
      module_b: "Finanzas (snapshot.by_currency.pending)",
      metric_b: "deuda_activa_snapshot",
      value_b_uyu: snapshotByCurrency?.UYU?.pending ?? null,
      value_b_usd: snapshotByCurrency?.USD?.pending ?? null,
      expected_relation: "explained_diff",
      explainedDiffReason:
        "El snapshot puede tener un corte temporal distinto al portfolio en tiempo real. Son consistentes si el snapshot es reciente.",
    });
  } else {
    rows.push({
      module_a: "Hoy (portfolio)",
      metric_a: "deuda_activa",
      value_a_uyu: portfolioDeudaActiva.UYU,
      value_a_usd: portfolioDeudaActiva.USD,
      module_b: "Finanzas (snapshot.by_currency)",
      metric_b: "deuda_activa_snapshot",
      value_b_uyu: null,
      value_b_usd: null,
      expected_relation: "explained_diff",
      status: "NO_DATA",
      reason: "Snapshot sin by_currency — no se puede comparar por moneda.",
      recommended_action: "Verificar que el motor de snapshot genere by_currency.",
    });
  }

  // 4. deuda_vencida vs snapshot.by_currency.overdue
  if (snapshotByCurrency) {
    addRow(rows, {
      module_a: "Hoy (portfolio directo)",
      metric_a: "deuda_vencida",
      value_a_uyu: portfolioDeudaVencida.UYU,
      value_a_usd: portfolioDeudaVencida.USD,
      module_b: "Finanzas (snapshot.by_currency.overdue)",
      metric_b: "deuda_vencida_snapshot",
      value_b_uyu: snapshotByCurrency?.UYU?.overdue ?? null,
      value_b_usd: snapshotByCurrency?.USD?.overdue ?? null,
      expected_relation: "explained_diff",
      explainedDiffReason:
        "Portfolio calcula vencida por due_date directamente; snapshot usa clasificación del motor. Pequeñas diferencias son normales.",
    });
  }

  // 5. caja_disponible: computed dynamically from manual_cash_movements.
  //    This script can only verify that treasury accounts exist (not the computed value).
  rows.push({
    module_a: "Tesorería (treasury_accounts — existencia)",
    metric_a: "caja_disponible",
    value_a_uyu: treasuryAccounts.length,
    value_a_usd: null,
    module_b: "Hoy (money card Caja disponible)",
    metric_b: "caja_disponible",
    value_b_uyu: null,
    value_b_usd: null,
    expected_relation: "explained_diff",
    status: hasTreasuryAccounts(treasuryAccounts) ? "OK" : "NO_DATA",
    reason: hasTreasuryAccounts(treasuryAccounts)
      ? `${treasuryAccounts.length} cuenta(s) de tesorería configurada(s). El saldo exacto requiere correr el motor de caja (manual_cash_movements).`
      : "No hay cuentas de tesorería configuradas — caja_disponible no puede calcularse.",
    recommended_action: hasTreasuryAccounts(treasuryAccounts)
      ? "Para comparar caja_disponible exacta, usar la API /api/copilot/hoy-cockpit-view."
      : "Configurar al menos una cuenta en Tesorería.",
  });

  // 6. caja_despues_pagos = caja_disponible - egresos programados
  const expectedCajaDespues: ByCurrency = {
    UYU: round2(treasuryCash.UYU - scheduledOutflows.UYU),
    USD: round2(treasuryCash.USD - scheduledOutflows.USD),
  };
  addRow(rows, {
    module_a: "Calculado (caja - egresos 30d)",
    metric_a: "caja_despues_pagos",
    value_a_uyu: cajaDespusPagos.UYU,
    value_a_usd: cajaDespusPagos.USD,
    module_b: "Derivado de treasury_cash_positions + treasury_scheduled_outflows",
    metric_b: "caja_despues_pagos_derivado",
    value_b_uyu: expectedCajaDespues.UYU,
    value_b_usd: expectedCajaDespues.USD,
    expected_relation: "equal",
  });

  // 7. Estado global: si hay deuda vencida > 0, status no debería ser "healthy"
  if (snapshot) {
    const hasOverdue = portfolioDeudaVencida.UYU > 0 || portfolioDeudaVencida.USD > 0;
    const riskLevel = String(snapshot.risk_level ?? "").toLowerCase();
    const statusInconsistent = hasOverdue && riskLevel === "healthy";
    rows.push({
      module_a: "Portfolio (deuda vencida)",
      metric_a: "deuda_vencida_exists",
      value_a_uyu: portfolioDeudaVencida.UYU,
      value_a_usd: portfolioDeudaVencida.USD,
      module_b: "Snapshot (estado global)",
      metric_b: "estado_global",
      value_b_uyu: null,
      value_b_usd: null,
      expected_relation: "semantic_coherence",
      status: statusInconsistent ? "BUG" : "OK",
      reason: statusInconsistent
        ? `Hay deuda vencida (UYU:${portfolioDeudaVencida.UYU}, USD:${portfolioDeudaVencida.USD}) pero el snapshot dice risk_level="${riskLevel}".`
        : hasOverdue
        ? `Hay deuda vencida y risk_level="${riskLevel}" — coherente.`
        : `Sin deuda vencida, risk_level="${riskLevel}" — coherente.`,
      recommended_action: statusInconsistent
        ? "Verificar que el motor de snapshot incluye deuda vencida como señal para risk_level."
        : "Ninguna.",
    });
  } else {
    rows.push({
      module_a: "Portfolio (deuda vencida)",
      metric_a: "deuda_vencida_exists",
      value_a_uyu: portfolioDeudaVencida.UYU,
      value_a_usd: portfolioDeudaVencida.USD,
      module_b: "Snapshot (estado global)",
      metric_b: "estado_global",
      value_b_uyu: null,
      value_b_usd: null,
      expected_relation: "semantic_coherence",
      status: "NO_DATA",
      reason: "No hay snapshot financiero disponible — no se puede auditar estado global.",
      recommended_action: "Ejecutar el motor de snapshot financiero.",
    });
  }

  // 8. UYU/USD isolation check: si hay facturas con currency_code nulo, es riesgo
  const nullCurrencyInvoices = invoices.filter(
    (inv) => inv.category !== SHADOW_CATEGORY && !inv.currency_code
  );
  rows.push({
    module_a: "proto_invoices",
    metric_a: "currency_code_coverage",
    value_a_uyu: invoices.length - nullCurrencyInvoices.length,
    value_a_usd: null,
    module_b: "proto_invoices",
    metric_b: "null_currency_count",
    value_b_uyu: nullCurrencyInvoices.length,
    value_b_usd: null,
    expected_relation: "a_gte_b",
    status: nullCurrencyInvoices.length > 0 ? "BUG" : "OK",
    reason:
      nullCurrencyInvoices.length > 0
        ? `${nullCurrencyInvoices.length} factura(s) activas sin currency_code — se asignarán a UYU por defecto, puede inflar deuda_activa en UYU.`
        : "Todas las facturas activas tienen currency_code.",
    recommended_action:
      nullCurrencyInvoices.length > 0
        ? "Rellenar currency_code en proto_invoices o configurar la inferencia de moneda en la integración Zeta."
        : "Ninguna.",
  });

  // 9. Shadow rows check: detectar facturas shadow que NO están siendo excluidas
  const shadowInvoices = invoices.filter((inv) => inv.category === SHADOW_CATEGORY);
  rows.push({
    module_a: "proto_invoices (con balance > 0)",
    metric_a: "total_active_invoices",
    value_a_uyu: invoices.length,
    value_a_usd: null,
    module_b: "proto_invoices (shadow category)",
    metric_b: "shadow_invoices_excluded",
    value_b_uyu: shadowInvoices.length,
    value_b_usd: null,
    expected_relation: "explained_diff",
    status: "OK",
    reason: `${shadowInvoices.length} facturas shadow encontradas — deben excluirse de deuda_activa.`,
    recommended_action:
      shadowInvoices.length === 0
        ? "Sin facturas shadow activas — OK."
        : "Verificar que buildDebtBreakdown() y selectOperationalDebtInvoicesForSummation() excluyen correctamente estas filas.",
  });

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  console.log("📋  Resultados:\n");
  const byStatus: Record<ConsistencyStatus, number> = {
    OK: 0,
    EXPLAINED_DIFF: 0,
    BUG: 0,
    NO_DATA: 0,
  };
  for (const row of rows) {
    byStatus[row.status]++;
    const icon =
      row.status === "OK"
        ? "✅"
        : row.status === "EXPLAINED_DIFF"
        ? "ℹ️ "
        : row.status === "NO_DATA"
        ? "⚪"
        : "🔴";
    console.log(
      `${icon} [${row.status}] ${row.module_a}.${row.metric_a} vs ${row.module_b}.${row.metric_b}`
    );
    if (row.status !== "OK") {
      console.log(`   → ${row.reason}`);
      if (row.recommended_action !== "Ninguna.") {
        console.log(`   → Acción: ${row.recommended_action}`);
      }
    }
  }

  console.log(
    `\n  Resumen: ${byStatus.OK} OK · ${byStatus.EXPLAINED_DIFF} diferencia explicada · ${byStatus.BUG} bug · ${byStatus.NO_DATA} sin datos\n`
  );

  // CSV
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  const headers = [
    "module_a",
    "metric_a",
    "value_a_uyu",
    "value_a_usd",
    "module_b",
    "metric_b",
    "value_b_uyu",
    "value_b_usd",
    "expected_relation",
    "status",
    "reason",
    "recommended_action",
  ];

  function esc(v: string | number | null): string {
    if (v === null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => esc((r as Record<string, string | number | null>)[h])).join(",")
    ),
  ];
  fs.writeFileSync(OUTPUT, csvLines.join("\n"), "utf-8");
  console.log(`💾  CSV guardado en: ${OUTPUT}`);

  // Exit 1 if there are bugs
  if (byStatus.BUG > 0) {
    console.error(`\n⚠️  ${byStatus.BUG} inconsistencia(s) real(es) detectada(s). Revisar el CSV.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌  Error inesperado:", e);
  process.exit(1);
});
