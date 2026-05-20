#!/usr/bin/env node
/**
 * ZETA-08 Backfill — reconciliación de cuotas huérfanas.
 *
 * Re-intenta el linkage invoice_id para proto_invoice_installments donde
 * invoice_id IS NULL, usando los mismos paths de registro_id que el pipeline.
 *
 * Seguridad:
 *  - Read-only en dry-run (default).
 *  - Multi-tenant: sólo toca el workspace especificado.
 *  - Nunca re-linkea si ya tiene invoice_id.
 *  - Nunca crea facturas ni modifica balance_amount.
 *  - Idempotente: correr dos veces produce el mismo resultado.
 *  - Clasifica orphans irresolubles para diagnóstico.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-installment-linking.mjs
 *   node --env-file=.env.local --import tsx scripts/backfill-installment-linking.mjs --execute
 *   node --env-file=.env.local --import tsx scripts/backfill-installment-linking.mjs --execute --workspace <UUID>
 *   node --env-file=.env.local --import tsx scripts/backfill-installment-linking.mjs --execute --batch-size 50
 *
 * Flags:
 *   --execute            Aplica updates en DB. Sin este flag es dry-run.
 *   --workspace <UUID>   Filtra por workspace. Default: WORKSPACE_COMPANY_ID.
 *   --batch-size <N>     Tamaño de batch para queries de match. Default: 100.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── Env ──────────────────────────────────────────────────────────────────────

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
  return i >= 0 ? args[i + 1] ?? null : null;
}

const DRY_RUN = !args.includes("--execute");
const BATCH_SIZE = Math.max(1, parseInt(argFlag("--batch-size") ?? "100", 10));
const PAGE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Paths en el mismo orden que el pipeline.
 * El filtro PostgREST funciona correctamente para todos;
 * la extracción se hace desde zeta_metadata completo (no del select del path).
 */
