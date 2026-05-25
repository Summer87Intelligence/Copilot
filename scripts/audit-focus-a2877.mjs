#!/usr/bin/env node
/**
 * Diagnóstico read-only focal: El País S.A. — A-2877
 * Excel/Copilot $41.480 vs QuerySaldosPendientes live $17.080
 *
 * Uso:
 *   npx tsx scripts/audit-focus-a2877.mjs
 *   npx tsx scripts/audit-focus-a2877.mjs --dump-raw
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const CLIENTE_CODIGO = "36";
const SERIE = "A";
const NUMERO = "2877";
const INVOICE_NUMBER = `ZETA:CCV1:0:${CLIENTE_CODIGO}:${SERIE}:${NUMERO}`;
const COMPROBANTE = `${SERIE}-${NUMERO}`;
const EXCEL_EXPORT_MTME = "2026-05-22T12:55:56.643Z";
const SALDOS_FLOW = "factura_cliente_saldos_pendientes";
const SALDOS_OP = "RESTFacturaClienteV4QuerySaldosPendientes";

const args = process.argv.slice(2);
const DUMP_RAW = args.includes("--dump-raw");

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

const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ventasExcel = resolve(
  process.env.USERPROFILE ?? "",
  "Downloads/VentasExport-4546.xlsx"
);

if (!url || !key || !workspaceId) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rowNumero(row) {
  return String(row.Numero ?? row.numero ?? row.ComprobanteNumero ?? "").trim();
}

function rowSerie(row) {
  return String(row.Serie ?? row.serie ?? row.ComprobanteSerie ?? "A").trim();
}

function extractSaldosFromPayload(payloadJson) {
  if (!payloadJson || typeof payloadJson !== "object") return [];
  const body = payloadJson.body ?? payloadJson;
  const out = body?.QuerySaldosPendientesOut ?? body?.querySaldosPendientesOut;
  const resp = out?.Response ?? out?.response;
  return Array.isArray(resp) ? resp : [];
}

function extractRegistroIds(meta) {
  const out = new Set();
  if (!meta || typeof meta !== "object") return [];
  const v1 = meta.zeta_customer_voucher_v1 ?? meta;
  for (const k of ["zeta_registro_id", "ZetaRegistroId", "registro_id", "RegistroId"]) {
    const v = v1?.[k];
    if (v != null && String(v).trim() && String(v) !== "0") out.add(String(v).trim());
  }
  const raw = v1?.raw_payload ?? meta.raw_payload;
  if (raw && typeof raw === "object") {
    for (const k of ["RegistroId", "registroId"]) {
      const v = raw[k];
      if (v != null && String(v).trim()) out.add(String(v).trim());
    }
  }
  return [...out];
}

async function fetchAllSaldosLive(zeta, ctx) {
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const res = await zeta.queryFacturaClienteSaldosPendientes(ctx, {
      clienteCodigo: CLIENTE_CODIGO,
      page: String(page),
    });
    if (!res.succeed) break;
    if (Array.isArray(res.rows)) all.push(...res.rows.map((r) => ({ ...r, _page: page })));
    if (res.isLastPage === true) break;
    await sleep(80);
  }
  return all;
}

async function fetchAllCuotasLive(fetchMod, ctx) {
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetchMod.fetchZetaInstallments({
      ctx,
      page: String(page),
      filters: { clienteCodigo: CLIENTE_CODIGO },
    });
    if (!res.ok) break;
    all.push(...res.rows.map((r) => ({ ...r, _page: page })));
    if (res.isLastPage === true) break;
    if (page > 1 && res.rows.length === 0) break;
    await sleep(80);
  }
  return all;
}

function parseExcel2877() {
  if (!existsSync(ventasExcel)) return null;
  const wb = XLSX.readFile(ventasExcel);
  const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  let dataStart = 1;
  let iNumero = 4;
  let iSaldo = 7;
  for (let i = 0; i < Math.min(8, all.length); i++) {
    const h = (all[i] ?? []).map((x) => String(x ?? "").toLowerCase());
    const idx = (n) => h.findIndex((c) => c.includes(n));
    if (idx("fecha") >= 0 && idx("saldo") >= 0) {
      dataStart = i + 1;
      iNumero = h.findIndex((c) => c === "nº" || c.includes("numero") || c.includes("n°"));
      iSaldo = idx("saldo");
      break;
    }
  }
  for (let i = dataStart; i < all.length; i++) {
    const row = all[i];
    if (!row) continue;
    const n = String(Number(row[iNumero]) || row[iNumero] || "").trim();
    if (n !== NUMERO) continue;
    return {
      saldo: num(row[iSaldo]),
      total: num(row[iSaldo]),
      file: ventasExcel,
      mtime: statSync(ventasExcel).mtime.toISOString(),
    };
  }
  return null;
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Auditoría focal read-only: El País — A-2877");
  console.log("══════════════════════════════════════════════════════════════\n");

  const excelRow = parseExcel2877();
  const { data: inv, error: invErr } = await supabase
    .from("proto_invoices")
    .select(
      "id, invoice_number, balance_amount, total_amount, currency_code, status, issue_date, company_id, zeta_metadata, updated_at, created_at"
    )
    .eq("workspace_company_id", workspaceId)
    .eq("invoice_number", INVOICE_NUMBER)
    .maybeSingle();

  if (invErr) throw new Error(invErr.message);

  const { data: company } = inv?.company_id
    ? await supabase
        .from("proto_companies")
        .select("id, name, RazonSocial, Codigo")
        .eq("id", inv.company_id)
        .maybeSingle()
    : { data: null };

  const { data: installments } = inv?.id
    ? await supabase
        .from("proto_invoice_installments")
        .select(
          "id, cuota_numero, cuota_total, cuota_saldo, cuota_vencimiento, zeta_registro_id, updated_at, metadata"
        )
        .eq("invoice_id", inv.id)
        .order("cuota_numero")
    : { data: [] };

  const cuotaSum = round2((installments ?? []).reduce((s, c) => s + num(c.cuota_saldo), 0));

  const exportIso = EXCEL_EXPORT_MTME;
  const { data: receipts } = await supabase
    .from("proto_receipts")
    .select("id, receipt_number, receipt_date, amount, currency_code, reference, notes, created_at")
    .eq("workspace_company_id", workspaceId)
    .eq("company_id", inv?.company_id ?? "00000000-0000-0000-0000-000000000000")
    .eq("is_active", true)
    .gte("receipt_date", "2026-04-01")
    .order("receipt_date", { ascending: false })
    .limit(30);

  const receiptsAfterExport = (receipts ?? []).filter(
    (r) => r.receipt_date && String(r.receipt_date) >= "2026-05-22"
  );

  const { data: saldosState } = await supabase
    .from("zeta_sync_state")
    .select("resource_flow, last_success_at, watermark")
    .eq("company_id", workspaceId)
    .eq("resource_flow", SALDOS_FLOW)
    .maybeSingle();

  const { data: rawPages } = await supabase
    .from("zeta_sync_raw_payloads")
    .select("sync_run_id, chunk_index, created_at, payload_json")
    .eq("workspace_company_id", workspaceId)
    .eq("resource_flow", SALDOS_FLOW)
    .eq("zeta_operation", SALDOS_OP)
    .order("created_at", { ascending: false })
    .limit(30);

  const saldosInRaw = [];
  for (const p of rawPages ?? []) {
    const rows = extractSaldosFromPayload(p.payload_json);
    for (const r of rows) {
      if (rowNumero(r) === NUMERO && rowSerie(r) === SERIE) {
        saldosInRaw.push({
          created_at: p.created_at,
          chunk_index: p.chunk_index,
          RegistroId: r.RegistroId ?? r.registroId,
          Saldo: num(r.Saldo ?? r.saldo),
          Total: num(r.Total ?? r.total),
          Fecha: r.Fecha ?? r.fecha,
          raw: DUMP_RAW ? r : undefined,
        });
      }
    }
  }

  const zeta = await import("../lib/integrations/zeta/zeta-factura-cliente.js");
  const fetchMod = await import("../lib/integrations/zeta/zeta-installments-fetch.js");
  const ctx = { requestId: "audit-a2877", tenantId: workspaceId, syncRunId: "audit-focus" };

  const saldosLive = await fetchAllSaldosLive(zeta, ctx);
  const saldoRows2877 = saldosLive.filter((r) => rowNumero(r) === NUMERO);
  const saldoRows2821 = saldosLive.filter((r) => rowNumero(r) === "2821");
  const saldoRowsElPais = saldosLive.filter((r) => String(r.ClienteCodigo ?? CLIENTE_CODIGO) === CLIENTE_CODIGO);

  const cuotasLive = await fetchAllCuotasLive(fetchMod, ctx);
  const invRids = new Set(extractRegistroIds(inv?.zeta_metadata));
  const cuotas2877 = cuotasLive.filter((c) => {
    const rid = String(c.RegistroId ?? c.registroId ?? "").trim();
    return invRids.has(rid);
  });

  const liveSaldo2877 = saldoRows2877.length
    ? round2(num(saldoRows2877[0].Saldo ?? saldoRows2877[0].saldo))
    : null;
  const liveTotal2877 = saldoRows2877.length
    ? round2(num(saldoRows2877[0].Total ?? saldoRows2877[0].total))
    : null;

  const { data: inv2821 } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, total_amount, issue_date")
    .eq("workspace_company_id", workspaceId)
    .eq("invoice_number", `ZETA:CCV1:0:${CLIENTE_CODIGO}:A:2821`)
    .maybeSingle();

  console.log("── Contexto export / sync ──");
  console.log(`  Excel VentasExport mtime:     ${excelRow?.mtime ?? "—"}`);
  console.log(`  Excel A-2877 saldo:           ${excelRow ? `$ ${excelRow.saldo}` : "—"}`);
  console.log(`  Última sync saldos Copilot:   ${saldosState?.last_success_at ?? "—"}`);
  console.log(`  Factura updated_at:           ${inv?.updated_at ?? "—"}`);
  console.log();

  console.log("── Copilot DB (proto_invoices) ──");
  if (!inv) {
    console.log("  ⚠ Factura no encontrada en DB");
  } else {
    console.log(`  invoice_number:  ${inv.invoice_number}`);
    console.log(`  Cliente:         ${company?.RazonSocial ?? company?.name ?? "—"} (Codigo ${company?.Codigo ?? CLIENTE_CODIGO})`);
    console.log(`  issue_date:      ${inv.issue_date}`);
    console.log(`  total_amount:    ${inv.total_amount}`);
    console.log(`  balance_amount:  ${inv.balance_amount}`);
    console.log(`  status:          ${inv.status}`);
    console.log(`  registro_id(s):  ${extractRegistroIds(inv.zeta_metadata).join(", ") || "—"}`);
    const rec = inv.zeta_metadata?.zeta_saldos_reconciliation_v1 ?? inv.zeta_metadata?.reconciliation;
    if (rec) {
      console.log(`  reconciliation:  last_seen=${rec.last_seen_in_zeta_at ?? "—"} missing=${rec.pending_sync_missing_count ?? 0}`);
    }
  }
  console.log();

  console.log("── Cuotas locales (proto_invoice_installments) ──");
  if (!installments?.length) {
    console.log("  Sin cuotas vinculadas en DB");
  } else {
    let sumOpen = 0;
    for (const c of installments) {
      const sal = num(c.cuota_saldo);
      sumOpen += sal;
      console.log(
        `  cuota ${c.cuota_numero}: total=${c.cuota_total} saldo=${c.cuota_saldo} vence=${c.cuota_vencimiento ?? "—"} registro=${c.zeta_registro_id ?? "—"}`
      );
    }
    console.log(`  Σ cuota_saldo abierto: ${round2(sumOpen)} (vs balance ${inv?.balance_amount ?? "—"})`);
  }
  console.log();

  console.log("── QuerySaldosPendientes LIVE (cliente 36, paginado) ──");
  console.log(`  Filas totales API: ${saldosLive.length} | páginas hasta IsLastPage`);
  console.log(`  Filas A-2877:      ${saldoRows2877.length}`);
  console.log(`  Filas A-2821:      ${saldoRows2821.length}`);
  if (saldoRows2877.length) {
    const r = saldoRows2877[0];
    console.log(`  A-2877 Saldo live: ${liveSaldo2877} | Total API: ${liveTotal2877} | RegistroId: ${r.RegistroId ?? r.registroId}`);
    console.log(`  Fecha API:         ${r.Fecha ?? r.fecha ?? "—"}`);
    if (DUMP_RAW) console.log("  Raw row:", JSON.stringify(r, null, 2));
  }
  if (saldoRows2821.length) {
    const r = saldoRows2821[0];
    console.log(`  A-2821 Saldo live: ${num(r.Saldo ?? r.saldo)} (en mismo payload cliente 36)`);
  }
  console.log("  Otros saldos El País en live:");
  for (const r of saldoRowsElPais) {
    const n = rowNumero(r);
    if (n === NUMERO || n === "2821") continue;
    console.log(`    A-${n}: Saldo=${num(r.Saldo ?? r.saldo)} Total=${num(r.Total ?? r.total)}`);
  }
  console.log();

  console.log("── RESTCuotasV1QueryCliente LIVE (cliente 36) ──");
  console.log(`  Filas cuotas API: ${cuotasLive.length}`);
  const rid2877 = String(saldoRows2877[0]?.RegistroId ?? saldoRows2877[0]?.registroId ?? "").trim();
  const cuotasByRid = rid2877
    ? cuotasLive.filter((c) => String(c.RegistroId ?? c.registroId ?? "").trim() === rid2877)
    : [];
  if (!cuotas2877.length && !cuotasByRid.length) {
    console.log(`  Sin cuotas live para RegistroId ${rid2877 || "—"} (metadata DB sin registro_id)`);
    for (const c of cuotasLive) {
      console.log(
        `    [p${c._page}] registro=${c.RegistroId ?? c.registroId} cuota=${c.CuotaNumero ?? c.cuotaNumero} saldo=${c.CuotaSaldo ?? c.cuotaSaldo}`
      );
    }
  } else {
    const list = cuotas2877.length ? cuotas2877 : cuotasByRid;
    let sumCuotaSaldo = 0;
    for (const c of list) {
      const cs = num(c.CuotaSaldo ?? c.cuotaSaldo);
      sumCuotaSaldo += cs;
      console.log(
        `  cuota ${c.CuotaNumero ?? c.cuotaNumero}: saldo=${cs} total=${c.CuotaTotal ?? c.cuotaTotal} vence=${c.CuotaVencimiento ?? c.cuotaVencimiento ?? "—"}`
      );
    }
    console.log(`  Σ CuotaSaldo live (por RegistroId): ${round2(sumCuotaSaldo)}`);
  }
  console.log();

  console.log("── Recibos DB (El País, desde abr 2026) ──");
  console.log(`  Total listados: ${receipts?.length ?? 0} | posteriores al export (≥ 2026-05-22): ${receiptsAfterExport.length}`);
  for (const r of receiptsAfterExport.slice(0, 8)) {
    console.log(`    ${r.receipt_date} ${r.receipt_number ?? "—"} $${r.amount} ${r.currency_code ?? ""}`);
  }
  console.log();

  console.log("── Histórico raw sync saldos (últimos payloads con A-2877) ──");
  if (!saldosInRaw.length) {
    console.log("  No se encontró A-2877 en últimos 30 chunks globales (puede estar en chunk por cliente distinto)");
  } else {
    for (const h of saldosInRaw.slice(0, 5)) {
      console.log(`    ${h.created_at} chunk=${h.chunk_index} Saldo=${h.Saldo} Total=${h.Total} RegistroId=${h.RegistroId}`);
    }
  }
  console.log();

  console.log("── Referencia El País A-2821 (mismo cliente) ──");
  console.log(`  A-2821 balance DB: ${inv2821?.balance_amount ?? "—"} (live saldos: ${saldoRows2821.length ? "sí" : "no"})`);
  console.log(`  A-2821 + A-2877 Excel: ${round2(num(inv2821?.balance_amount) + num(excelRow?.saldo))} (histórico tests: 58.560)`);
  console.log();

  const excelSaldo = excelRow?.saldo ?? num(inv?.balance_amount);
  const copilotSaldo = num(inv?.balance_amount);
  const gapExcelZeta = liveSaldo2877 != null ? round2(excelSaldo - liveSaldo2877) : null;

  let hipotesis = "indeterminado";
  let accion = "Monitorear; no cleanup; no modificar DB";
  let detalle = "";

  if (liveSaldo2877 != null && liveTotal2877 != null && Math.abs(liveTotal2877 - copilotSaldo) <= 0.02) {
    hipotesis = "diferencia_interpretacion_total_vs_saldo";
    detalle =
      `Misma fila Zeta: Total=${liveTotal2877} (≈ Excel/Copilot) y Saldo=${liveSaldo2877} (remanente QuerySaldos). ` +
      `Gap ${gapExcelZeta ?? round2(copilotSaldo - liveSaldo2877)} = porción ya cobrada/aplicada en Zeta, no ausencia del comprobante.`;
    accion =
      "Validar en Zeta UI aplicaciones de cobro; Copilot/Excel alinean al total documento — no cleanup mientras Excel=Copilot";
  } else if (liveSaldo2877 != null && Math.abs(liveSaldo2877 - copilotSaldo) > 0.02) {
    if (cuotas2877.length > 0) {
      const sumLive = round2(
        cuotas2877.reduce((s, c) => s + num(c.CuotaSaldo ?? c.cuotaSaldo), 0)
      );
      if (Math.abs(sumLive - liveSaldo2877) <= 0.02) {
        hipotesis = "diferencia_interpretacion_cuota_saldo";
        detalle = `QuerySaldos Saldo=${liveSaldo2877}; Excel/Copilot=${copilotSaldo}; Σ cuotas live ≈ saldo API.`;
        accion = "Validar en Zeta UI; no cleanup";
      } else {
        hipotesis = "endpoint_live_parcial_o_desfasado";
        detalle = `Saldo live ${liveSaldo2877} ≠ Copilot ${copilotSaldo}; cuotas live no explican el total.`;
        accion = "Esperar próxima sync saldos; no cleanup mientras Excel=Copilot";
      }
    } else {
      hipotesis = "endpoint_live_parcial_o_desfasado";
      detalle = `Zeta live Saldo=${liveSaldo2877} vs Excel/Copilot ${copilotSaldo} (Total API=${liveTotal2877 ?? "—"}).`;
    }
  } else if (liveSaldo2877 != null && Math.abs(liveSaldo2877 - copilotSaldo) <= 0.02) {
    hipotesis = "alineado_en_live";
    detalle = "Live coincide con Copilot; discrepancia previa pudo ser temporal.";
  } else {
    hipotesis = "ausente_en_saldos_live";
    detalle = "A-2877 no aparece en QuerySaldosPendientes paginado ahora.";
  }

  if (
    saldosState?.last_success_at &&
    excelRow?.mtime &&
    new Date(saldosState.last_success_at) > new Date(excelRow.mtime)
  ) {
    detalle += " Sync saldos posterior al export Excel.";
  }

  console.log("── Conclusión diagnóstica ──");
  console.log(`  Excel / Copilot:     $ ${excelSaldo} / $ ${copilotSaldo}`);
  console.log(`  Zeta saldos live:    ${liveSaldo2877 != null ? `$ ${liveSaldo2877}` : "ausente"}`);
  console.log(`  Gap Excel − live:    ${gapExcelZeta != null ? `$ ${gapExcelZeta}` : "—"}`);
  console.log(`  Hipótesis:           ${hipotesis}`);
  console.log(`  Detalle:             ${detalle}`);
  console.log(`  Acción:              ${accion}`);
  console.log();
  console.log("  Monitoreo (sin cleanup): A-2927, A-2923, A-2922, A-2906, A-2821 — mientras Excel=Copilot.");
  console.log();

  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = resolve(outDir, `audit-focus-a2877-${ts}.json`);
  const report = {
    comprobante: COMPROBANTE,
    cliente: "El País S.A.",
    cliente_codigo: CLIENTE_CODIGO,
    excel_saldo: excelSaldo,
    copilot_balance: copilotSaldo,
    zeta_saldo_live: liveSaldo2877,
    zeta_total_live: liveTotal2877,
    gap_excel_minus_live: gapExcelZeta,
    cuota_local_sum: cuotaSum,
    cuotas_live_count: cuotas2877.length,
    saldos_live_rows_2877: saldoRows2877.length,
    saldos_live_rows_2821: saldoRows2821.length,
    receipts_after_export: receiptsAfterExport.length,
    last_saldos_sync: saldosState?.last_success_at,
    hipotesis,
    accion,
    detalle,
    saldo_row_2877: saldoRows2877[0] ?? null,
    installments: installments ?? [],
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`JSON: ${reportPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
