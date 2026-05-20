#!/usr/bin/env node
/**
 * FASE 1 — Diagnóstico de saldos faltantes en DB vs Excel/Zeta.
 *
 * Compara:
 *  1. Excel VentasExport (saldos pendientes Zeta — fuente de verdad del operador)
 *  2. proto_invoices.balance_amount (DB)
 *  3. proto_invoice_installments (suma de cuota_saldo vinculada a cada factura)
 *  4. zeta_sync_raw_payloads (últimas páginas de QuerySaldosPendientes por cliente)
 *  5. zeta_metadata (reconciliación: last_seen_in_zeta_at, missing_count, backfills)
 *
 * Para cada factura con discrepancia (Excel saldo > 0, DB balance < Excel − tolerancia):
 *  · Muestra todos los campos de diagnóstico
 *  · Determina si fue tocada por zero_pass, reconciliation, o tiene cuotas huérfanas
 *  · Clasifica probable_cause
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-balance-missing-in-db.mjs
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-balance-missing-in-db.mjs --excel path/to/file.xlsx
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-balance-missing-in-db.mjs --client-code 0
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-balance-missing-in-db.mjs --invoice-number ZETA:CCV1:0:2:A:2937
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-balance-missing-in-db.mjs --show-ok
 *
 * Flags:
 *   --excel <path>           Ruta al Excel. Default: Downloads/VentasExport-1237.xlsx
 *   --workspace <UUID>       Workspace. Default: WORKSPACE_COMPANY_ID
 *   --client-code <code>     Filtrar por clienteCodigo de Zeta (ej: 0)
 *   --invoice-number <n>     Filtrar por invoice_number exacto
 *   --show-ok                Incluir facturas OK en la salida detallada
 *   --raw-pages <N>          Cuántas páginas raw cargar por cliente. Default: 20
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ── Env & args ────────────────────────────────────────────────────────────────

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
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

const SHOW_OK = args.includes("--show-ok");
const EPS = 0.005;
const AMOUNT_TOL = 0.02;
const RAW_PAGES_LIMIT = Math.max(1, parseInt(argFlag("--raw-pages") ?? "20", 10));
const ORPHAN_AUTO_CLOSE_THRESHOLD = 7;
const SALDOS_FLOW = "factura_cliente_saldos_pendientes";
const SALDOS_OPERATION = "RESTFacturaClienteV4QuerySaldosPendientes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

const filterClientCode = argFlag("--client-code");
const filterInvoiceNumber = argFlag("--invoice-number");

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── Excel helpers ─────────────────────────────────────────────────────────────

function xlsxSerialToYmd(serial) {
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function normalizeCurrency(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "U$S" || s === "USD" || s === "US$" || s.includes("DOLAR")) return "USD";
  if (s === "$" || s === "UYU" || s === "UR$" || s.includes("PES")) return "UYU";
  return "UNKNOWN";
}

function normalizeRut(raw) {
  return String(raw ?? "").replace(/\D/g, "").trim();
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function norm(s) {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function resolveExcelPath() {
  const candidates = [
    argFlag("--excel"),
    process.env.AUDIT_EXCEL_PATH,
    "temp-audits/VentasExport-1237.xlsx",
    "VentasExport-1237.xlsx",
    resolve(process.env.USERPROFILE ?? "", "Downloads/VentasExport-1237.xlsx"),
    resolve(process.env.USERPROFILE ?? "", "Desktop/VentasExport-1237.xlsx"),
  ].filter(Boolean);
  for (const p of candidates) {
    const abs = resolve(process.cwd(), p);
    if (existsSync(abs)) return abs;
    if (existsSync(p)) return p;
  }
  return resolve(process.cwd(), candidates[0] ?? "temp-audits/VentasExport-1237.xlsx");
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
        headerRow: i,
        dataStart: i + 1,
        fecha,
        tipo: idx(["tipo"]),
        comprobante: idx(["comprobante"]),
        numero: idx(["nº", "no", "numero", "n°"]),
        estado_dgi: idx(["estado dgi", "estado"]),
        cliente: idx(["cliente"]),
        razon: idx(["razón social", "razon social"]),
        rut: idx(["rut", "r.u.n"]),
        moneda: idx(["moneda"]),
        total: idx(["total"]),
        saldo,
      };
    }
  }
  return null;
}

function parseExcel(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    const err = new Error(`Excel no encontrado: ${abs}`);
    err.code = "ENOENT_EXCEL";
    throw err;
  }
  const wb = XLSX.readFile(abs);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const cols = detectExcelColumns(all);
  if (!cols) throw new Error("No se detectó fila de encabezados con Fecha + Saldo");

  const rows = [];
  for (let i = cols.dataStart; i < all.length; i++) {
    const row = all[i];
    if (!row || row[cols.fecha] == null) continue;
    const fechaRaw = row[cols.fecha];
    if (typeof fechaRaw !== "number") continue;
    const numero_raw = typeof row[cols.numero] === "number"
      ? row[cols.numero]
      : Number(row[cols.numero]);
    rows.push({
      rowIndex: i,
      issue_date: xlsxSerialToYmd(fechaRaw),
      tipo: cols.tipo >= 0 ? String(row[cols.tipo] ?? "").trim() : "",
      comprobante: cols.comprobante >= 0 ? String(row[cols.comprobante] ?? "").trim() : "",
      numero: String(Number.isNaN(numero_raw) ? (row[cols.numero] ?? "") : numero_raw),
      estado_dgi: cols.estado_dgi >= 0 ? String(row[cols.estado_dgi] ?? "").trim() : "",
      cliente_nombre: cols.cliente >= 0 ? String(row[cols.cliente] ?? "").trim() : "",
      razon_social: cols.razon >= 0 ? String(row[cols.razon] ?? "").trim() : "",
      rut: cols.rut >= 0 ? normalizeRut(row[cols.rut]) : "",
      currency: normalizeCurrency(cols.moneda >= 0 ? String(row[cols.moneda] ?? "") : ""),
      total: cols.total >= 0 ? num(row[cols.total]) : num(row[cols.saldo]),
      saldo: num(row[cols.saldo]),
    });
  }
  return rows;
}

// ── Invoice metadata helpers ──────────────────────────────────────────────────

function parseInvoiceNumber(inv) {
  const p = String(inv).split(":");
  if (p[0] !== "ZETA") return { format: "unknown", numero: null, serie: null, clienteCodigo: null };
  if (p[1] === "CCV1" && p.length === 6) {
    return { format: "ccv1", clienteCodigo: p[2] ?? null, numero: p[5] ?? null, serie: p[4] ?? null };
  }
  if (p.length === 2 && /^\d+$/.test(p[1] ?? "")) {
    return { format: "registro", numero: p[1], serie: null, clienteCodigo: null };
  }
  return { format: "other", numero: null, serie: null, clienteCodigo: null };
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

function readReconciliationState(zetaMeta) {
  const rec = zetaMeta?.zeta_reconciliation;
  if (!rec || typeof rec !== "object") {
    return { missing_count: 0, last_seen_in_zeta_at: null, last_missing_detected_at: null, resolved_at: null, resolved_reason: null };
  }
  const mc = typeof rec.pending_sync_missing_count === "number" && rec.pending_sync_missing_count >= 0
    ? rec.pending_sync_missing_count
    : 0;
  return {
    missing_count: mc,
    last_seen_in_zeta_at: typeof rec.last_seen_in_zeta_at === "string" ? rec.last_seen_in_zeta_at : null,
    last_missing_detected_at: typeof rec.last_missing_detected_at === "string" ? rec.last_missing_detected_at : null,
    resolved_at: typeof rec.resolved_at === "string" ? rec.resolved_at : null,
    resolved_reason: typeof rec.resolved_reason === "string" ? rec.resolved_reason : null,
  };
}

function readBackfills(zetaMeta) {
  const bf = zetaMeta?.backfills;
  if (!bf || typeof bf !== "object") return null;
  return bf;
}

// ── Raw payload extraction ────────────────────────────────────────────────────

/**
 * Extrae RegistroIds de un payload_json de zeta_sync_raw_payloads.
 * Soporta policy "full-under-cap" (body.Response array) y "truncated" (preview_json_text parcial).
 * Retorna { rids: Set<string>, truncated: boolean }
 */