const PATHS = [
  "zeta_metadata->zeta_comprobante_identity_v1->>registro_id",
  "zeta_metadata->zeta_customer_voucher_v1->>zeta_registro_id",
  "zeta_metadata->zeta_customer_voucher_v1->raw_payload->>RegistroId",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAll(label, buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function extractRegistroIds(zetaMeta) {
  if (!zetaMeta || typeof zetaMeta !== "object") return [];
  const out = new Set();

  const id1 = zetaMeta?.zeta_comprobante_identity_v1?.registro_id;
  if (id1) out.add(String(id1).trim());

  const v1 = zetaMeta?.zeta_customer_voucher_v1;
  if (v1?.zeta_registro_id) out.add(String(v1.zeta_registro_id).trim());
  const raw = v1?.raw_payload;
  if (raw?.RegistroId) out.add(String(raw.RegistroId).trim());
  if (raw?.registroId) out.add(String(raw.registroId).trim());

  return [...out].filter(Boolean);
}

/**
 * Clasifica un orphan para diagnóstico cuando no hay match.
 *
 * orphan_reason:
 *  "timing_gap"    — zeta_registro_id vacío o "0" (nunca hubo ID)
 *  "no_invoice"    — registro_id presente pero sin factura correspondiente
 *
 * Si en el futuro queremos más granularidad (pre_operational, inactive_invoice, etc.)
 * se puede extender esta función sin cambiar el schema.
 */
function classifyOrphan(row) {
  const rid = row.zeta_registro_id;
  if (!rid || String(rid).trim() === "0") return "timing_gap";
  return "no_invoice";
}

// ── Core: batch link attempt ──────────────────────────────────────────────────

/**
 * Intenta resolver invoice_id para un batch de rids.
 * Itera paths en orden, selecciona zeta_metadata completo y extrae localmente.
 * Retorna Map rid → invoice_id | null.
 *
 * Mismo algoritmo que el fix en zeta-installments-link.ts (fuente de verdad).
 */
async function resolveBatch(rids) {
  const out = new Map();
  for (const r of rids) out.set(r, null);

  const pending = new Set(rids);

  for (const path of PATHS) {
    if (pending.size === 0) break;
    const ridsArr = Array.from(pending);
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("id, zeta_metadata")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .like("invoice_number", "ZETA:CCV1:%")
      .filter(path, "in", `(${ridsArr.map((r) => `"${r}"`).join(",")})`)
      .limit(ridsArr.length);

    if (error) {
      console.warn(`  WARN path ${path}: ${error.message}`);
      continue;
    }

    for (const row of data ?? []) {
      if (typeof row.id !== "string") continue;
      const ridsInMeta = extractRegistroIds(row.zeta_metadata);
      for (const rid of ridsInMeta) {
        if (pending.has(rid)) {
          out.set(rid, row.id);
          pending.delete(rid);
        }
      }
    }
  }

  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ZETA-08 Backfill Installment Linking");
  console.log("═══════════════════════════════════════════════════════════");
  console.log({ mode: DRY_RUN ? "DRY-RUN (no changes)" : "EXECUTE", workspaceId, batchSize: BATCH_SIZE, startedAt });
  console.log();

  if (DRY_RUN) {
    console.log("  ⚠ Modo DRY-RUN activo. No se harán cambios en DB.");
    console.log("  Para aplicar: --execute");
    console.log();
  }

  // 1. Cargar orphans
  console.log("Cargando cuotas huérfanas (invoice_id IS NULL)...");
  let orphans;
  try {
    orphans = await fetchAll("proto_invoice_installments", (from, to) =>
      supabase
        .from("proto_invoice_installments")
        .select("id, zeta_registro_id, cuota_numero, cuota_saldo, cuota_vencimiento, cliente_codigo")
        .eq("workspace_company_id", workspaceId)
        .is("invoice_id", null)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    console.error("Error al cargar orphans:", e.message);
    process.exit(1);
  }

  if (orphans.length === 0) {
    console.log("✓ No hay cuotas huérfanas. Nada que hacer.");
    return;
  }

  console.log(`  Orphans encontrados: ${orphans.length}`);
  console.log();

  // 2. Deduplicar por registro_id
  const ridToOrphanIds = new Map();
  const orphansWithoutRid = [];

  for (const row of orphans) {
    const rid = row.zeta_registro_id ? String(row.zeta_registro_id).trim() : null;
    if (!rid || rid === "0") {
      orphansWithoutRid.push(row);
      continue;
    }
    const list = ridToOrphanIds.get(rid) ?? [];
    list.push(row.id);
    ridToOrphanIds.set(rid, list);
  }

  const uniqueRids = Array.from(ridToOrphanIds.keys());

  console.log(`  Con zeta_registro_id: ${uniqueRids.length} rids únicos (${orphans.length - orphansWithoutRid.length} cuotas)`);
  console.log(`  Sin zeta_registro_id: ${orphansWithoutRid.length} cuota(s) — timing_gap, skip`);
  console.log();

  // 3. Resolver en batches
  console.log(`Resolviendo en batches de ${BATCH_SIZE}...`);
  const resolved = new Map(); // rid → invoice_id

  for (let i = 0; i < uniqueRids.length; i += BATCH_SIZE) {
    const batch = uniqueRids.slice(i, i + BATCH_SIZE);
    const batchResult = await resolveBatch(batch);
    for (const [rid, invId] of batchResult) {
      resolved.set(rid, invId);
    }
    const matchedInBatch = Array.from(batchResult.values()).filter(Boolean).length;
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rids → ${matchedInBatch} matched`);
  }

  // 4. Clasificar resultados
  const toLink = []; // { rowIds: string[], rid, invoiceId }
  const unresolvable = []; // { rowIds, rid, reason }

  for (const [rid, invoiceId] of resolved) {
    const rowIds = ridToOrphanIds.get(rid) ?? [];
    if (invoiceId) {
      toLink.push({ rid, invoiceId, rowIds });
    } else {
      unresolvable.push({ rid, rowIds, reason: classifyOrphan({ zeta_registro_id: rid }) });
    }
  }

  const totalToLink = toLink.reduce((s, x) => s + x.rowIds.length, 0);
  const totalUnresolvable = unresolvable.reduce((s, x) => s + x.rowIds.length, 0);
  const totalTimingGap = orphansWithoutRid.length;

  console.log();
  console.log("── Resultados del matching ──────────────────────────────");
  console.log({ total_orphans: orphans.length, can_link: totalToLink, timing_gap: totalTimingGap, no_invoice: totalUnresolvable });
  console.log();

  if (toLink.length === 0) {
    console.log("⚠ No se encontraron matches. Sin cambios que aplicar.");
  } else {
    console.log(`  Cuotas a linkear: ${totalToLink}`);
    if (toLink.length <= 10) {
      for (const entry of toLink) {
        console.log(`    rid=${entry.rid} → invoice_id=${entry.invoiceId} (${entry.rowIds.length} cuota(s))`);
      }
    }
  }

  if (unresolvable.length > 0) {
    console.log();
    console.log(`  Cuotas sin match (no_invoice): ${totalUnresolvable}`);
    if (unresolvable.length <= 10) {
      for (const entry of unresolvable) {
        console.log(`    rid=${entry.rid} — ${entry.rowIds.length} cuota(s) — reason=${entry.reason}`);
      }
    } else {
      console.log(`    (primeros 10 de ${unresolvable.length})`);
      for (const entry of unresolvable.slice(0, 10)) {
        console.log(`    rid=${entry.rid} — ${entry.rowIds.length} cuota(s)`);
      }
    }
    console.log();
    console.log("  Causas probables de 'no_invoice':");
    console.log("    1. Factura aún no sincronizada por voucher pipeline (se auto-sana en próximo cron).");
    console.log("    2. Factura fuera de COPILOT_OPERATIONAL_START_DATE (pre-2026).");
    console.log("    3. Factura soft-deleted (is_active=false).");
    console.log("    4. Factura con invoice_number sin prefijo ZETA:CCV1: (formato legacy).");
    console.log("  Acción: correr audit-installment-linking.mjs para clasificación detallada.");
  }

  // 5. Aplicar si --execute
  if (DRY_RUN) {
    console.log();
    console.log("── DRY-RUN: sin cambios aplicados ───────────────────────");
    console.log(`  Para linkear ${totalToLink} cuotas: correr con --execute`);
    return;
  }

  if (toLink.length === 0) {
    console.log();
    console.log("── Sin rows que actualizar. Terminado. ──");
    return;
  }

  // Actualizar en DB: invoice_id por row id
  console.log();
  console.log("── Aplicando links en DB ────────────────────────────────");
  let linked = 0;
  let errors = 0;

  for (const entry of toLink) {
    // Actualizar todas las cuotas de este rid (pueden ser múltiples cuotas del mismo comprobante)
    const { error } = await supabase
      .from("proto_invoice_installments")
      .update({ invoice_id: entry.invoiceId })
      .eq("workspace_company_id", workspaceId)
      .in("id", entry.rowIds)
      .is("invoice_id", null); // guard: sólo actualiza si sigue null (idempotente)

    if (error) {
      console.error(`  ERROR rid=${entry.rid}: ${error.message}`);
      errors += 1;
    } else {
      linked += entry.rowIds.length;
    }
  }

  console.log();
  console.log("── Resultado final ──────────────────────────────────────");
  console.log({
    cuotas_linkeadas: linked,
    errores: errors,
    timing_gap_skipped: totalTimingGap,
    no_invoice_skipped: totalUnresolvable,
    total_orphans_pre_backfill: orphans.length,
    orphans_remaining_estimate: totalTimingGap + totalUnresolvable,
  });
  console.log();

  if (linked > 0) {
    console.log(`✓ ${linked} cuota(s) linkeada(s) correctamente.`);
    console.log("  Verificar con: node --env-file=.env.local --import tsx scripts/audit-installment-aging-coverage.mjs");
  }

  if (totalTimingGap + totalUnresolvable > 0) {
    console.log(`  ${totalTimingGap + totalUnresolvable} cuota(s) siguen sin match:`);
    if (totalTimingGap > 0) console.log(`    • timing_gap (${totalTimingGap}): correr cron de vouchers y reintentar este script.`);
    if (totalUnresolvable > 0) console.log(`    • no_invoice (${totalUnresolvable}): revisar con audit-installment-linking.mjs.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
