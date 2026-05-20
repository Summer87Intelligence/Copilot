#!/usr/bin/env node
/**
 * ZETA-08 Linking audit — read-only.
 *
 * Para cada cuota huérfana intenta matchear contra proto_invoices por:
 *   1. zeta_comprobante_identity_v1.registro_id
 *   2. zeta_customer_voucher_v1.zeta_registro_id
 *   3. zeta_customer_voucher_v1.raw_payload.RegistroId
 *
 * Imprime:
 *   - totales: total / linked / orphan
 *   - cuántas matchean por cada path
 *   - cuántas quedan sin match
 *   - 10 ejemplos de orphans con candidatos posibles
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/audit-installment-linking.mjs
 *   node --env-file=.env.local --import tsx scripts/audit-installment-linking.mjs --workspace <UUID>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

const PAGE = 1000;

async function fetchAll(table, buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

/**
 * Extrae todos los registro_ids conocidos de un objeto zeta_metadata.
 */
function extractRegistroIds(zeta_metadata) {
  if (!zeta_metadata || typeof zeta_metadata !== "object") return [];
  const ids = new Set();

  const identity = zeta_metadata.zeta_comprobante_identity_v1;
  if (identity?.registro_id) ids.add(String(identity.registro_id).trim());

  const v1 = zeta_metadata.zeta_customer_voucher_v1;
  if (v1) {
    if (v1.zeta_registro_id) ids.add(String(v1.zeta_registro_id).trim());
    const rp = v1.raw_payload;
    if (rp?.RegistroId) ids.add(String(rp.RegistroId).trim());
    if (rp?.registroId) ids.add(String(rp.registroId).trim());
  }

  return [...ids].filter(Boolean);
}