function extractRidsFromPayloadJson(payloadJson) {
  if (!payloadJson || typeof payloadJson !== "object") return { rids: new Set(), truncated: false };

  const policy = payloadJson._staging_policy ?? "";
  const rids = new Set();

  if (policy.includes("truncated")) {
    // Preview only — parse lo que se pueda de preview_json_text
    const preview = payloadJson.preview_json_text;
    if (typeof preview === "string") {
      for (const match of preview.matchAll(/"RegistroId"\s*:\s*"?(\d+)"?/g)) {
        rids.add(match[1]);
      }
      for (const match of preview.matchAll(/"registroId"\s*:\s*"?(\d+)"?/g)) {
        rids.add(match[1]);
      }
    }
    return { rids, truncated: true };
  }

  // Full payload: body.QuerySaldosPendientesOut.Response (real DB structure)
  const body = payloadJson.body;
  if (!body || typeof body !== "object") return { rids, truncated: false };

  const wrapper = body.QuerySaldosPendientesOut ?? body.querySaldosPendientesOut ?? body;
  let response = wrapper.Response ?? wrapper.response;
  if (typeof response === "string") {
    try { response = JSON.parse(response); } catch { response = null; }
  }
  if (!Array.isArray(response)) return { rids, truncated: false };

  for (const row of response) {
    if (!row || typeof row !== "object") continue;
    const rid = row.RegistroId ?? row.registroId;
    if (rid != null && String(rid).trim() !== "") rids.add(String(rid).trim());
  }
  return { rids, truncated: false };
}

