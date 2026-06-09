/**
 * Auditoría READ-ONLY: Integridad del control contable de movimientos.
 *
 * Valida:
 *   - Movimientos con accounting_checked=true deben tener zetaAccountingEntryId
 *     o accounting_match_status='manually_confirmed'
 *   - Registros con accounting_match_status='matched' deben tener
 *     zetaAccountingEntryAmount != null
 *   - No deben existir registros huérfanos (movement_id sin manual_cash_movements)
 *   - Conteo de movimientos sin registro de reconciliación
 *   - Distribución de estados de coincidencia
 *
 * Usage:
 *   npm run audit:treasury-accounting-reconciliation
 *   # o directamente:
 *   node --env-file=.env.local --import tsx scripts/audit-treasury-accounting-reconciliation.ts
 *
 * Output: tmp/treasury-accounting-reconciliation.csv
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const WID =
  process.env.WORKSPACE_COMPANY_ID?.trim() ||
  process.env.AUDIT_WORKSPACE_ID?.trim() ||
  "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuditStatus = "OK" | "WARNING" | "BUG" | "NO_DATA" | "SKIP";

type AuditRow = {
  check_id: string;
  check: string;
  count: number | null;
  status: AuditStatus;
  notes: string;
};

function row(
  check_id: string,
  check: string,
  count: number | null,
  status: AuditStatus,
  notes: string
): AuditRow {
  return { check_id, check, count, status, notes };
}

function toCsv(rows: AuditRow[]): string {
  const header = "check_id,check,count,status,notes";
  const lines = rows.map((r) =>
    [
      r.check_id,
      `"${r.check.replace(/"/g, '""')}"`,
      r.count ?? "",
      r.status,
      `"${r.notes.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function runAudit(): Promise<AuditRow[]> {
  const results: AuditRow[] = [];

  // ── 1. checked=true sin entry ID ni manually_confirmed ──────────────────
  {
    let qb = db
      .from("treasury_movement_accounting_reconciliations")
      .select("id", { count: "exact", head: true })
      .eq("accounting_checked", true)
      .is("zeta_accounting_entry_id", null)
      .neq("accounting_match_status", "manually_confirmed");
    if (WID) qb = qb.eq("workspace_id", WID);
    const { count, error } = await qb;
    if (error) {
      results.push(row("tmac-1", "checked=true sin entry_id ni manually_confirmed", null, "BUG", `DB error: ${error.message}`));
    } else {
      const n = count ?? 0;
      results.push(row(
        "tmac-1",
        "checked=true sin entry_id ni manually_confirmed",
        n,
        n === 0 ? "OK" : "BUG",
        n === 0 ? "Ningún registro violó la regla de validación." : `${n} registros marcados como revisados sin entry Zeta ni confirmación manual.`
      ));
    }
  }

  // ── 2. status=matched sin entry amount ──────────────────────────────────
  {
    let qb = db
      .from("treasury_movement_accounting_reconciliations")
      .select("id", { count: "exact", head: true })
      .eq("accounting_match_status", "matched")
      .is("zeta_accounting_entry_amount", null);
    if (WID) qb = qb.eq("workspace_id", WID);
    const { count, error } = await qb;
    if (error) {
      results.push(row("tmac-2", "status=matched sin zeta_entry_amount", null, "BUG", `DB error: ${error.message}`));
    } else {
      const n = count ?? 0;
      results.push(row(
        "tmac-2",
        "status=matched sin zeta_entry_amount",
        n,
        n === 0 ? "OK" : "WARNING",
        n === 0 ? "Todos los matched tienen importe registrado." : `${n} registros matched sin importe del asiento Zeta.`
      ));
    }
  }

  // ── 3. Registros huérfanos (movement_id sin movimiento en manual_cash_movements) ──
  {
    const { data: reconciliations, error: errR } = await (() => {
      let q = db
        .from("treasury_movement_accounting_reconciliations")
        .select("movement_id, workspace_id");
      if (WID) q = q.eq("workspace_id", WID);
      return q.limit(2000);
    })();

    if (errR) {
      results.push(row("tmac-3", "Registros huérfanos (movement_id sin movimiento)", null, "BUG", `DB error: ${errR.message}`));
    } else {
      const recs = (reconciliations ?? []) as { movement_id: string; workspace_id: string }[];
      if (recs.length === 0) {
        results.push(row("tmac-3", "Registros huérfanos (movement_id sin movimiento)", 0, "NO_DATA", "Sin registros de reconciliación."));
      } else {
        const movIds = [...new Set(recs.map((r) => r.movement_id))];
        const { data: movements, error: errM } = await db
          .from("manual_cash_movements")
          .select("id")
          .in("id", movIds.slice(0, 500));
        if (errM) {
          results.push(row("tmac-3", "Registros huérfanos (movement_id sin movimiento)", null, "BUG", `DB error movements: ${errM.message}`));
        } else {
          const existingIds = new Set((movements ?? []).map((m: { id: string }) => m.id));
          const orphans = movIds.filter((id) => !existingIds.has(id));
          results.push(row(
            "tmac-3",
            "Registros huérfanos (movement_id sin movimiento)",
            orphans.length,
            orphans.length === 0 ? "OK" : "BUG",
            orphans.length === 0 ? "Sin huérfanos." : `${orphans.length} reconciliaciones sin movimiento padre. IDs: ${orphans.slice(0, 5).join(", ")}`
          ));
        }
      }
    }
  }

  // ── 4. Conteo de movimientos sin reconciliación ──────────────────────────
  {
    let qbMov = db
      .from("manual_cash_movements")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (WID) qbMov = qbMov.eq("workspace_id", WID);
    const { count: totalMov, error: errMov } = await qbMov;

    let qbRec = db
      .from("treasury_movement_accounting_reconciliations")
      .select("id", { count: "exact", head: true });
    if (WID) qbRec = qbRec.eq("workspace_id", WID);
    const { count: totalRec, error: errRec } = await qbRec;

    if (errMov || errRec) {
      results.push(row("tmac-4", "Movimientos sin registro de reconciliación", null, "BUG", `DB error.`));
    } else {
      const mov = totalMov ?? 0;
      const rec = totalRec ?? 0;
      const pending = Math.max(0, mov - rec);
      results.push(row(
        "tmac-4",
        "Movimientos sin registro de reconciliación",
        pending,
        "OK",
        `${mov} movimientos activos · ${rec} con registro TMAC · ${pending} sin registro (normal para nuevos movimientos).`
      ));
    }
  }

  // ── 5. Distribución de estados de coincidencia ───────────────────────────
  {
    let qb = db
      .from("treasury_movement_accounting_reconciliations")
      .select("accounting_match_status");
    if (WID) qb = qb.eq("workspace_id", WID);
    const { data, error } = await qb.limit(5000);

    if (error) {
      results.push(row("tmac-5", "Distribución de estados (pending)", null, "BUG", `DB error: ${error.message}`));
    } else {
      const rows2 = (data ?? []) as { accounting_match_status: string }[];
      const counts: Record<string, number> = {};
      for (const r of rows2) {
        const s = r.accounting_match_status ?? "unknown";
        counts[s] = (counts[s] ?? 0) + 1;
      }
      const summary = Object.entries(counts)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      results.push(row(
        "tmac-5",
        "Distribución de match_status",
        rows2.length,
        rows2.length === 0 ? "NO_DATA" : "OK",
        summary || "Sin registros."
      ));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔍  Auditando reconciliación contable de movimientos…\n");
  const rows = await runAudit();

  const tmpDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, "treasury-accounting-reconciliation.csv");
  fs.writeFileSync(outPath, toCsv(rows), "utf-8");

  let bugs = 0;
  let warnings = 0;
  let ok = 0;
  for (const r of rows) {
    const icon = r.status === "OK" ? "✅" : r.status === "WARNING" ? "⚠️ " : r.status === "NO_DATA" ? "⬜" : r.status === "SKIP" ? "⏭️ " : "❌";
    console.log(`${icon}  [${r.check_id}] ${r.check}: ${r.count ?? "—"}  — ${r.notes}`);
    if (r.status === "BUG") bugs++;
    else if (r.status === "WARNING") warnings++;
    else if (r.status === "OK") ok++;
  }

  console.log(`\n📄  CSV: ${outPath}`);
  console.log(`\n✅ OK: ${ok}  ⚠️  Warnings: ${warnings}  ❌ Bugs: ${bugs}`);
  if (bugs > 0) {
    console.error("\n❌  Audit falló con bugs críticos.");
    process.exit(1);
  }
  if (warnings > 0) {
    console.warn("\n⚠️   Audit completó con advertencias.");
    process.exit(0);
  }
  console.log("\n✅  Audit completó sin problemas.");
}

main().catch((err) => {
  console.error("❌  Error inesperado:", err);
  process.exit(1);
});
