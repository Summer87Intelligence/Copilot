/**
 * Limpieza de datos financieros pre-2026.
 *
 * Elimina de Supabase todos los registros financieros anteriores a 2026-01-01:
 *   - proto_invoices  donde issue_date  < 2026-01-01
 *   - proto_receipts  donde receipt_date < 2026-01-01
 *
 * NO toca: companies, auth, configuraciones, usuarios, obligaciones fiscales,
 *          audit logs, raw imports, ni datos 2026+.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.json scripts/remove-pre-2026-financial-data.ts
 *   npx tsx --tsconfig tsconfig.json scripts/remove-pre-2026-financial-data.ts --execute
 *   npx tsx --tsconfig tsconfig.json scripts/remove-pre-2026-financial-data.ts --execute --workspace-id <uuid>
 *
 * Flags:
 *   (ninguno)          Dry-run: muestra impacto SIN borrar nada
 *   --execute          Ejecuta el borrado real (requiere confirmación de que leíste el dry-run)
 *   --workspace-id X   Limita al workspace indicado (default: COPILOT_SERVICE_ROLE_WORKSPACE_ID)
 */

import { createClient } from "@supabase/supabase-js";

const CUTOFF_DATE = "2026-01-01";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const WORKSPACE_ID = (() => {
  const idx = args.indexOf("--workspace-id");
  return idx >= 0
    ? (args[idx + 1] ?? "")
    : (process.env.COPILOT_SERVICE_ROLE_WORKSPACE_ID ?? "040321ff-10fd-4da3-aeca-f1865f879986");
})();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

interface CountResult {
  table: string;
  dateColumn: string;
  count: number;
  minDate: string | null;
  maxDate: string | null;
  currencySplit?: Record<string, number>;
}

async function countPreOperational(): Promise<CountResult[]> {
  const results: CountResult[] = [];
  const wid = WORKSPACE_ID.trim();

  // --- proto_invoices ---
  {
    let q = supabase
      .from("proto_invoices")
      .select("issue_date, currency_code")
      .lt("issue_date", CUTOFF_DATE);
    if (wid) q = q.eq("workspace_company_id", wid);
    const { data, error } = await q;
    if (error) throw new Error(`proto_invoices count error: ${error.message}`);
    const rows = (data ?? []) as { issue_date?: string; currency_code?: string }[];
    const minDate = rows.reduce<string | null>((m, r) => {
      const d = r.issue_date ?? "";
      return !m || d < m ? d : m;
    }, null);
    const maxDate = rows.reduce<string | null>((m, r) => {
      const d = r.issue_date ?? "";
      return !m || d > m ? d : m;
    }, null);
    const currencySplit: Record<string, number> = {};
    for (const r of rows) {
      const code = r.currency_code ?? "unknown";
      currencySplit[code] = (currencySplit[code] ?? 0) + 1;
    }
    results.push({
      table: "proto_invoices",
      dateColumn: "issue_date",
      count: rows.length,
      minDate,
      maxDate,
      currencySplit,
    });
  }

  // --- proto_receipts ---
  {
    let q = supabase
      .from("proto_receipts")
      .select("receipt_date, currency_code")
      .lt("receipt_date", CUTOFF_DATE);
    if (wid) q = q.eq("workspace_company_id", wid);
    const { data, error } = await q;
    if (error) throw new Error(`proto_receipts count error: ${error.message}`);
    const rows = (data ?? []) as { receipt_date?: string; currency_code?: string }[];
    const minDate = rows.reduce<string | null>((m, r) => {
      const d = r.receipt_date ?? "";
      return !m || d < m ? d : m;
    }, null);
    const maxDate = rows.reduce<string | null>((m, r) => {
      const d = r.receipt_date ?? "";
      return !m || d > m ? d : m;
    }, null);
    const currencySplit: Record<string, number> = {};
    for (const r of rows) {
      const code = r.currency_code ?? "unknown";
      currencySplit[code] = (currencySplit[code] ?? 0) + 1;
    }
    results.push({
      table: "proto_receipts",
      dateColumn: "receipt_date",
      count: rows.length,
      minDate,
      maxDate,
      currencySplit,
    });
  }

  return results;
}

