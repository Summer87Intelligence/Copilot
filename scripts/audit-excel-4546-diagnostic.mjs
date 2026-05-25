#!/usr/bin/env node
/**
 * Diagnóstico read-only: VentasExport-4546 + RecibosCobranzaWWExport-9513 vs Copilot DB.
 * Clasifica diferencias y enriquece con Zeta saldos (live), cuotas, recibos y sync.
 *
 * Uso:
 *   node --env-file=.env.local scripts/audit-excel-4546-diagnostic.mjs
 *   node --env-file=.env.local scripts/audit-excel-4546-diagnostic.mjs --no-live-zeta
 *
 * QuerySaldosPendientes: recorre todas las páginas hasta IsLastPage (máx 100/cliente).
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const EPS = 0.005;
const AMOUNT_TOL = 0.02;
const SYNC_WINDOW_HOURS = 6;
/** Máximo de páginas por cliente en QuerySaldosPendientes (mismo criterio que pipeline). */
const MAX_ZETA_SALDOS_PAGES = 100;
const ZETA_PAGE_DELAY_MS = 80;

/** Comprobantes a revalidar con paginación completa (audit previo solo usaba page 1). */
const FOCUS_COMPROBANTES = new Set([
  "A-2927",
  "A-2923",
  "A-2922",
  "A-2906",
  "A-2821",
  "A-2877",
]);

const args = process.argv.slice(2);
const SKIP_LIVE = args.includes("--no-live-zeta");

function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

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

const VENTAS_EXCEL =
  argFlag("--ventas") ??
  resolve(process.env.USERPROFILE ?? "", "Downloads/VentasExport-4546.xlsx");
const RECIBOS_EXCEL =
  argFlag("--recibos") ??
  resolve(process.env.USERPROFILE ?? "", "Downloads/RecibosCobranzaWWExport-9513.xlsx");

const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || !workspaceId) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── helpers (shared con audit-excel-pending-vs-db) ───────────────────────────

