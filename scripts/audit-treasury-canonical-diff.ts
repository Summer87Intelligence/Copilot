#!/usr/bin/env node
/**
 * Diff read-only Antes/Después de la migración canónica de Tesorería (FASE-4).
 *
 * Compara la proyección de caja calculada:
 *   A) leyendo el banco por el repositorio legacy directo (ANTES);
 *   B) leyendo el banco por el punto único de transición (DESPUÉS).
 * Debe ser idéntica (solo cambia el origen, no el resultado).
 *
 * También reporta el aporte del banco al cashflow (esperado 0 si la fila legacy
 * está en estado `ignored`) para confirmar la separación Banco ≠ Caja.
 *
 * 100% read-only. No escribe, no migra, no ejecuta DML. No imprime datos sensibles.
 *
 * Uso: npx tsx scripts/audit-treasury-canonical-diff.ts [--workspace <uuid>]
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { bankReconciliationMovementRepositoryList } from "@/lib/treasury/repositories/bank-reconciliation-movement-repository";
import { manualCashMovementRepositoryList } from "@/lib/treasury/repositories/manual-cash-movement-repository";
import { plannedCashObligationRepositoryList } from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import { loadTreasuryCashflowBankMovements } from "@/lib/treasury/canonical/treasury-bank-source";
import {
  buildTreasuryProjection,
  deriveOpeningBalancesFromManualCash,
} from "@/lib/treasury/treasury-cash-projection";
import { getBankReconciliationSummary } from "@/lib/treasury/treasury-projection";

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

const args = process.argv.slice(2);
const wsIdx = args.indexOf("--workspace");
const workspaceArg = wsIdx >= 0 ? args[wsIdx + 1] : process.env.AUDIT_WORKSPACE_ID;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const ASOF = new Date().toISOString().slice(0, 10);

async function main() {
  const ws = workspaceArg ?? "040321ff-10fd-4da3-aeca-f1865f879986";

  const [manual, obligations, legacyDirect, adapter] = await Promise.all([
    manualCashMovementRepositoryList(sb, ws, {}, 1000),
    plannedCashObligationRepositoryList(sb, ws, {}, 1000),
    bankReconciliationMovementRepositoryList(sb, ws, {}, 1000),
    loadTreasuryCashflowBankMovements(sb, ws, 1000),
  ]);

  if (manual.error || obligations.error || legacyDirect.error || adapter.error) {
    console.error("[ERROR] carga de datos", { manual: manual.error, obligations: obligations.error, legacy: legacyDirect.error, adapter: adapter.error });
    process.exit(1);
  }

  const opening = deriveOpeningBalancesFromManualCash(manual.rows);

  const projA = buildTreasuryProjection({
    asOfDate: ASOF, horizonDays: 30, openingBalances: opening,
    manualMovements: manual.rows, bankMovements: legacyDirect.rows, obligations: obligations.rows,
  });
  const projB = buildTreasuryProjection({
    asOfDate: ASOF, horizonDays: 30, openingBalances: opening,
    manualMovements: manual.rows, bankMovements: adapter.rows, obligations: obligations.rows,
  });

  console.log("═══ Treasury canonical diff (read-only) ═══");
  console.log(`workspace: ${ws}   asOf: ${ASOF}`);
  console.log(`rows: legacy(direct)=${legacyDirect.rows.length} adapter=${adapter.rows.length} manual=${manual.rows.length} obligations=${obligations.rows.length}`);

  const last = (p: typeof projA) => p.snapshots[p.snapshots.length - 1]!;
  const a = last(projA);
  const b = last(projB);
  console.log("── Saldo final proyectado (30d) por moneda ──");
  console.log(`  ANTES  UYU=${a.projectedCashUyu.toFixed(2)} USD=${a.projectedCashUsd.toFixed(2)} runway=${projA.runwayDays} risk=${projA.riskLevel}`);
  console.log(`  DESPUÉS UYU=${b.projectedCashUyu.toFixed(2)} USD=${b.projectedCashUsd.toFixed(2)} runway=${projB.runwayDays} risk=${projB.riskLevel}`);

  const identical = JSON.stringify(projA.snapshots) === JSON.stringify(projB.snapshots) &&
    projA.runwayDays === projB.runwayDays && projA.riskLevel === projB.riskLevel;

  const bankSummary = getBankReconciliationSummary(adapter.rows, manual.rows);
  console.log("── Aporte del banco al cashflow (Banco ≠ Caja) ──");
  console.log(`  ${JSON.stringify(bankSummary)}`);

  const classification = identical ? "NO_DIFFERENCE" : "IMPLEMENTATION_DEFECT";
  console.log("");
  console.log(`OVERALL: ${classification}`);
  if (classification === "IMPLEMENTATION_DEFECT") process.exit(2);
}

main().catch((e) => {
  console.error("[ERROR]", e instanceof Error ? e.message : e);
  process.exit(1);
});