async function deletePreOperational(table: "proto_invoices" | "proto_receipts", dateColumn: string): Promise<number> {
  const wid = WORKSPACE_ID.trim();
  let q = supabase.from(table).delete().lt(dateColumn, CUTOFF_DATE);
  if (wid) q = (q as any).eq("workspace_company_id", wid);

  // Supabase delete necesita .select() para obtener count
  const { data, error } = await (q as any).select("id");
  if (error) throw new Error(`Delete ${table} error: ${error.message}`);
  return (data ?? []).length;
}

function printImpactReport(results: CountResult[]): void {
  const total = results.reduce((s, r) => s + r.count, 0);
  console.log("\n════════════════════════════════════════");
  console.log("  IMPACTO PRE-2026 — COPILOT CLEANUP");
  console.log("════════════════════════════════════════");
  console.log(`  Workspace:  ${WORKSPACE_ID}`);
  console.log(`  Cutoff:     < ${CUTOFF_DATE}`);
  console.log(`  Total rows: ${total}`);
  console.log("────────────────────────────────────────");

  for (const r of results) {
    console.log(`\n  Tabla: ${r.table}`);
    console.log(`    Columna fecha : ${r.dateColumn}`);
    console.log(`    Registros     : ${r.count}`);
    if (r.count > 0) {
      console.log(`    Rango         : ${r.minDate} → ${r.maxDate}`);
      if (r.currencySplit && Object.keys(r.currencySplit).length > 0) {
        const split = Object.entries(r.currencySplit)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        console.log(`    Por moneda    : ${split}`);
      }
    } else {
      console.log(`    (Sin datos pre-2026)`);
    }
  }

  console.log("\n════════════════════════════════════════");

  if (total === 0) {
    console.log("  OK: No hay datos pre-2026. Nada que limpiar.");
  } else if (!EXECUTE) {
    console.log(`  DRY-RUN: Se eliminarían ${total} registros.`);
    console.log("  Para ejecutar: agregar --execute");
  }
  console.log("════════════════════════════════════════\n");
}

async function main(): Promise<void> {
  console.log(`\n[remove-pre-2026] Modo: ${EXECUTE ? "EJECUTAR" : "DRY-RUN"}`);
  console.log(`[remove-pre-2026] Workspace: ${WORKSPACE_ID}`);
  console.log(`[remove-pre-2026] Cutoff: < ${CUTOFF_DATE}\n`);

  // Fase 1 — Auditoría (siempre)
  console.log("Calculando impacto...");
  const results = await countPreOperational();
  printImpactReport(results);

  const total = results.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    console.log("[remove-pre-2026] Nada que limpiar. Saliendo.");
    return;
  }

  if (!EXECUTE) {
    console.log("[remove-pre-2026] Dry-run completado. Sin cambios en BD.");
    return;
  }

  // Fase 2 — Ejecución real
  console.log("[remove-pre-2026] === INICIANDO BORRADO ===\n");

  const deletionLog: { table: string; deleted: number }[] = [];

  for (const r of results) {
    if (r.count === 0) {
      console.log(`  SKIP ${r.table}: sin registros pre-2026`);
      deletionLog.push({ table: r.table, deleted: 0 });
      continue;
    }
    console.log(`  DELETE ${r.table} (${r.count} registros esperados)...`);
    try {
      const deleted = await deletePreOperational(
        r.table as "proto_invoices" | "proto_receipts",
        r.dateColumn
      );
      console.log(`  OK ${r.table}: ${deleted} registros eliminados`);
      deletionLog.push({ table: r.table, deleted });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ERROR ${r.table}: ${msg}`);
      deletionLog.push({ table: r.table, deleted: -1 });
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("  RESULTADO DEL BORRADO");
  console.log("════════════════════════════════════════");
  let allOk = true;
  for (const entry of deletionLog) {
    const status = entry.deleted < 0 ? "ERROR" : "OK";
    if (entry.deleted < 0) allOk = false;
    console.log(`  ${status}  ${entry.table}: ${entry.deleted >= 0 ? entry.deleted : "ERROR"} eliminados`);
  }
  console.log("════════════════════════════════════════\n");

  if (allOk) {
    console.log("[remove-pre-2026] Limpieza completada exitosamente.");
  } else {
    console.error("[remove-pre-2026] Hubo errores. Revisar logs.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[remove-pre-2026] Error fatal:", e);
  process.exit(1);
});
