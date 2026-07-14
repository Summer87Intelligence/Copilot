#!/usr/bin/env node
/**
 * Diff real read-only entre las fuentes bancarias y la capa canónica (FASE-3).
 *
 * Compara, por moneda:
 *   - bank_movements (fuente canónica)
 *   - bank_reconciliation_movements (legacy)
 *   - canonical operational (>= BANK_OPERATIONAL_START_DATE)
 *   - canonical historical (< corte)
 * y clasifica la diferencia. NO imprime datos sensibles (descripciones, cuentas,
 * referencias). 100% read-only: no escribe, no migra, no ejecuta DML.
 *
 * Uso:
 *   npx tsx scripts/audit-canonical-bank-diff.ts
 *   npx tsx scripts/audit-canonical-bank-diff.ts --workspace <uuid>
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import type { BankReconciliationMovement } from "@/lib/treasury/treasury-types";
import {
  BANK_OPERATIONAL_START_DATE,
  buildCanonicalBankSnapshot,
  detectCrossSourceDuplicates,
  toCanonicalFromBankMovement,
  toCanonicalFromLegacy,
} from "@/lib/bank/canonical";
import { mapBankReconciliationMovementRow } from "@/lib/treasury/treasury-mappers";

// ── Env ─────────────────────────────────────────────────────────────────────
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
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const workspaceArg = getArg("--workspace") ?? process.env.AUDIT_WORKSPACE_ID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceKey) {
  console.error("[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

type DiffClass =
  | "NO_DIFFERENCE"
  | "EXPECTED_HISTORICAL_EXCLUSION"
  | "EXPECTED_LEGACY_DIFFERENCE"
  | "DATA_QUALITY"
  | "DUPLICATE_RISK"
  | "IMPLEMENTATION_DEFECT";

async function main(): Promise<void> {
  let bmQuery = sb.from("bank_movements").select("*");
  let legacyQuery = sb.from("bank_reconciliation_movements").select("*");
  if (workspaceArg) {
    bmQuery = bmQuery.eq("workspace_id", workspaceArg);
    legacyQuery = legacyQuery.eq("workspace_id", workspaceArg);
  }

  const [{ data: bmRows, error: bmErr }, { data: legacyRows, error: legacyErr }] = await Promise.all([
    bmQuery.limit(20000),
    legacyQuery.limit(20000),
  ]);
  if (bmErr) throw new Error(`bank_movements: ${bmErr.message}`);
  if (legacyErr) throw new Error(`bank_reconciliation_movements: ${legacyErr.message}`);

  const canonicalMovements = (bmRows ?? []).map(
    (r) => toCanonicalFromBankMovement(r as BankMovement).movement
  );
  const legacyMovements = (legacyRows ?? []).map((r) =>
    toCanonicalFromLegacy(mapBankReconciliationMovementRow(r as Record<string, unknown>) as BankReconciliationMovement).movement
  );

  const all = [...canonicalMovements, ...legacyMovements];
  const snapshot = buildCanonicalBankSnapshot({ movements: all });
  const dups = detectCrossSourceDuplicates(all);

  console.log("═══ Canonical bank diff (read-only) ═══");
  console.log(`workspace: ${workspaceArg ?? "ALL"}`);
  console.log(`cutoff (BANK_OPERATIONAL_START_DATE): ${BANK_OPERATIONAL_START_DATE}`);
  console.log(`rows: bank_movements=${canonicalMovements.length} legacy=${legacyMovements.length}`);
  console.log("");

  let worst: DiffClass = "NO_DIFFERENCE";
  const rank: Record<DiffClass, number> = {
    NO_DIFFERENCE: 0,
    EXPECTED_HISTORICAL_EXCLUSION: 1,
    EXPECTED_LEGACY_DIFFERENCE: 1,
    DATA_QUALITY: 2,
    DUPLICATE_RISK: 3,
    IMPLEMENTATION_DEFECT: 4,
  };
  const bump = (c: DiffClass) => {
    if (rank[c] > rank[worst]) worst = c;
  };

  for (const block of snapshot.byCurrency) {
    console.log(`── ${block.currency} ──`);
    console.log(
      `  operational: count=${block.operational.movementCount} in=${block.operational.inflows.toFixed(2)} out=${block.operational.outflows.toFixed(2)} net=${block.operational.net.toFixed(2)} reconciled=${block.operational.reconciledCount} pending=${block.operational.pendingCount}`
    );
    console.log(
      `  historical:  count=${block.historical.movementCount} in=${block.historical.inflows.toFixed(2)} out=${block.historical.outflows.toFixed(2)} net=${block.historical.net.toFixed(2)}`
    );
    let cls: DiffClass = "NO_DIFFERENCE";
    if (block.historical.movementCount > 0) cls = "EXPECTED_HISTORICAL_EXCLUSION";
    console.log(`  classification: ${cls}`);
    bump(cls);
  }

  const dq = snapshot.diagnostics.filter(
    (d) => d.code !== "probable_cross_source_duplicate"
  );
  console.log("");
  console.log(`diagnostics (data quality): ${dq.length}`);
  const byCode = new Map<string, number>();
  for (const d of snapshot.diagnostics) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
  for (const [code, n] of byCode) console.log(`  ${code}: ${n}`);
  if (dq.length > 0) bump("DATA_QUALITY");

  console.log("");
  console.log(`cross-source potential duplicates: ${dups.length}`);
  if (dups.length > 0) {
    bump("DUPLICATE_RISK");
    for (const d of dups.slice(0, 20)) {
      console.log(`  ${d.confidence}: ${d.canonical.canonicalId} ~ ${d.legacy.canonicalId}`);
    }
  }
  if (legacyMovements.length > 0) bump("EXPECTED_LEGACY_DIFFERENCE");

  console.log("");
  console.log(`OVERALL: ${worst}`);
  if ((worst as DiffClass) === "IMPLEMENTATION_DEFECT") process.exit(2);
}

main().catch((err) => {
  console.error("[ERROR]", err instanceof Error ? err.message : err);
  process.exit(1);
});
