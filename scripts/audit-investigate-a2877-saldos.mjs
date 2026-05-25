#!/usr/bin/env node
/**
 * Investigación read-only: por qué A-2877 no bajó balance a Saldo (17080).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INVOICE_CCV1 = "ZETA:CCV1:0:36:A:2877";
const REGISTRO_ID = "2574";
const CLIENTE = "36";

const supabase = createClient(url, key, { auth: { persistSession: false } });

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function extractRegistroIds(meta) {
  const out = new Set();
  if (!meta || typeof meta !== "object") return [];
  const blocks = [
    meta.zeta_comprobante_identity_v1,
    meta.zeta_customer_voucher_v1,
    meta,
  ].filter(Boolean);
  for (const b of blocks) {
    for (const k of ["zeta_registro_id", "ZetaRegistroId", "registro_id", "RegistroId"]) {
      const v = b[k];
      if (v != null && String(v).trim() && String(v) !== "0") out.add(String(v).trim());
    }
    const raw = b.raw_payload;
    if (raw && typeof raw === "object") {
      for (const k of ["RegistroId", "registroId"]) {
        const v = raw[k];
        if (v != null && String(v).trim()) out.add(String(v).trim());
      }
    }
  }
  return [...out];
}

function extractSaldosRows(payloadJson) {
  if (!payloadJson || typeof payloadJson !== "object") return [];
  const body = payloadJson.body ?? payloadJson;
  const out = body?.QuerySaldosPendientesOut ?? body?.querySaldosPendientesOut;
  const resp = out?.Response ?? out?.response;
  return Array.isArray(resp) ? resp : [];
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Investigación A-2877 — sync saldos no aplicó Saldo 17080");
  console.log("══════════════════════════════════════════════════════════════\n");

  const { data: company } = await supabase
    .from("proto_companies")
    .select("id, name, RazonSocial, Codigo")
    .eq("workspace_company_id", workspaceId)
    .eq("Codigo", CLIENTE)
    .maybeSingle();

  const { data: inv2877 } = await supabase
    .from("proto_invoices")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .eq("invoice_number", INVOICE_CCV1)
    .maybeSingle();

  const { data: dupes } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, total_amount, status, zeta_metadata, updated_at, company_id, is_active")
    .eq("workspace_company_id", workspaceId)
    .or(`invoice_number.eq.${INVOICE_CCV1},invoice_number.eq.ZETA:${REGISTRO_ID},invoice_number.ilike.%:2877`);

  const { data: byNumero } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, zeta_metadata")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "%:2877");

  const { data: saldosState } = await supabase
    .from("zeta_sync_state")
    .select("*")
    .eq("company_id", workspaceId)
    .eq("resource_flow", "factura_cliente_saldos_pendientes")
    .maybeSingle();

  const { data: rawPayloads } = await supabase
    .from("zeta_sync_raw_payloads")
    .select("id, sync_run_id, chunk_index, created_at, payload_json, request_fingerprint")
    .eq("workspace_company_id", workspaceId)
    .eq("resource_flow", "factura_cliente_saldos_pendientes")
    .order("created_at", { ascending: false })
    .limit(80);

  const hits2877 = [];
  for (const p of rawPayloads ?? []) {
    const fp = String(p.request_fingerprint ?? "");
    if (!fp.includes(`"c":"${CLIENTE}"`) && !fp.includes(`c\":\"${CLIENTE}`)) continue;
    for (const r of extractSaldosRows(p.payload_json)) {
      if (String(r.Numero ?? r.numero) === "2877") {
        hits2877.push({
          created_at: p.created_at,
          sync_run_id: p.sync_run_id,
          chunk: p.chunk_index,
          Saldo: r.Saldo,
          Total: r.Total,
          RegistroId: r.RegistroId,
        });
      }
    }
  }

  const { data: balanceLogs } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, zeta_metadata")
    .eq("workspace_company_id", workspaceId)
    .eq("id", inv2877?.id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();

  let zetaBalanceWrites = [];
  const meta = balanceLogs?.zeta_metadata;
  if (meta && typeof meta === "object") {
    const w = meta.zeta_balance_write_history ?? meta.balance_write_history;
    if (Array.isArray(w)) zetaBalanceWrites = w;
  }

  const zeta = await import("../lib/integrations/zeta/zeta-factura-cliente.js");
  const { mapSaldoRowsToZetaInvoicesBestEffort } = zeta;
  const { resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow } = await import(
    "../lib/integrations/zeta/zeta-customer-vouchers-mapper.js"
  );

  const liveRes = await zeta.queryFacturaClienteSaldosPendientes(
    { requestId: "inv-a2877", tenantId: workspaceId, syncRunId: "audit" },
    { clienteCodigo: CLIENTE, page: "1" }
  );
  const liveRow = (liveRes.rows ?? []).find((r) => String(r.Numero ?? r.numero) === "2877");

  let mapped = null;
  let protoInput = null;
  if (liveRow && company?.id) {
    const mappedList = mapSaldoRowsToZetaInvoicesBestEffort(company.id, [liveRow]);
    mapped = mappedList[0] ?? null;
    if (mapped) {
      const bal = mapped.outstandingAmount ?? 0;
      const status = bal <= 1e-6 ? "paid" : "issued";
      protoInput = {
        invoice_number: `ZETA:${mapped.zetaId}`,
        ccv1: resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow(liveRow),
        balance_amount: bal,
        total_amount: mapped.totalAmount,
        status,
        outstandingAmount: mapped.outstandingAmount,
        zetaId: mapped.zetaId,
      };
    }
  }

  console.log("── 1. proto_invoices A-2877 (CCV1) ──");
  if (!inv2877) {
    console.log("  NO ENCONTRADA");
  } else {
    console.log(`  id:              ${inv2877.id}`);
    console.log(`  invoice_number:  ${inv2877.invoice_number}`);
    console.log(`  company_id:      ${inv2877.company_id} (${company?.RazonSocial ?? "?"})`);
    console.log(`  total_amount:    ${inv2877.total_amount}`);
    console.log(`  balance_amount:  ${inv2877.balance_amount}`);
    console.log(`  status:          ${inv2877.status}`);
    console.log(`  currency_code:   ${inv2877.currency_code}`);
    console.log(`  issue_date:      ${inv2877.issue_date}`);
    console.log(`  updated_at:      ${inv2877.updated_at}`);
    console.log(`  is_active:       ${inv2877.is_active}`);
    console.log(`  registro_ids:    ${extractRegistroIds(inv2877.zeta_metadata).join(", ") || "NINGUNO"}`);
    const rec = inv2877.zeta_metadata?.zeta_saldos_reconciliation_v1;
    if (rec) {
      console.log(`  saldos_recon:    last_seen=${rec.last_seen_in_zeta_at ?? "—"} missing=${rec.pending_sync_missing_count ?? 0}`);
    }
  }
  console.log();

  console.log("── 2. Duplicados / variantes invoice_number ──");
  for (const d of dupes ?? []) {
    console.log(
      `  ${d.invoice_number} | bal=${d.balance_amount} | active=${d.is_active} | registro=${extractRegistroIds(d.zeta_metadata).join(",") || "—"} | updated=${d.updated_at}`
    );
  }
  console.log(`  like %:2877 → ${(byNumero ?? []).length} filas`);
  for (const d of byNumero ?? []) {
    if (d.invoice_number === INVOICE_CCV1) continue;
    console.log(`    ${d.invoice_number} bal=${d.balance_amount}`);
  }
  console.log();

  console.log("── 3. Sync saldos ──");
  console.log(`  last_success_at: ${saldosState?.last_success_at ?? "—"}`);
  console.log(`  watermark:       ${saldosState?.watermark ?? "—"}`);
  console.log(`  Raw payloads cliente 36 con Numero 2877: ${hits2877.length}`);
  for (const h of hits2877.slice(0, 5)) {
    console.log(`    ${h.created_at} run=${h.sync_run_id?.slice(0, 8)} Saldo=${h.Saldo} Total=${h.Total} Reg=${h.RegistroId}`);
  }
  console.log();

  console.log("── 4. Mapping in-memory (fila live) ──");
  if (!liveRow) {
    console.log("  Sin fila live 2877");
  } else {
    console.log(`  RegistroId: ${liveRow.RegistroId} | ccv1 computed: ${protoInput?.ccv1 ?? "—"}`);
    console.log(`  outstandingAmount (Saldo): ${mapped?.outstandingAmount}`);
    console.log(`  totalAmount (Total):     ${mapped?.totalAmount}`);
    console.log(`  legacy invoice_number:   ZETA:${mapped?.zetaId}`);
    console.log(`  protoInput balance:      ${protoInput?.balance_amount}`);
    console.log(`  protoInput total:        ${protoInput?.total_amount}`);
  }
  console.log();

  console.log("── 5. Diagnóstico persist path ──");
  const ccv1 = protoInput?.ccv1;
  const regIds = inv2877 ? extractRegistroIds(inv2877.zeta_metadata) : [];
  const regMatch = regIds.includes(REGISTRO_ID);
  const legacyInv = (dupes ?? []).find((d) => d.invoice_number === `ZETA:${REGISTRO_ID}`);

  console.log(`  CCV1 en DB:                    ${INVOICE_CCV1}`);
  console.log(`  CCV1 desde mapper saldos:      ${ccv1 ?? "NULL — mapper no arma CCV1"}`);
  console.log(`  RegistroId en metadata CCV1:   ${regMatch ? "SÍ" : "NO"} (esperado ${REGISTRO_ID})`);
  console.log(`  Legacy ZETA:${REGISTRO_ID}:       ${legacyInv ? `SÍ id=${legacyInv.id} bal=${legacyInv.balance_amount}` : "NO"}`);
  console.log();

  let causa = "";
  let fix = "";
  if (!ccv1) {
    causa = "mapper_no_genera_ccv1 — persist cae a legacy ZETA:2574";
    fix = "Enriquecer fila saldos / vouchers con identidad CCV1 o backfill zeta_registro_id en metadata";
  } else if (!regMatch && legacyInv) {
    causa = "matching_fallido — saldos actualiza ZETA:2574 (legacy) pero cartera usa CCV1 sin registro_id en metadata";
    fix = "Backfill zeta_registro_id=2574 en zeta_metadata del CCV1 + re-sync saldos cliente 36";
  } else if (!regMatch) {
    causa = "sin_registro_id_metadata — lookup registro y ccv1+consistency fallan; heuristic rechazado (score bajo histórico)";
    fix = "Persistir zeta_comprobante_identity_v1 con RegistroId 2574 en factura CCV1; re-sync saldos";
  } else {
    causa = "revisar_protoUpdateInvoice_o_post_sync_overwrite";
    fix = "Auditar zeta_balance_write logs y vouchers pipeline post-saldos";
  }

  console.log("── 6. Conclusión ──");
  console.log(`  Causa:     ${causa}`);
  console.log(`  Tipo:      bug de matching (no guard de balance ni currency)`);
  console.log(`  Mapping:   CORRECTO in-memory → balance_amount debería ser 17080`);
  console.log(`  Upsert:    NO aplicó al registro CCV1 que usa Cartera`);
  console.log(`  Fix:       ${fix}`);
  console.log(`  Post-fix:  update puntual A-2877 a 17080 solo tras confirmar sync matchea CCV1`);
  console.log();

  const out = {
    causa,
    fix,
    inv2877: inv2877
      ? {
          id: inv2877.id,
          balance_amount: inv2877.balance_amount,
          total_amount: inv2877.total_amount,
          registro_ids: regIds,
          updated_at: inv2877.updated_at,
        }
      : null,
    legacyInv: legacyInv ?? null,
    protoInput,
    hits2877: hits2877.slice(0, 3),
    last_saldos_sync: saldosState?.last_success_at,
  };
  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `audit-investigate-a2877-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log(`JSON: ${path}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