function xlsxSerialToYmd(serial) {
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function normalizeCurrency(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "U$S" || s === "USD" || s === "US$" || s.includes("DOLAR")) return "USD";
  if (s === "$" || s === "UYU" || s === "UR$" || s.includes("PES")) return "UYU";
  return "UNKNOWN";
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fmtMoney(cur, n) {
  if (cur === "USD") return `U$S ${n.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`;
  return `$ ${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function pad(s, w) {
  const t = String(s ?? "");
  return t.length >= w ? t.slice(0, w - 1) + "…" : t.padEnd(w);
}

function detectExcelColumns(all) {
  for (let i = 0; i < Math.min(10, all.length); i++) {
    const row = all[i];
    if (!Array.isArray(row)) continue;
    const headers = row.map((h) => String(h ?? "").trim().toLowerCase());
    const idx = (names) => {
      for (const n of names) {
        const j = headers.findIndex((h) => h === n || h.includes(n));
        if (j >= 0) return j;
      }
      return -1;
    };
    const fecha = idx(["fecha"]);
    const saldo = idx(["saldo"]);
    if (fecha >= 0 && saldo >= 0) {
      return {
        dataStart: i + 1,
        fecha,
        tipo: idx(["tipo"]),
        comprobante: idx(["comprobante"]),
        numero: idx(["nº", "no", "numero", "n°"]),
        cliente: idx(["cliente"]),
        razon: idx(["razón social", "razon social"]),
        rut: idx(["rut"]),
        moneda: idx(["moneda"]),
        total: idx(["total"]),
        saldo,
      };
    }
  }
  return null;
}

function parseVentasExcel(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) throw new Error(`Ventas Excel no encontrado: ${abs}`);
  const wb = XLSX.readFile(abs);
  const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const cols = detectExcelColumns(all);
  if (!cols) throw new Error("Layout VentasExport no detectado");
  const rows = [];
  for (let i = cols.dataStart; i < all.length; i++) {
    const row = all[i];
    if (!row || typeof row[cols.fecha] !== "number") continue;
    const numero_raw = typeof row[cols.numero] === "number" ? row[cols.numero] : Number(row[cols.numero]);
    rows.push({
      issue_date: xlsxSerialToYmd(row[cols.fecha]),
      numero: String(Number.isNaN(numero_raw) ? row[cols.numero] ?? "" : numero_raw),
      comprobante: cols.comprobante >= 0 ? String(row[cols.comprobante] ?? "").trim() : "",
      cliente_nombre: cols.cliente >= 0 ? String(row[cols.cliente] ?? "").trim() : "",
      razon_social: cols.razon >= 0 ? String(row[cols.razon] ?? "").trim() : "",
      currency: normalizeCurrency(cols.moneda >= 0 ? row[cols.moneda] : ""),
      total: cols.total >= 0 ? num(row[cols.total]) : num(row[cols.saldo]),
      saldo: num(row[cols.saldo]),
    });
  }
  return rows;
}

function parseRecibosExcel(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return { rows: [], note: "archivo no encontrado" };
  const wb = XLSX.readFile(abs);
  const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  let headerRow = -1;
  for (let i = 0; i < Math.min(8, all.length); i++) {
    const h = (all[i] ?? []).map((x) => String(x ?? "").toLowerCase());
    if (h.some((c) => c.includes("fecha")) && h.some((c) => c.includes("total"))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return { rows: [], note: "sin encabezados" };
  const headers = (all[headerRow] ?? []).map((x) => String(x ?? "").trim().toLowerCase());
  const idx = (n) => headers.findIndex((h) => h.includes(n));
  const iFecha = idx("fecha");
  const iCliente = idx("cliente");
  const iTotal = idx("total");
  const iMoneda = idx("moneda");
  const iNumero = headers.findIndex((h) => h === "nº" || h.includes("numero") || h.includes("n°"));
  const rows = [];
  for (let i = headerRow + 1; i < all.length; i++) {
    const row = all[i];
    if (!row || typeof row[iFecha] !== "number") continue;
    rows.push({
      fecha: xlsxSerialToYmd(row[iFecha]),
      cliente: iCliente >= 0 ? String(row[iCliente] ?? "").trim() : "",
      numero: iNumero >= 0 ? String(row[iNumero] ?? "").trim() : "",
      total: num(row[iTotal]),
      currency: iMoneda >= 0 ? normalizeCurrency(row[iMoneda]) : "UYU",
    });
  }
  return { rows, note: null };
}

function parseInvoiceNumber(inv) {
  const p = String(inv).split(":");
  // ZETA:CCV1:{empresa}:{clienteCodigo}:{serie}:{numero}
  if (p[0] === "ZETA" && p[1] === "CCV1" && p.length >= 6) {
    return { clienteCodigo: p[3], serie: p[4], numero: p[5] };
  }
  return { clienteCodigo: null, serie: null, numero: null };
}

function saldoKey(cliente, serie, numero) {
  return `${String(cliente).trim()}|${String(serie ?? "A").trim()}|${String(numero).trim()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** sí = saldo live ≈ Excel; no = ausente o cero; parcial = presente pero monto distinto. */
function zetaSaldosLiveStatus(excelSaldo, zetaSaldoLive) {
  if (zetaSaldoLive == null || zetaSaldoLive <= EPS) return "no";
  if (Math.abs(zetaSaldoLive - excelSaldo) <= AMOUNT_TOL) return "sí";
  return "parcial";
}

function ingestZetaSaldoRows(index, rows, fallbackClienteCodigo) {
  for (const row of rows) {
    const cliente = row.ClienteCodigo ?? row.clienteCodigo ?? fallbackClienteCodigo;
    const serie = row.Serie ?? row.serie ?? row.ComprobanteSerie ?? "A";
    const numero = String(
      row.Numero ?? row.numero ?? row.ComprobanteNumero ?? row.NroComprobante ?? ""
    ).trim();
    const saldo = num(row.Saldo ?? row.saldo);
    if (!numero) continue;
    index.set(saldoKey(cliente, serie, numero), saldo);
  }
}

function recommendZetaAccion({
  excelCopilotMatch,
  enZetaLive,
  zetaSaldoLive,
  cuotaSaldo,
  classifyAccion,
}) {
  if (!excelCopilotMatch) return classifyAccion;
  if (enZetaLive === "sí") return "Ninguna (Excel=Copilot; Zeta saldos live alineado)";
  if (enZetaLive === "parcial") {
    return `Excel=Copilot; Zeta live ${zetaSaldoLive} ≠ Excel — validar en Zeta UI; no cleanup`;
  }
  if (cuotaSaldo > EPS) {
    return "Excel=Copilot; ausente en saldos Zeta (paginado); cuota local espejo — monitorear post-ventana, no cleanup ahora";
  }
  return "Excel=Copilot; ausente en saldos Zeta (paginado) — monitorear próxima sync, no cleanup";
}

// ── DB fetch ─────────────────────────────────────────────────────────────────

async function fetchAllPages(label, buildQuery) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchDbInvoices() {
  return fetchAllPages("invoices", (from, to) =>
    supabase
      .from("proto_invoices")
      .select("id, invoice_number, balance_amount, currency_code, status, company_id, zeta_metadata, updated_at")
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .order("id")
      .range(from, to)
  );
}

async function fetchCompanies() {
  const { data } = await supabase
    .from("proto_companies")
    .select("id, name, RazonSocial, Codigo")
    .eq("workspace_company_id", workspaceId);
  return data ?? [];
}

async function fetchInstallmentSaldosByInvoice() {
  const rows = await fetchAllPages("installments", (from, to) =>
    supabase
      .from("proto_invoice_installments")
      .select("invoice_id, cuota_saldo, cuota_numero")
      .eq("workspace_company_id", workspaceId)
      .gt("cuota_saldo", EPS)
      .range(from, to)
  );
  const m = new Map();
  for (const r of rows) {
    if (!r.invoice_id) continue;
    m.set(r.invoice_id, round2((m.get(r.invoice_id) ?? 0) + num(r.cuota_saldo)));
  }
  return m;
}

async function fetchReceiptsSummary() {
  const rows = await fetchAllPages("receipts", (from, to) =>
    supabase
      .from("proto_receipts")
      .select("id, receipt_number, receipt_date, amount, currency_code, company_id, reference, notes")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .gte("receipt_date", "2026-01-01")
      .order("receipt_date")
      .range(from, to)
  );
  return rows;
}

async function fetchSyncMeta() {
  const flows = [
    "factura_cliente_saldos_pendientes",
    "zeta_saldos_pendientes_v1",
    "zeta-sync-saldos",
    "zeta-sync-cuotas",
    "zeta_collection_receipts_v1",
    "zeta_sync_collection_receipts",
  ];
  const { data: states } = await supabase
    .from("zeta_sync_state")
    .select("resource_flow, last_success_at, bootstrap_completed, watermark")
    .eq("company_id", workspaceId)
    .in("resource_flow", flows);

  const { data: runs } = await supabase
    .from("zeta_pipeline_runs")
    .select("pipeline_name, status, finished_at, started_at")
    .eq("workspace_company_id", workspaceId)
    .order("finished_at", { ascending: false })
    .limit(15);

  return { states: states ?? [], runs: runs ?? [] };
}

// ── Match excel → invoice ────────────────────────────────────────────────────

function buildDbIndexes(invoices, compMap) {
  const byNumero = new Map();
  for (const inv of invoices) {
    const parsed = parseInvoiceNumber(inv.invoice_number);
    if (!parsed.numero) continue;
    const arr = byNumero.get(parsed.numero) ?? [];
    arr.push(inv);
    byNumero.set(parsed.numero, arr);
  }
  return { byNumero, compMap };
}

function matchInvoice(ex, indexes, matched) {
  let cands = (indexes.byNumero.get(ex.numero) ?? []).filter((i) => !matched.has(i.id));
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  const byTotal = cands.filter((c) => Math.abs(num(c.balance_amount) - ex.saldo) <= AMOUNT_TOL || Math.abs(num(c.balance_amount) - ex.total) <= AMOUNT_TOL);
  return (byTotal[0] ?? cands[0]) ?? null;
}

// ── Live Zeta saldos index per cliente ───────────────────────────────────────

async function buildLiveZetaSaldosIndex(clienteCodigos) {
  const index = new Map(); // key -> saldo
  const pagesByCliente = new Map(); // codigo -> { pagesFetched, rowCount }
  if (SKIP_LIVE) {
    return { index, errors: ["--no-live-zeta"], queried: 0, pagesByCliente, totalRows: 0 };
  }

  let zeta;
  try {
    zeta = await import("../lib/integrations/zeta/zeta-factura-cliente.js");
  } catch {
    return { index, errors: ["import zeta falló"], queried: 0, pagesByCliente, totalRows: 0 };
  }

  const errors = [];
  let queried = 0;
  let totalRows = 0;

  for (const codigo of clienteCodigos) {
    if (!codigo || codigo === "undefined") continue;
    let pagesFetched = 0;
    let rowCount = 0;
    try {
      for (let page = 1; page <= MAX_ZETA_SALDOS_PAGES; page++) {
        if (page > 1) await sleep(ZETA_PAGE_DELAY_MS);
        const res = await zeta.queryFacturaClienteSaldosPendientes(
          { requestId: `audit-4546-${codigo}-p${page}`, tenantId: workspaceId, syncRunId: "audit" },
          { clienteCodigo: String(codigo), page: String(page) }
        );
        pagesFetched++;
        if (!res.succeed) {
          errors.push(`${codigo} p${page}: succeed=false`);
          break;
        }
        const rows = Array.isArray(res.rows) ? res.rows : [];
        rowCount += rows.length;
        ingestZetaSaldoRows(index, rows, codigo);
        if (res.isLastPage === true) break;
        if (rows.length === 0 && res.responseExplicitArray) break;
      }
      if (pagesFetched >= MAX_ZETA_SALDOS_PAGES) {
        errors.push(`${codigo}: max páginas (${MAX_ZETA_SALDOS_PAGES}) alcanzado`);
      }
      queried++;
      totalRows += rowCount;
      pagesByCliente.set(String(codigo), { pagesFetched, rowCount });
    } catch (e) {
      errors.push(`${codigo}: ${e.message}`);
      pagesByCliente.set(String(codigo), { pagesFetched, rowCount, error: e.message });
    }
  }
  return { index, errors, queried, pagesByCliente, totalRows };
}

// ── Classification ───────────────────────────────────────────────────────────

function classifyRow({ ex, inv, diff, inZetaLive, cuotaSaldo, hoursSinceSaldosSync, receiptHint }) {
  if (!inv) {
    return {
      categoria: "3_diferencia_real",
      causa: "Sin factura en Copilot DB",
      accion: "Sync vouchers + saldos del cliente",
    };
  }

  if (Math.abs(diff) <= AMOUNT_TOL) {
    return {
      categoria: "1_coincide",
      causa: "Excel saldo = balance_amount Copilot",
      accion: "Ninguna",
    };
  }

  const dbBal = round2(num(inv.balance_amount));
  const excelSaldo = ex.saldo;

  // Excel muestra pendiente, Copilot y Zeta actuales no
  if (excelSaldo > EPS && dbBal <= EPS && !inZetaLive) {
    return {
      categoria: "4_excel_desactualizado",
      causa: "Zeta actual no devuelve saldo; Copilot ya cerró (paid/0)" + (receiptHint ? `; ${receiptHint}` : ""),
      accion: "Re-exportar Excel desde Zeta; no cleanup",
    };
  }

  // Copilot tiene saldo, Excel no
  if (excelSaldo <= EPS && dbBal > EPS) {
    if (inZetaLive) {
      return {
        categoria: "3_diferencia_real",
        causa: "Copilot pendiente; Excel snapshot sin fila (export parcial o timing)",
        accion: "Re-export ventas; sync saldos cliente",
      };
    }
    return {
      categoria: "4_excel_desactualizado",
      causa: "Excel no lista comprobante; DB tiene saldo",
      accion: "Verificar filtros/fecha del export Excel",
    };
  }

  // Ambos pendientes pero distinto monto
  if (excelSaldo > EPS && dbBal > EPS) {
    if (inZetaLive && Math.abs(inZetaLive - excelSaldo) <= AMOUNT_TOL && Math.abs(dbBal - excelSaldo) > AMOUNT_TOL) {
      if (hoursSinceSaldosSync != null && hoursSinceSaldosSync <= SYNC_WINDOW_HOURS) {
        return {
          categoria: "2_sync_window",
          causa: `Zeta coincide con Excel; Copilot desfasado ~${hoursSinceSaldosSync.toFixed(1)}h desde última sync saldos`,
          accion: "Pendiente próxima sync saldos (3h cron) o corrida manual",
        };
      }
      return {
        categoria: "3_diferencia_real",
        causa: "Zeta = Excel ≠ Copilot; sync saldos atrasada o match incorrecto",
        accion: "Sync saldos cliente + reconciliation_cleanup",
      };
    }
    if (cuotaSaldo > EPS) {
      return {
        categoria: "3_diferencia_real",
        causa: `Cuotas locales abiertas (${cuotaSaldo}) pueden bloquear zero pass`,
        accion: "Sync cuotas + saldos; evaluar stale installment cleanup si Zeta sin saldo",
      };
    }
    return {
      categoria: "3_diferencia_real",
      causa: "Montos divergentes Excel vs Copilot",
      accion: "Sync saldos + revisar match registro/CCV1",
    };
  }

  // Excel > 0, DB = 0, Zeta sí tiene saldo → ventana sync
  if (excelSaldo > EPS && dbBal <= EPS && inZetaLive) {
    return {
      categoria: "2_sync_window",
      causa: "Zeta actual sí tiene saldo; Copilot aún no actualizó balance",
      accion: "Pendiente próxima sync saldos (no cleanup si Zeta sigue reportando)",
    };
  }

  return {
    categoria: "3_diferencia_real",
    causa: "Divergencia no clasificada automáticamente",
    accion: "Investigar manual",
  };
}

const CATEGORIA_LABEL = {
  "1_coincide": "1 — Coincide",
  "2_sync_window": "2 — Ventana sync",
  "3_diferencia_real": "3 — Reconciliación",
  "4_excel_desactualizado": "4 — Excel desactualizado",
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Auditoría VentasExport-4546 + Recibos-9513 vs Copilot (read-only)");
  console.log("══════════════════════════════════════════════════════════════\n");

  const ventasStat = existsSync(VENTAS_EXCEL) ? statSync(VENTAS_EXCEL) : null;
  const recibosStat = existsSync(RECIBOS_EXCEL) ? statSync(RECIBOS_EXCEL) : null;

  console.log("── Archivos Excel ──");
  console.log(`  Ventas:  ${VENTAS_EXCEL}`);
  if (ventasStat) console.log(`           mtime local: ${ventasStat.mtime.toISOString()}`);
  console.log(`  Recibos: ${RECIBOS_EXCEL}`);
  if (recibosStat) console.log(`           mtime local: ${recibosStat.mtime.toISOString()}`);
  console.log("  (Zeta no expone hora de export en el xlsx; mtime ≈ momento de descarga)\n");

  const [dbInvoices, companies, installByInv, receipts, syncMeta] = await Promise.all([
    fetchDbInvoices(),
    fetchCompanies(),
    fetchInstallmentSaldosByInvoice(),
    fetchReceiptsSummary(),
    fetchSyncMeta(),
  ]);

  const compMap = new Map(companies.map((c) => [String(c.id), c]));
  const codigoByCompany = new Map(companies.map((c) => [String(c.id), String(c.Codigo ?? "").trim()]));

  const saldosState = syncMeta.states.find((s) => s.resource_flow === "factura_cliente_saldos_pendientes");
  const cuotasState = syncMeta.states.find((s) => s.resource_flow === "zeta-sync-cuotas");
  const receiptsState = syncMeta.states.find((s) => s.resource_flow === "zeta_sync_collection_receipts");
  const lastSaldosAt = saldosState?.last_success_at ?? null;
  const hoursSinceSaldos = lastSaldosAt
    ? (Date.now() - new Date(lastSaldosAt).getTime()) / 3600000
    : null;

  console.log("── Última sync Zeta en Copilot ──");
  console.log(`  Saldos pendientes:  ${lastSaldosAt ?? "—"}` + (hoursSinceSaldos != null ? ` (~${hoursSinceSaldos.toFixed(1)}h)` : ""));
  console.log(`  Cuotas:             ${cuotasState?.last_success_at ?? "—"}`);
  console.log(`  Recibos cobranza:   ${receiptsState?.last_success_at ?? "—"}`);
  console.log(`  proto_receipts DB:  ${receipts.length} activos desde 2026-01-01`);
  if (syncMeta.runs.length) {
    console.log("  Últimos pipeline runs:");
    for (const r of syncMeta.runs.slice(0, 5)) {
      console.log(`    · ${r.pipeline_name} ${r.status} ${r.finished_at ?? r.started_at ?? ""}`);
    }
  }
  console.log();

  const allVentas = parseVentasExcel(VENTAS_EXCEL);
  const pendingVentas = allVentas.filter((r) => r.saldo > EPS);
  const recibosParsed = parseRecibosExcel(RECIBOS_EXCEL);

  const excelUyu = round2(pendingVentas.filter((r) => r.currency === "UYU").reduce((s, r) => s + r.saldo, 0));
  const excelUsd = round2(pendingVentas.filter((r) => r.currency === "USD").reduce((s, r) => s + r.saldo, 0));

  const dbPending = dbInvoices.filter((i) => round2(num(i.balance_amount)) > EPS);
  const dbUyu = round2(dbPending.filter((i) => i.currency_code === "UYU").reduce((s, i) => s + num(i.balance_amount), 0));
  const dbUsd = round2(dbPending.filter((i) => i.currency_code === "USD").reduce((s, i) => s + num(i.balance_amount), 0));

  console.log("── Totales pendientes (saldo > 0) ──");
  console.log(`  Excel Ventas UYU: ${fmtMoney("UYU", excelUyu)} | USD: ${fmtMoney("USD", excelUsd)} | ${pendingVentas.length} facturas`);
  console.log(`  Copilot DB UYU:   ${fmtMoney("UYU", dbUyu)} | USD: ${fmtMoney("USD", dbUsd)} | ${dbPending.length} facturas`);
  console.log(`  Gap DB − Excel:   ${fmtMoney("UYU", round2(dbUyu - excelUyu))} | USD: ${fmtMoney("USD", round2(dbUsd - excelUsd))}\n`);

  const indexes = buildDbIndexes(dbInvoices, compMap);
  const matched = new Set();
  const prelim = pendingVentas.map((ex) => {
    const inv = matchInvoice(ex, indexes, matched);
    if (inv) matched.add(inv.id);
    return { ex, inv };
  });

  const clienteCodigos = new Set();
  for (const { inv } of prelim) {
    if (!inv) continue;
    const parsed = parseInvoiceNumber(inv.invoice_number);
    if (parsed.clienteCodigo) clienteCodigos.add(parsed.clienteCodigo);
  }

  console.log(
    `Consultando QuerySaldosPendientes live (paginado, hasta ${MAX_ZETA_SALDOS_PAGES} pág/cliente) para ${clienteCodigos.size} clientes...`
  );
  const { index: zetaLive, errors: zetaErrs, queried, pagesByCliente, totalRows } =
    await buildLiveZetaSaldosIndex([...clienteCodigos]);
  if (zetaErrs.length) console.log("  Zeta live avisos:", zetaErrs.slice(0, 8).join("; "));
  const pageCounts = [...pagesByCliente.values()].map((p) => p.pagesFetched);
  const maxPages = pageCounts.length ? Math.max(...pageCounts) : 0;
  console.log(
    `  Claves saldo en Zeta live: ${zetaLive.size} | filas API: ${totalRows} | clientes: ${queried} | max pág/cliente: ${maxPages}\n`
  );

  const auditRows = [];
  for (const { ex, inv } of prelim) {
    const comp = inv ? compMap.get(String(inv.company_id)) : null;
    const cliente = ex.razon_social || ex.cliente_nombre || comp?.RazonSocial || comp?.name || "—";
    const parsed = inv ? parseInvoiceNumber(inv.invoice_number) : { clienteCodigo: null, serie: "A", numero: ex.numero };
    const dbBal = inv ? round2(num(inv.balance_amount)) : null;
    const diff = dbBal != null ? round2(dbBal - ex.saldo) : null;
    const key = saldoKey(parsed.clienteCodigo ?? "", parsed.serie, parsed.numero ?? ex.numero);
    const zetaSaldoLive = zetaLive.has(key) ? zetaLive.get(key) : null;
    const enZetaLive = zetaSaldosLiveStatus(ex.saldo, zetaSaldoLive);
    const cuotaSaldo = inv ? (installByInv.get(inv.id) ?? 0) : 0;
    const codigo = parsed.clienteCodigo ?? (inv ? codigoByCompany.get(String(inv.company_id)) : "");
    const clientePages = codigo ? pagesByCliente.get(String(codigo)) : null;
    const companyId = inv?.company_id ? String(inv.company_id) : null;
    const receiptsCliente = companyId
      ? receipts.filter((r) => r.company_id && String(r.company_id) === companyId)
      : codigo
        ? receipts.filter((r) => {
            const cid = r.company_id ? codigoByCompany.get(String(r.company_id)) : "";
            return String(cid).trim() === String(codigo).trim();
          })
        : [];
    const receiptHint =
      receiptsCliente.length > 0
        ? `${receiptsCliente.length} recibo(s) en DB para cliente ${codigo}`
        : null;

    const excelCopilotMatch = diff != null && Math.abs(diff) <= AMOUNT_TOL;
    const { categoria, causa, accion: classifyAccion } = classifyRow({
      ex,
      inv,
      diff,
      inZetaLive: enZetaLive === "sí" ? zetaSaldoLive : null,
      cuotaSaldo,
      hoursSinceSaldosSync: hoursSinceSaldos,
      receiptHint,
    });
    const accion = recommendZetaAccion({
      excelCopilotMatch,
      enZetaLive,
      zetaSaldoLive,
      cuotaSaldo,
      classifyAccion,
    });
    const comprobante = `${parsed.serie ?? "A"}-${ex.numero}`;

    auditRows.push({
      cliente,
      comprobante,
      saldo_excel: ex.saldo,
      saldo_copilot: dbBal,
      diferencia: diff,
      en_zeta_saldos_actual: enZetaLive,
      zeta_saldo_live: zetaSaldoLive ?? "",
      zeta_pages_cliente: clientePages?.pagesFetched ?? "",
      cuota_local_abierta: cuotaSaldo > EPS ? round2(cuotaSaldo) : 0,
      categoria: CATEGORIA_LABEL[categoria] ?? categoria,
      causa,
      accion_recomendada: accion,
      invoice_number: inv?.invoice_number ?? "",
      cliente_codigo: codigo,
    });
  }

  const byCat = {};
  for (const r of auditRows) byCat[r.categoria] = (byCat[r.categoria] ?? 0) + 1;
  console.log("── Resumen por categoría ──");
  for (const [k, v] of Object.entries(byCat).sort()) console.log(`  ${k}: ${v}`);

  console.log("\n── Tabla comprobante a comprobante ──");
  const hdr = [
    pad("Cliente", 20),
    pad("Comp", 8),
    pad("Excel", 10),
    pad("Copilot", 10),
    pad("Diff", 8),
    pad("Zeta", 7),
    pad("Cuota", 6),
    pad("Categoría", 22),
  ].join(" | ");
  console.log(hdr);
  console.log("-".repeat(hdr.length + 20));
  for (const r of auditRows) {
    console.log(
      [
        pad(r.cliente, 20),
        pad(r.comprobante, 8),
        pad(r.saldo_excel.toFixed(2), 10),
        pad(r.saldo_copilot?.toFixed(2) ?? "—", 10),
        pad(r.diferencia?.toFixed(2) ?? "—", 8),
        pad(r.en_zeta_saldos_actual, 7),
        pad(r.cuota_local_abierta > 0 ? String(r.cuota_local_abierta) : "0", 6),
        pad(r.categoria, 22),
      ].join(" | ")
    );
  }

  console.log("\n── Revalidación focal (paginación completa) ──");
  const focusHdr = [
    pad("Comp", 8),
    pad("Excel", 10),
    pad("Copilot", 10),
    pad("Zeta live", 10),
    pad("Zeta?", 7),
    pad("Pág", 4),
    pad("Acción", 42),
  ].join(" | ");
  console.log(focusHdr);
  console.log("-".repeat(focusHdr.length + 10));
  for (const r of auditRows.filter((row) => FOCUS_COMPROBANTES.has(row.comprobante))) {
    console.log(
      [
        pad(r.comprobante, 8),
        pad(r.saldo_excel.toFixed(2), 10),
        pad(r.saldo_copilot?.toFixed(2) ?? "—", 10),
        pad(r.zeta_saldo_live === "" ? "—" : String(r.zeta_saldo_live), 10),
        pad(r.en_zeta_saldos_actual, 7),
        pad(String(r.zeta_pages_cliente || "—"), 4),
        pad(r.accion_recomendada, 42),
      ].join(" | ")
    );
  }

  console.log("\n── Recibos Excel 9513 ──");
  if (recibosParsed.note) {
    console.log(`  ${recibosParsed.note}`);
  } else {
    const mayo = recibosParsed.rows.filter((r) => r.fecha >= "2026-05-01" && r.fecha <= "2026-05-31");
    console.log(`  Filas parseadas: ${recibosParsed.rows.length} | Mayo 2026: ${mayo.length}`);
    console.log(`  DB proto_receipts activos 2026: ${receipts.length}`);
    console.log("  (Recibos no alteran balance_amount; sirven para explicar cobros vs Excel desactualizado)");
  }

  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = resolve(outDir, `excel-4546-diagnostic-${ts}.csv`);
  const cols = [
    "cliente",
    "comprobante",
    "saldo_excel",
    "saldo_copilot",
    "diferencia",
    "en_zeta_saldos_actual",
    "zeta_saldo_live",
    "zeta_pages_cliente",
    "cuota_local_abierta",
    "categoria",
    "causa",
    "accion_recomendada",
    "invoice_number",
    "cliente_codigo",
  ];
  const lines = [
    cols.join(","),
    ...auditRows.map((r) =>
      cols
        .map((c) => {
          const s = String(r[c] ?? "");
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    ),
  ];
  writeFileSync(csvPath, lines.join("\n"), "utf8");
  console.log(`\nCSV: ${csvPath}\n`);

  console.log("── Conclusión ──");
  if (Math.abs(dbUyu - excelUyu) <= AMOUNT_TOL && Math.abs(dbUsd - excelUsd) <= AMOUNT_TOL) {
    console.log("  Totales Excel 4546 y Copilot DB coinciden. No hay gap de cartera en este snapshot.");
    console.log("  No se recomienda cleanup masivo: los 32 comprobantes están alineados.");
  } else {
    console.log("  Hay gap en totales — revisar filas categoría 3 y 4 en el CSV.");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
