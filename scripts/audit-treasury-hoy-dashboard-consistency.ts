/**
 * QA-004 — Auditoría: Tesorería Hoy vs Dashboard Resumen.
 *
 * Verifica que ambos consumen la misma fuente:
 *   GET /api/copilot/treasury/cash-position        → data.positions[].availableCash
 *   GET /api/copilot/treasury/scheduled-payments → data.summary[].scheduledTotal
 *
 * Usage: npm run audit:treasury-hoy-dashboard
 * Output: tmp/treasury-hoy-dashboard-consistency.csv
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { extractDashboardCurrencyData } from "../lib/copilot-dashboard-summary";
import { buildTodayBusinessPulse } from "../lib/copilot-today-business-pulse";
import { buildHoyProjection30dBlocks } from "../lib/copilot-hoy-treasury";
import { buildHoyCashPositionBlocks } from "../lib/copilot-hoy-treasury";
import { treasuryCashPositionGet } from "../lib/treasury/services/treasury-cash-opening-balance-service";
import { plannedCashObligationList } from "../lib/treasury/services/planned-cash-obligation-service";
import {
  filterPlannedObligationsForHoyScheduledList,
  loadInactiveRecurringTemplateIds,
  summarizeScheduledOutflows,
} from "../lib/treasury/treasury-scheduled-payments";
import { getEndOfCurrentMonth } from "../lib/copilot-operational-period";
import {
  canonicalTreasuryRollup,
  parseTreasuryCashPositionJson,
  parseTreasuryScheduledSummaryJson,
} from "../lib/treasury/treasury-api-parse";

const TOLERANCE = 0.01;
const OUTPUT = path.join(process.cwd(), "tmp", "treasury-hoy-dashboard-consistency.csv");

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
const WID =
  process.env.WORKSPACE_COMPANY_ID?.trim() ||
  process.env.AUDIT_WORKSPACE_ID?.trim() ||
  "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Faltan credenciales Supabase");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Row = {
  check_id: string;
  metric: string;
  currency: string;
  hoy: number;
  dashboard: number;
  canonical: number;
  delta_hoy_dashboard: number;
  status: "OK" | "FAIL";
};

async function resolveWorkspaceId(supabase: SupabaseClient): Promise<string> {
  if (WID) return WID;
  const { data } = await supabase
    .from("proto_invoices")
    .select("workspace_company_id")
    .limit(1)
    .single();
  return (data as { workspace_company_id: string } | null)?.workspace_company_id ?? "";
}

async function loadScheduledSummary(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  asOfDate: string
) {
  const listed = await plannedCashObligationList(
    supabase,
    tenantCompanyId,
    { direction: "outflow" },
    500
  );
  if (!listed.ok) return [];

  const horizonEnd = getEndOfCurrentMonth();
  const inactiveRecurringTemplateIds = await loadInactiveRecurringTemplateIds(
    supabase,
    tenantCompanyId
  );
  const range = {
    asOfDate,
    horizonEndDate: horizonEnd,
    periodStartDate: undefined,
    periodEndDate: horizonEnd,
    inactiveRecurringTemplateIds,
  };
  return summarizeScheduledOutflows(listed.data.items, range);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addCheck(
  rows: Row[],
  id: string,
  metric: string,
  currency: "UYU" | "USD",
  hoy: number,
  dashboard: number,
  canonical: number
) {
  const delta = round2(hoy - dashboard);
  rows.push({
    check_id: id,
    metric,
    currency,
    hoy: round2(hoy),
    dashboard: round2(dashboard),
    canonical: round2(canonical),
    delta_hoy_dashboard: delta,
    status:
      Math.abs(hoy - dashboard) <= TOLERANCE &&
      Math.abs(hoy - canonical) <= TOLERANCE &&
      Math.abs(dashboard - canonical) <= TOLERANCE
        ? "OK"
        : "FAIL",
  });
}

async function main() {
  const workspaceId = await resolveWorkspaceId(db);
  if (!workspaceId) {
    console.error("❌ workspace no resuelto");
    process.exit(1);
  }

  const asOfDate = new Date().toISOString().slice(0, 10);

  const [cashResult, outflowSummaries] = await Promise.all([
    treasuryCashPositionGet(db, workspaceId),
    loadScheduledSummary(db, workspaceId, asOfDate),
  ]);

  if (!cashResult.ok) {
    console.error("❌ treasuryCashPositionGet:", cashResult.message);
    process.exit(1);
  }

  const cashPositions = cashResult.data.positions;
  const canonical = canonicalTreasuryRollup(cashPositions, outflowSummaries);

  // Simular parse JSON de API (contrato real)
  const cashJson = { ok: true as const, data: cashResult.data };
  const outflowJson = {
    ok: true as const,
    data: { items: [], count: 0, summary: outflowSummaries },
  };
  const parsedPositions = parseTreasuryCashPositionJson(cashJson);
  const parsedSummaries = parseTreasuryScheduledSummaryJson(outflowJson);

  // Dashboard path
  const dashRows = extractDashboardCurrencyData({
    periodReport: null,
    outstandingReport: null,
    cashPositions: parsedPositions,
    outflowSummaries: parsedSummaries,
  });
  const dashUyu = dashRows.find((d) => d.currency === "UYU");
  const dashUsd = dashRows.find((d) => d.currency === "USD");

  // Hoy path
  const pending = { UYU: 0, USD: 0 };
  const cashBlocks = buildHoyCashPositionBlocks({
    cashPositions: parsedPositions,
    pendingByCurrency: pending,
    treasurySummaries: parsedSummaries,
  });
  const projection = buildHoyProjection30dBlocks({
    cashPositionBlocks: cashBlocks,
    pendingByCurrency: pending,
    treasurySummaries: parsedSummaries,
  });
  const pulse = buildTodayBusinessPulse({
    snapshot: null,
    portfolioRows: [],
    gate: { confidence: "high", coverage: "full", recommendations_enabled: true },
    treasuryCashPositions: parsedPositions,
    treasuryOutflowSummaries: parsedSummaries,
  });

  const hoyCashUyu = pulse.currentStateBlocks.find((b) => b.currency === "UYU")?.cashAvailable ?? 0;
  const hoyCashUsd = pulse.currentStateBlocks.find((b) => b.currency === "USD")?.cashAvailable ?? 0;
  const hoySafeUyu = projection.find((b) => b.currency === "UYU")?.safeCash30d ?? hoyCashUyu;
  const hoySafeUsd = projection.find((b) => b.currency === "USD")?.safeCash30d ?? hoyCashUsd;

  const rows: Row[] = [];
  for (const currency of ["UYU", "USD"] as const) {
    const canonAvail = canonical.availableCash[currency];
    const canonSafe = canonical.safeCash30d[currency];
    const hoyAvail = currency === "UYU" ? hoyCashUyu : hoyCashUsd;
    const hoySafe = currency === "UYU" ? hoySafeUyu : hoySafeUsd;
    const dashAvail =
      currency === "UYU" ? (dashUyu?.cajaDisponible ?? 0) : (dashUsd?.cajaDisponible ?? 0);
    const dashSafe =
      currency === "UYU" ? (dashUyu?.cajaDespPagos ?? 0) : (dashUsd?.cajaDespPagos ?? 0);

    addCheck(rows, `T-${currency}-01`, "availableCash / cajaDisponible", currency, hoyAvail, dashAvail, canonAvail);
    addCheck(rows, `T-${currency}-02`, "safeCash30d / cajaDespuesPagos", currency, hoySafe, dashSafe, canonSafe);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    "check_id,metric,currency,hoy,dashboard,canonical,delta_hoy_dashboard,status\n" +
      rows.map((r) =>
        [r.check_id, r.metric, r.currency, r.hoy, r.dashboard, r.canonical, r.delta_hoy_dashboard, r.status].join(",")
      ).join("\n") +
      "\n",
    "utf-8"
  );

  console.log("\n[QA-004] Tesorería Hoy vs Dashboard\n");
  console.log("Canónico (treasuryCashPositionGet + scheduled summary):");
  console.log(
    `  UYU availableCash=$${canonical.availableCash.UYU.toLocaleString("es-UY")} safe30d=$${canonical.safeCash30d.UYU.toLocaleString("es-UY")}`
  );
  console.log(
    `  USD availableCash=U$S${canonical.availableCash.USD.toLocaleString("es-UY")} safe30d=U$S${canonical.safeCash30d.USD.toLocaleString("es-UY")}`
  );
  console.log("\nChecks:");
  for (const r of rows) {
    console.log(
      `  [${r.status}] ${r.check_id} ${r.metric} ${r.currency}: Hoy=${r.hoy} Dashboard=${r.dashboard} Canon=${r.canonical}`
    );
  }
  console.log(`\n📄 ${OUTPUT}`);

  const fails = rows.filter((r) => r.status === "FAIL");
  if (fails.length > 0) {
    console.error(`\n❌ Gate FAIL — ${fails.length} diferencia(s)`);
    process.exit(1);
  }
  console.log("\n✅ Gate PASS — Hoy y Dashboard alineados con Tesorería.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