// ── DB fetchers ───────────────────────────────────────────────────────────────

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
  return fetchAllPages("proto_invoices", (from, to) =>
    supabase
      .from("proto_invoices")
      .select("id, invoice_number, issue_date, total_amount, balance_amount, currency_code, status, company_id, zeta_metadata, is_active, due_date, updated_at")
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .order("id", { ascending: true })
      .range(from, to)
  );
}

async function fetchCompanies() {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, name, RazonSocial, RUT, Codigo, is_active")
    .eq("workspace_company_id", workspaceId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Suma cuota_saldo por invoice_id para todas las cuotas activas.
 * Retorna Map<invoice_id, saldo_sum>.
 * También retorna orphanCount (cuotas sin invoice_id).
 */
async function fetchInstallmentSaldos() {
  const rows = await fetchAllPages("proto_invoice_installments", (from, to) =>
    supabase
      .from("proto_invoice_installments")
      .select("id, invoice_id, cuota_saldo, cuota_numero")
      .eq("workspace_company_id", workspaceId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const byInvoice = new Map(); // invoice_id → saldo_sum
  let orphanCount = 0;
  for (const r of rows) {
    if (!r.invoice_id) { orphanCount++; continue; }
    const prev = byInvoice.get(r.invoice_id) ?? 0;
    byInvoice.set(r.invoice_id, round2(prev + num(r.cuota_saldo)));
  }
  return { byInvoice, orphanCount, totalInstallments: rows.length };
}

/**
 * Carga las últimas N páginas de raw saldos payloads de zeta_sync_raw_payloads.
 * Retorna { ridSet: Set<string>, hasTruncated: boolean, pagesLoaded: number, latestRunAt: string|null }
 */
async function fetchLatestSaldosRids() {
  const { data, error } = await supabase
    .from("zeta_sync_raw_payloads")
    .select("id, sync_run_id, chunk_index, payload_json, received_at")
    .eq("resource_flow", SALDOS_FLOW)
    .eq("zeta_operation", SALDOS_OPERATION)
    .order("received_at", { ascending: false })
    .limit(RAW_PAGES_LIMIT);

  if (error) {
    console.warn(`  WARN fetchLatestSaldosRids: ${error.message}`);
    return { ridSet: new Set(), hasTruncated: false, pagesLoaded: 0, latestRunAt: null };
  }

  const pages = data ?? [];
  const ridSet = new Set();
  let hasTruncated = false;
  let latestRunAt = null;

  for (const page of pages) {
    if (!latestRunAt) latestRunAt = page.received_at ?? null;
    const { rids, truncated } = extractRidsFromPayloadJson(page.payload_json);
    for (const rid of rids) ridSet.add(rid);
    if (truncated) hasTruncated = true;
  }

  return { ridSet, hasTruncated, pagesLoaded: pages.length, latestRunAt };
}

// ── Matching ──────────────────────────────────────────────────────────────────

function buildDbIndexes(invoices, compMap) {
  const byNumero = new Map();     // numero → inv[]
  const byDateTotal = new Map();  // date|total → inv[]
  const byRegistro = new Map();   // registro_id → inv

  for (const inv of invoices) {
    if (inv.is_active === false) continue;
    const parsed = parseInvoiceNumber(inv.invoice_number);
    if (parsed.numero) {
      const arr = byNumero.get(parsed.numero) ?? [];
      arr.push(inv);
      byNumero.set(parsed.numero, arr);
    }
    if (parsed.format === "registro" && parsed.numero) {
      byRegistro.set(parsed.numero, inv);
    }
    const k = `${String(inv.issue_date ?? "").slice(0, 10)}|${round2(num(inv.total_amount))}`;
    const arr2 = byDateTotal.get(k) ?? [];
    arr2.push(inv);
    byDateTotal.set(k, arr2);

    // Index by registro_id from metadata
    for (const rid of extractRegistroIds(inv.zeta_metadata)) {
      byRegistro.set(rid, inv);
    }
  }
  return { byNumero, byDateTotal, byRegistro, compMap, allInvoices: invoices };
}

function matchExcelRow(ex, indexes, matchedIds) {
  const { byNumero, byDateTotal, compMap } = indexes;
  let candidates = (byNumero.get(ex.numero) ?? []).filter((c) => !matchedIds.has(c.id));

  if (candidates.length === 0) {
    const k = `${ex.issue_date}|${round2(ex.total)}`;
    candidates = (byDateTotal.get(k) ?? []).filter((c) => !matchedIds.has(c.id));
    if (ex.rut) {
      candidates = candidates.filter((c) => {
        const comp = compMap.get(String(c.company_id));
        return comp && normalizeRut(comp.RUT) === ex.rut;
      });
    }
    if (candidates.length === 0 && ex.razon_social) {
      const nameNorm = norm(ex.razon_social);
      candidates = (indexes.allInvoices ?? []).filter((c) => {
        if (c.is_active === false || matchedIds.has(c.id)) return false;
        const comp = compMap.get(String(c.company_id));
        const n = norm(comp?.RazonSocial ?? comp?.name ?? "");
        return n && (n.includes(nameNorm) || nameNorm.includes(n));
      });
    }
  }

  if (candidates.length === 0) return { inv: null, note: "sin match" };

  if (candidates.length > 1 && ex.rut) {
    const byRut = candidates.filter((c) => {
      const comp = compMap.get(String(c.company_id));
      return comp && normalizeRut(comp.RUT) === ex.rut;
    });
    if (byRut.length > 0) candidates = byRut;
  }

  if (candidates.length > 1 && ex.razon_social) {
    const nameNorm = norm(ex.razon_social);
    const byName = candidates.filter((c) => {
      const comp = compMap.get(String(c.company_id));
      const n = norm(comp?.RazonSocial ?? comp?.name ?? "");
      return n && (n.includes(nameNorm) || nameNorm.includes(n));
    });
    if (byName.length > 0) candidates = byName;
  }

  if (candidates.length > 1) {
    const byTotal = candidates.filter((c) => Math.abs(num(c.total_amount) - ex.total) <= AMOUNT_TOL);
    if (byTotal.length > 0) candidates = byTotal;
  }

  return { inv: candidates[0] ?? null, note: candidates.length > 1 ? "ambiguo" : "" };
}

// ── Probable cause classification ─────────────────────────────────────────────

/**
 * Determina la causa probable de que balance_amount ≠ saldo_excel.
 *
 * Retorna un string codificado:
 *  zero_pass_orphan_blind_spot   — cuota_sum > 0 pero balance=0 (orphaned installments no bloquearon)
 *  in_payload_not_matched        — RegistroId en último payload pero balance=0 (match failure en pipeline)
 *  zero_pass_never_seen          — nunca apareció en saldos, zeroed por zero_pass
 *  zero_pass_miss_streak         — missing_count >= 1, zeroed por zero_pass antes del threshold
 *  reconciliation_auto_close     — missing_count >= 7, auto-close por reconciliation
 *  partial_mismatch              — saldo diferente pero >0 en ambos lados
 *  ok                            — balance == saldo_excel dentro de tolerancia
 *  falta_en_db                   — no hay factura en DB para este comprobante Excel
 *  unknown                       — no se puede determinar
 */
function classifyProbableCause({ inv, excelSaldo, cuotaSaldoSum, ridsInPayload, hasPayloadData }) {
  if (!inv) return "falta_en_db";

  const dbBal = round2(num(inv.balance_amount));
  const diff = round2(dbBal - excelSaldo);

  if (Math.abs(diff) <= AMOUNT_TOL) return "ok";

  const isZeroed = dbBal <= EPS && excelSaldo > EPS;
  const recState = readReconciliationState(inv.zeta_metadata);
  const invRids = extractRegistroIds(inv.zeta_metadata);
  const inPayload = hasPayloadData && invRids.some((r) => ridsInPayload.has(r));

  if (!isZeroed) return "partial_mismatch";

  // balance = 0, excel saldo > 0 — buscar causa
  if (cuotaSaldoSum !== null && cuotaSaldoSum > EPS) {
    return "zero_pass_orphan_blind_spot";
  }

  if (recState.missing_count >= ORPHAN_AUTO_CLOSE_THRESHOLD) {
    return "reconciliation_auto_close";
  }

  if (inPayload) {
    return "in_payload_not_matched";
  }

  if (recState.last_seen_in_zeta_at === null) {
    return "zero_pass_never_seen";
  }

  if (recState.missing_count >= 1) {
    return "zero_pass_miss_streak";
  }

  return "unknown";
}

// ── Display helpers ───────────────────────────────────────────────────────────

function pad(s, w) {
  const t = String(s ?? "");
  return t.length >= w ? t.slice(0, w - 1) + "…" : t.padEnd(w);
}

function fmtMoney(cur, n) {
  if (cur === "USD") return `U$S ${n.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`;
  return `$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const CAUSE_LABEL = {
  zero_pass_orphan_blind_spot:  "ORPHAN_BLIND_SPOT",
  in_payload_not_matched:       "IN_PAYLOAD_NO_MATCH",
  zero_pass_never_seen:         "ZERO_PASS_NEVER_SEEN",
  zero_pass_miss_streak:        "ZERO_PASS_MISS_STREAK",
  reconciliation_auto_close:    "RECONCIL_AUTO_CLOSE",
  partial_mismatch:             "PARTIAL_MISMATCH",
  ok:                           "OK",
  falta_en_db:                  "FALTA_EN_DB",
  unknown:                      "UNKNOWN",
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 1 — Diagnóstico saldos faltantes (DB vs Excel/Zeta)");
  console.log("═══════════════════════════════════════════════════════════");

  const excelPath = resolveExcelPath();
  console.log({ workspace: workspaceId, excelPath, rawPages: RAW_PAGES_LIMIT });
  console.log();

  // 1. DB
  console.log("Cargando datos DB...");
  const [dbInvoices, companies, { byInvoice: installSaldoByInvoice, orphanCount, totalInstallments }] =
    await Promise.all([fetchDbInvoices(), fetchCompanies(), fetchInstallmentSaldos()]);

  const compMap = new Map(companies.map((c) => [String(c.id), c]));
  console.log(`  proto_invoices:              ${dbInvoices.length} rows`);
  console.log(`  proto_invoice_installments:  ${totalInstallments} rows (orphans sin invoice_id: ${orphanCount})`);

  // 2. Raw saldos payloads
  console.log("\nCargando últimos raw saldos payloads...");
  const { ridSet: saldosRidSet, hasTruncated, pagesLoaded, latestRunAt } =
    await fetchLatestSaldosRids();
  console.log(`  Páginas cargadas: ${pagesLoaded}`);
  console.log(`  RegistroIds en payload: ${saldosRidSet.size}`);
  if (hasTruncated) console.log("  ⚠ Hay páginas truncadas — cobertura de RegistroIds puede ser incompleta");
  if (latestRunAt) console.log(`  Última página: ${latestRunAt}`);
  const hasPayloadData = pagesLoaded > 0 && saldosRidSet.size > 0;

  // 3. Excel
  let allExcel, pendingExcel;
  try {
    allExcel = parseExcel(excelPath);
    pendingExcel = allExcel.filter((r) => r.saldo > EPS);
  } catch (e) {
    if (e.code === "ENOENT_EXCEL") {
      console.error(`\n⚠ ${e.message}`);
      console.error("Colocá el Excel en temp-audits/ o pasá --excel <ruta>");
      console.log("\nContinuando sin Excel — mostrando solo DB con balance=0...\n");

      // Modo sin Excel: mostrar todas las facturas CCV1 con balance=0 que tienen cuotas
      const zeroInvs = dbInvoices.filter(
        (i) => i.is_active !== false && round2(num(i.balance_amount)) <= EPS
          && String(i.invoice_number).startsWith("ZETA:CCV1:")
      );
      for (const inv of zeroInvs) {
        const cuota = installSaldoByInvoice.get(inv.id) ?? null;
        if (cuota === null || cuota <= EPS) continue;
        const comp = compMap.get(String(inv.company_id));
        console.log({
          invoice_number: inv.invoice_number,
          company: comp?.RazonSocial ?? comp?.name,
          balance_db: 0,
          cuota_saldo_sum: cuota,
          cause: "zero_pass_orphan_blind_spot",
        });
      }
      return;
    }
    throw e;
  }

  console.log(`\nExcel: ${allExcel.length} filas, ${pendingExcel.length} con saldo>0`);

  // 4. Match + diagnóstico
  const indexes = buildDbIndexes(dbInvoices, compMap);
  const matchedIds = new Set();
  const auditRows = [];

  let filterCount = 0;
  for (const ex of pendingExcel) {
    // Filtros opcionales
    if (filterClientCode || filterInvoiceNumber) {
      // Se evaluará después del match
    }

    const { inv, note } = matchExcelRow(ex, indexes, matchedIds);
    if (inv) matchedIds.add(inv.id);

    if (filterInvoiceNumber && inv?.invoice_number !== filterInvoiceNumber) continue;
    if (filterClientCode) {
      const parsed = inv ? parseInvoiceNumber(inv.invoice_number) : null;
      if (parsed?.clienteCodigo !== filterClientCode) {
        if (!inv) continue; // no match y hay filtro, skip
        // else incluir aunque no coincida exacto para diagnóstico
      }
    }

    const comp = inv ? compMap.get(String(inv.company_id)) : null;
    const cliente = ex.razon_social || ex.cliente_nombre || comp?.RazonSocial || comp?.name || "—";
    const dbBal = inv?.balance_amount == null ? null : round2(num(inv.balance_amount));
    const diff = dbBal != null ? round2(dbBal - ex.saldo) : null;
    const cuotaSaldo = inv ? (installSaldoByInvoice.get(inv.id) ?? null) : null;
    const recState = inv ? readReconciliationState(inv.zeta_metadata) : null;
    const backfills = inv ? readBackfills(inv.zeta_metadata) : null;
    const invRids = inv ? extractRegistroIds(inv.zeta_metadata) : [];
    const inPayload = hasPayloadData && invRids.some((r) => saldosRidSet.has(r));
    const parsedNum = inv ? parseInvoiceNumber(inv.invoice_number) : null;

    const cause = classifyProbableCause({
      inv,
      excelSaldo: ex.saldo,
      cuotaSaldoSum: cuotaSaldo,
      ridsInPayload: saldosRidSet,
      hasPayloadData,
    });

    auditRows.push({
      cliente,
      numero: ex.numero,
      moneda: ex.currency,
      saldo_excel: ex.saldo,
      balance_db: dbBal,
      diff,
      cause,
      invoice_id: inv?.id ?? null,
      invoice_number: inv?.invoice_number ?? null,
      company_id: inv?.company_id ?? null,
      cliente_codigo: parsedNum?.clienteCodigo ?? null,
      status: inv?.status ?? null,
      is_active: inv?.is_active ?? null,
      updated_at: inv?.updated_at ?? null,
      issue_date: ex.issue_date,
      last_seen_in_zeta_at: recState?.last_seen_in_zeta_at ?? null,
      missing_count: recState?.missing_count ?? null,
      last_missing_detected_at: recState?.last_missing_detected_at ?? null,
      resolved_at: recState?.resolved_at ?? null,
      resolved_reason: recState?.resolved_reason ?? null,
      cuota_saldo_sum: cuotaSaldo,
      in_last_payload: hasPayloadData ? inPayload : null,
      registro_ids: invRids.join(","),
      backfills: backfills ? JSON.stringify(backfills) : null,
      match_note: note,
    });
    filterCount++;
  }

  // DB con balance > 0 no presentes en Excel (sobrantes)
  for (const inv of dbInvoices) {
    if (inv.is_active === false) continue;
    const bal = round2(num(inv.balance_amount));
    if (bal <= EPS || matchedIds.has(inv.id)) continue;
    const parsed = parseInvoiceNumber(inv.invoice_number);
    if (!parsed.numero) continue;
    const comp = compMap.get(String(inv.company_id));
    const cuotaSaldo = installSaldoByInvoice.get(inv.id) ?? null;
    const recState = readReconciliationState(inv.zeta_metadata);
    const invRids = extractRegistroIds(inv.zeta_metadata);
    const inPayload = hasPayloadData && invRids.some((r) => saldosRidSet.has(r));

    auditRows.push({
      cliente: comp?.RazonSocial ?? comp?.name ?? inv.company_id,
      numero: parsed.numero,
      moneda: String(inv.currency_code ?? "?"),
      saldo_excel: 0,
      balance_db: bal,
      diff: round2(bal),
      cause: "sobrante_db",
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      company_id: inv.company_id,
      cliente_codigo: parsed.clienteCodigo,
      status: inv.status,
      is_active: inv.is_active,
      updated_at: inv.updated_at,
      issue_date: String(inv.issue_date ?? "").slice(0, 10),
      last_seen_in_zeta_at: recState.last_seen_in_zeta_at,
      missing_count: recState.missing_count,
      last_missing_detected_at: recState.last_missing_detected_at,
      resolved_at: recState.resolved_at,
      resolved_reason: recState.resolved_reason,
      cuota_saldo_sum: cuotaSaldo,
      in_last_payload: hasPayloadData ? inPayload : null,
      registro_ids: invRids.join(","),
      backfills: null,
      match_note: "sobrante DB con saldo, ausente Excel",
    });
  }

  // ── Resumen ──

  const byCause = {};
  for (const r of auditRows) {
    byCause[r.cause] = (byCause[r.cause] ?? 0) + 1;
  }
  const issues = auditRows.filter((r) => r.cause !== "ok" && r.cause !== "sobrante_db");
  const critical = auditRows.filter((r) =>
    ["zero_pass_orphan_blind_spot", "in_payload_not_matched", "reconciliation_auto_close"].includes(r.cause)
  );

  const excelUyu = round2(pendingExcel.filter((r) => r.currency === "UYU").reduce((s, r) => s + r.saldo, 0));
  const excelUsd = round2(pendingExcel.filter((r) => r.currency === "USD").reduce((s, r) => s + r.saldo, 0));
  const dbPending = dbInvoices.filter((i) => i.is_active !== false && round2(num(i.balance_amount)) > EPS);
  const dbUyu = round2(dbPending.filter((i) => i.currency_code === "UYU").reduce((s, i) => s + num(i.balance_amount), 0));
  const dbUsd = round2(dbPending.filter((i) => i.currency_code === "USD").reduce((s, i) => s + num(i.balance_amount), 0));

  console.log("\n── Totales ───────────────────────────────────────────────");
  console.log(`  Excel pendientes:  ${pendingExcel.length} | UYU ${fmtMoney("UYU", excelUyu)} | USD ${fmtMoney("USD", excelUsd)}`);
  console.log(`  DB pendientes:     ${dbPending.length} | UYU ${fmtMoney("UYU", dbUyu)} | USD ${fmtMoney("USD", dbUsd)}`);
  console.log(`  Gap UYU (DB-Excel): ${fmtMoney("UYU", round2(dbUyu - excelUyu))}`);
  console.log(`  Gap USD (DB-Excel): ${fmtMoney("USD", round2(dbUsd - excelUsd))}`);
  console.log(`  Gap facturas:       ${dbPending.length - pendingExcel.length}`);

  console.log("\n── Por causa ─────────────────────────────────────────────");
  const causeOrder = [
    "zero_pass_orphan_blind_spot", "in_payload_not_matched", "reconciliation_auto_close",
    "zero_pass_miss_streak", "zero_pass_never_seen",
    "partial_mismatch", "falta_en_db", "sobrante_db", "unknown", "ok",
  ];
  for (const cause of [...causeOrder, ...Object.keys(byCause).filter((c) => !causeOrder.includes(c))]) {
    if (!byCause[cause]) continue;
    const label = CAUSE_LABEL[cause] ?? cause;
    const urgency = ["zero_pass_orphan_blind_spot", "in_payload_not_matched", "reconciliation_auto_close"].includes(cause) ? " ⚠ CRÍTICO" : "";
    console.log(`  ${pad(label, 28)} ${byCause[cause]}${urgency}`);
  }
  console.log(`\n  TOTAL issues: ${issues.length} | Críticos: ${critical.length}`);

  // ── Detalle por factura ──

  const toShow = SHOW_OK ? auditRows : auditRows.filter((r) => r.cause !== "ok");
  const sorted = [...toShow].sort((a, b) => {
    const o = (c) => causeOrder.indexOf(c) >= 0 ? causeOrder.indexOf(c) : 99;
    return o(a.cause) - o(b.cause);
  });

  if (sorted.length > 0) {
    console.log("\n── Detalle por comprobante ───────────────────────────────");
    for (const r of sorted) {
      const balStr = r.balance_db == null ? "—" : r.balance_db.toFixed(2);
      const diffStr = r.diff == null ? "—" : (r.diff >= 0 ? "+" : "") + r.diff.toFixed(2);
      const causeLabel = CAUSE_LABEL[r.cause] ?? r.cause;
      console.log(
        `  [${causeLabel}] ${pad(r.cliente, 24)} Nº${r.numero} ${r.moneda} ` +
        `Excel:${r.saldo_excel.toFixed(2)} DB:${balStr} Diff:${diffStr}`
      );
      if (r.invoice_number) {
        console.log(`    invoice_number:     ${r.invoice_number}`);
        console.log(`    invoice_id:         ${r.invoice_id ?? "—"}`);
        console.log(`    status:             ${r.status ?? "—"}  updated_at: ${r.updated_at ? String(r.updated_at).slice(0, 19) : "—"}`);
        console.log(`    last_seen_zeta:     ${r.last_seen_in_zeta_at ?? "null"}`);
        console.log(`    missing_count:      ${r.missing_count ?? 0}  last_missing: ${r.last_missing_detected_at ?? "null"}`);
        if (r.resolved_at) console.log(`    resolved_at:        ${r.resolved_at}  reason: ${r.resolved_reason ?? "—"}`);
        console.log(`    cuota_saldo_sum:    ${r.cuota_saldo_sum == null ? "sin cuotas" : r.cuota_saldo_sum.toFixed(2)}`);
        console.log(`    in_last_payload:    ${r.in_last_payload == null ? "no data" : r.in_last_payload ? "SÍ" : "NO"}`);
        if (r.registro_ids) console.log(`    registro_ids:       ${r.registro_ids}`);
        if (r.backfills) console.log(`    backfills:          ${r.backfills}`);
        if (r.match_note) console.log(`    note:               ${r.match_note}`);
      }
    }
  }

  // ── Diagnóstico causas raíz ──

  console.log("\n── Diagnóstico causas raíz ───────────────────────────────");
  const blindSpotCount = byCause["zero_pass_orphan_blind_spot"] ?? 0;
  const inPayloadNoMatch = byCause["in_payload_not_matched"] ?? 0;
  const autoClose = byCause["reconciliation_auto_close"] ?? 0;
  const neverSeen = byCause["zero_pass_never_seen"] ?? 0;
  const missStreak = byCause["zero_pass_miss_streak"] ?? 0;

  if (blindSpotCount > 0) {
    console.log(`\n  [ORPHAN_BLIND_SPOT x${blindSpotCount}]`);
    console.log("  → cuota_saldo_sum > 0 pero balance_amount = 0");
    console.log("  → Las cuotas eran huérfanas (invoice_id=NULL) cuando corrió el zero_pass.");
    console.log("  → sumOpenInstallmentSaldoForInvoice devolvió 0 → zero_pass no fue bloqueado.");
    console.log("  → Fix: backfill-balance-from-zeta-saldos.mjs para restaurar balance desde Zeta.");
  }
  if (inPayloadNoMatch > 0) {
    console.log(`\n  [IN_PAYLOAD_NO_MATCH x${inPayloadNoMatch}]`);
    console.log("  → RegistroId presente en último raw payload pero balance_amount = 0");
    console.log("  → persistZetaInvoice no hizo match de la factura en DB.");
    console.log("  → Causa probable: registro_id en metadata no coincide con path de búsqueda.");
    console.log("  → Verificar: zeta-proto-invoice-registro-match.ts paths vs zeta_metadata real.");
  }
  if (autoClose > 0) {
    console.log(`\n  [RECONCIL_AUTO_CLOSE x${autoClose}]`);
    console.log(`  → missing_count >= ${ORPHAN_AUTO_CLOSE_THRESHOLD}: reconcileMissingPendingInvoices auto-cerró la factura.`);
    console.log("  → Fix: restaurar balance solo si Zeta aún devuelve saldo > 0 en QuerySaldosPendientes.");
  }
  if (neverSeen > 0) {
    console.log(`\n  [ZERO_PASS_NEVER_SEEN x${neverSeen}]`);
    console.log("  → last_seen_in_zeta_at = null: la factura nunca apareció en QuerySaldosPendientes.");
    console.log("  → Puede ser: factura pre-operacional, format no ZETA:CCV1:*, o pipeline falló siempre.");
  }
  if (missStreak > 0) {
    console.log(`\n  [ZERO_PASS_MISS_STREAK x${missStreak}]`);
    console.log("  → missing_count >= 1: factura no aparece en Zeta respuesta → zero_pass la zeroó.");
    console.log("  → Verificar si Zeta realmente muestra saldo en portal web.");
  }

  // ── CSV ──

  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = resolve(outDir, `balance-missing-diagnosis-${ts}.csv`);

  const csvHeader = [
    "causa", "cliente", "numero", "moneda", "saldo_excel", "balance_db", "diferencia",
    "invoice_number", "invoice_id", "company_id", "cliente_codigo", "status", "updated_at",
    "issue_date", "last_seen_in_zeta_at", "missing_count", "last_missing_detected_at",
    "resolved_at", "resolved_reason", "cuota_saldo_sum", "in_last_payload",
    "registro_ids", "backfills", "match_note"
  ].join(",") + "\n";

  const csvBody = sorted.map((r) =>
    [
      r.cause, r.cliente, r.numero, r.moneda,
      r.saldo_excel, r.balance_db ?? "", r.diff ?? "",
      r.invoice_number ?? "", r.invoice_id ?? "", r.company_id ?? "", r.cliente_codigo ?? "",
      r.status ?? "", r.updated_at ?? "", r.issue_date,
      r.last_seen_in_zeta_at ?? "", r.missing_count ?? "",
      r.last_missing_detected_at ?? "", r.resolved_at ?? "", r.resolved_reason ?? "",
      r.cuota_saldo_sum ?? "", r.in_last_payload ?? "",
      r.registro_ids ?? "", r.backfills ?? "", r.match_note ?? "",
    ]
      .map((v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(",")
  ).join("\n");

  writeFileSync(csvPath, csvHeader + csvBody, "utf8");
  console.log(`\nCSV: ${csvPath}`);
  console.log();

  if (critical.length > 0) {
    console.log(`⚠ ${critical.length} facturas críticas requieren backfill de balance.`);
    console.log("  Próximo paso: scripts/backfill-balance-from-zeta-saldos.mjs");
  } else if (issues.length === 0) {
    console.log("✓ Sin discrepancias críticas detectadas.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