async function main() {
  console.log("=== ZETA-08 Installment Linking Audit ===");
  console.log({ workspaceId, now: new Date().toISOString() });
  console.log();

  // 1. Cargar todas las cuotas
  console.log("Cargando proto_invoice_installments...");
  let installments;
  try {
    installments = await fetchAll("proto_invoice_installments", (from, to) =>
      supabase
        .from("proto_invoice_installments")
        .select("id, invoice_id, zeta_registro_id, cuota_numero, cuota_saldo, cliente_codigo, cuota_vencimiento")
        .eq("workspace_company_id", workspaceId)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    console.error("Error al cargar cuotas:", e.message);
    process.exit(1);
  }

  const total = installments.length;
  const linked = installments.filter((r) => r.invoice_id).length;
  const orphans = installments.filter((r) => !r.invoice_id);
  const orphanCount = orphans.length;

  console.log("--- Totales cuotas ---");
  console.log({ total, linked, orphan: orphanCount });
  console.log();

  if (orphanCount === 0) {
    console.log("No hay cuotas huérfanas. Linking completo.");
    return;
  }

  // 2. Cargar facturas con zeta_metadata para el workspace
  console.log("Cargando proto_invoices con zeta_metadata...");
  let invoices;
  try {
    invoices = await fetchAll("proto_invoices", (from, to) =>
      supabase
        .from("proto_invoices")
        .select("id, invoice_number, zeta_metadata, company_id")
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .like("invoice_number", "ZETA:CCV1:%")
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    console.error("Error al cargar facturas:", e.message);
    process.exit(1);
  }

  console.log(`  Facturas CCV1 activas cargadas: ${invoices.length}`);
  console.log();

  // 3. Construir mapa rid → invoice_id
  const ridToInvoiceId = new Map();
  for (const inv of invoices) {
    const rids = extractRegistroIds(inv.zeta_metadata);
    for (const rid of rids) {
      if (!ridToInvoiceId.has(rid)) ridToInvoiceId.set(rid, inv.id);
    }
  }

  // 4. Intentar match por path
  let matchByPath1 = 0; // zeta_comprobante_identity_v1.registro_id
  let matchByPath2 = 0; // zeta_customer_voucher_v1.zeta_registro_id
  let matchByPath3 = 0; // raw_payload.RegistroId
  let noMatch = 0;

  const orphanExamples = [];

  for (const orphan of orphans) {
    const rid = orphan.zeta_registro_id ? String(orphan.zeta_registro_id) : null;
    if (!rid) {
      noMatch++;
      continue;
    }

    const matchedInvoice = ridToInvoiceId.get(rid);

    // Determinar por qué path matchearía
    let matchedPath = null;
    for (const inv of invoices) {
      if (inv.id !== matchedInvoice) continue;
      const zm = inv.zeta_metadata;
      if (!zm) break;
      if (zm.zeta_comprobante_identity_v1?.registro_id === rid) {
        matchedPath = "path1:zeta_comprobante_identity_v1.registro_id";
        matchByPath1++;
        break;
      }
      if (zm.zeta_customer_voucher_v1?.zeta_registro_id === rid) {
        matchedPath = "path2:zeta_customer_voucher_v1.zeta_registro_id";
        matchByPath2++;
        break;
      }
      if (
        String(zm.zeta_customer_voucher_v1?.raw_payload?.RegistroId ?? "") === rid ||
        String(zm.zeta_customer_voucher_v1?.raw_payload?.registroId ?? "") === rid
      ) {
        matchedPath = "path3:raw_payload.RegistroId";
        matchByPath3++;
        break;
      }
      break;
    }

    if (!matchedInvoice) {
      noMatch++;
      if (orphanExamples.length < 10) {
        // Buscar facturas candidatas por registro_id cercano (no exacto)
        orphanExamples.push({
          id: orphan.id,
          zeta_registro_id: rid,
          cuota_numero: orphan.cuota_numero,
          cuota_saldo: orphan.cuota_saldo,
          cuota_vencimiento: orphan.cuota_vencimiento,
          cliente_codigo: orphan.cliente_codigo,
          candidate_invoice_ids: null,
          note: "Sin factura CCV1 activa con este registro_id en zeta_metadata",
        });
      }
    }
  }

  // Totales de matching
  const totalMatchable = matchByPath1 + matchByPath2 + matchByPath3;
  console.log("--- Análisis de matching (orphans) ---");
  console.log({
    orphan_total: orphanCount,
    matcheable_por_path1_identity: matchByPath1,
    matcheable_por_path2_voucher_v1: matchByPath2,
    matcheable_por_path3_raw_payload: matchByPath3,
    total_matcheable: totalMatchable,
    sin_match: noMatch,
    sin_match_pct: orphanCount > 0 ? ((noMatch / orphanCount) * 100).toFixed(1) + "%" : "N/A",
  });
  console.log();

  if (orphanExamples.length > 0) {
    console.log(`--- ${orphanExamples.length} ejemplos de orphans sin match ---`);
    for (const ex of orphanExamples) {
      console.log(JSON.stringify(ex, null, 2));
    }
  }

  // 5. Diagnóstico adicional: ¿hay invoices sin ningún registro_id en metadata?
  const invSinRegistroId = invoices.filter((inv) => extractRegistroIds(inv.zeta_metadata).length === 0);
  console.log();
  console.log("--- Facturas CCV1 activas sin registro_id en zeta_metadata ---");
  console.log({
    total_invoices_ccv1: invoices.length,
    sin_registro_id_en_metadata: invSinRegistroId.length,
    pct: invoices.length > 0
      ? ((invSinRegistroId.length / invoices.length) * 100).toFixed(1) + "%"
      : "N/A",
    hint: invSinRegistroId.length > 0
      ? "Estas facturas no podrán linkearse por registro_id. Verificar pipeline de vouchers."
      : "OK",
  });

  if (invSinRegistroId.length > 0 && invSinRegistroId.length <= 5) {
    console.log("  Ejemplos:", invSinRegistroId.slice(0, 5).map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      metadata_keys: i.zeta_metadata ? Object.keys(i.zeta_metadata) : [],
    })));
  }

  console.log();
  console.log("--- Conclusión ---");
  if (totalMatchable === orphanCount) {
    console.log(`✓ Todos los ${orphanCount} orphans son matcheables. Correr backfill-installment-linking.mjs para aplicar.`);
  } else if (totalMatchable > 0) {
    console.log(`Parcialmente matcheable: ${totalMatchable}/${orphanCount} cuotas pueden linkearse.`);
    console.log(`${noMatch} cuotas sin factura correspondiente (pueden ser facturas no sincronizadas aún).`);
  } else {
    console.log(`ALERTA: 0/${orphanCount} orphans matcheables. Revisar si zeta_metadata tiene registro_id persistido.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
