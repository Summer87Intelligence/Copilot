#!/usr/bin/env node
/**
 * Compara VentasExport (Excel Zeta) vs proto_invoices.balance_amount — solo saldos pendientes.
 *
 * Uso:
 *   node --env-file=.env.local scripts/audit-excel-pending-vs-db.mjs
 *   node --env-file=.env.local scripts/audit-excel-pending-vs-db.mjs --excel temp-audits/VentasExport-1237.xlsx
 *
 * Env:
 *   AUDIT_EXCEL_PATH, WORKSPACE_COMPANY_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Salida:
 *   - Tabla en consola (comprobante a comprobante)
 *   - CSV en temp-audits/output/excel-pending-vs-db-<timestamp>.csv
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const AMOUNT_TOL = 0.02;
const EPS = 0.005;
const CFE_NC_TIPOS = new Set([
  102, 112, 122, 132, 142, 182, 202, 212, 222, 232, 242, 282,
]);

const args = process.argv.slice(2);
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

const EXPECTED = {
  uyu: 196_731,
  usd: 7_835.41,
  clientMoneda: 28,
  invoices: 40,
};

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

const excelPath = resolveExcelPath();
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Excel parse (mismo layout que audit-reconciliation-2026)
// ---------------------------------------------------------------------------

function xlsxSerialToYmd(serial) {
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
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

/**
 * Detecta layout VentasExport (7826 legacy vs 1237+ compacto).
 * 1237: Fecha,Tipo,Comprobante,Nº,Estado DGI,Emitida,Cliente,Moneda,Total,Saldo (sin RUT)
 * 7826: + Razón social, RUT, cotización — saldo en col 12
 */
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
  if (!cols) {
    throw new Error("No se detectó fila de encabezados con Fecha + Saldo");
  }

  const rows = [];
  for (let i = cols.dataStart; i < all.length; i++) {
    const row = all[i];
    if (!row || row[cols.fecha] == null) continue;
    const fechaRaw = row[cols.fecha];
    if (typeof fechaRaw !== "number") continue;
    const numero_raw = typeof row[cols.numero] === "number" ? row[cols.numero] : Number(row[cols.numero]);
    const saldo = num(row[cols.saldo]);
    const total = cols.total >= 0 ? num(row[cols.total]) : saldo;
    const tipo = cols.tipo >= 0 ? String(row[cols.tipo] ?? "").trim() : "";
    const cliente =
      cols.cliente >= 0 ? String(row[cols.cliente] ?? "").trim() : "";
    const razon =
      cols.razon >= 0 ? String(row[cols.razon] ?? "").trim() : cliente;
    rows.push({
      rowIndex: i,
      issue_date: xlsxSerialToYmd(fechaRaw),
      tipo,
      comprobante: cols.comprobante >= 0 ? String(row[cols.comprobante] ?? "").trim() : "",
      numero: String(Number.isNaN(numero_raw) ? row[cols.numero] ?? "" : numero_raw),
      estado_dgi: cols.estado_dgi >= 0 ? String(row[cols.estado_dgi] ?? "").trim() : "",
      cliente_nombre: cliente,
      razon_social: razon,
      rut: cols.rut >= 0 ? normalizeRut(row[cols.rut]) : "",
      currency: normalizeCurrency(cols.moneda >= 0 ? String(row[cols.moneda] ?? "") : ""),
      total,
      saldo,
      isNcTipo: /nota\s*de\s*cr[eé]dito|nc\b/i.test(tipo),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// DB + metadata
// ---------------------------------------------------------------------------

function readCfeTipo(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1 = metadata.zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const raw = v1.cfe_tipo ?? v1.cfeTipo ?? v1.CFETipo;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function isCreditNoteMeta(metadata) {
  const t = readCfeTipo(metadata);
  return t !== null && CFE_NC_TIPOS.has(t);
}

function parseInvoiceNumber(inv) {
  const p = String(inv).split(":");
  if (p[0] !== "ZETA") return { format: "unknown", numero: null, serie: null };
  if (p[1] === "CCV1" && p.length === 6) {
    return { format: "ccv1", numero: p[5] ?? null, serie: p[4] ?? null };
  }
  if (p.length === 2 && /^\d+$/.test(p[1] ?? "")) {
    return { format: "registro", numero: p[1], serie: null };
  }
  return { format: "other", numero: null, serie: null };
}

async function fetchDbInvoices(supabase) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select(
        "id, invoice_number, issue_date, total_amount, balance_amount, currency_code, status, company_id, zeta_metadata, is_active"
      )
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchCompanies(supabase) {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, name, RazonSocial, RUT, Codigo, is_active")
    .eq("workspace_company_id", workspaceId);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function dbInvoicesFromIndexes(indexes) {
  const seen = new Set();
  const out = [];
  for (const arr of indexes.byNumero.values()) {
    for (const inv of arr) {
      if (!seen.has(inv.id)) {
        seen.add(inv.id);
        out.push(inv);
      }
    }
  }
  for (const inv of indexes.byRegistro.values()) {
    if (!seen.has(inv.id)) {
      seen.add(inv.id);
      out.push(inv);
    }
  }
  return out;
}

function buildDbIndexes(invoices, compMap) {
  const byNumero = new Map();
  const byDateTotal = new Map();
  const byRegistro = new Map();

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
    const k = `${String(inv.issue_date).slice(0, 10)}|${round2(num(inv.total_amount))}`;
    const arr2 = byDateTotal.get(k) ?? [];
    arr2.push(inv);
    byDateTotal.set(k, arr2);

    const meta = inv.zeta_metadata;
    if (meta && typeof meta === "object") {
      const v1 = meta.zeta_customer_voucher_v1;
      if (v1 && typeof v1 === "object") {
        const reg = String(v1.zeta_registro_id ?? v1.registro_id ?? "").trim();
        if (reg) byRegistro.set(reg, inv);
      }
    }
  }

  return { byNumero, byDateTotal, byRegistro, compMap, allInvoices: invoices };
}

function matchExcelRow(ex, indexes, matchedIds) {
  const { byNumero, byDateTotal, byRegistro } = indexes;

  let candidates = (byNumero.get(ex.numero) ?? []).filter((c) => !matchedIds.has(c.id));

  if (candidates.length === 0) {
    const fbKey = `${ex.issue_date}|${round2(ex.total)}`;
    candidates = (byDateTotal.get(fbKey) ?? []).filter((c) => !matchedIds.has(c.id));
    if (ex.rut) {
      candidates = candidates.filter((c) => {
        const comp = indexes.compMap.get(c.company_id);
        return comp && normalizeRut(comp.RUT) === ex.rut;
      });
    }
    if (candidates.length === 0 && ex.razon_social) {
      const nameNorm = norm(ex.razon_social);
      candidates = (indexes.allInvoices ?? []).filter((c) => {
        if (c.is_active === false) return false;
        if (matchedIds.has(c.id)) return false;
        const comp = indexes.compMap.get(c.company_id);
        const n = norm(comp?.RazonSocial ?? comp?.name ?? "");
        return n && (n.includes(nameNorm) || nameNorm.includes(n));
      });
    }
  }

  if (candidates.length === 0) {
    return { inv: null, note: "sin match por numero/fecha" };
  }

  if (candidates.length > 1 && ex.rut) {
    const byRut = candidates.filter((c) => {
      const comp = indexes.compMap.get(c.company_id);
      return comp && normalizeRut(comp.RUT) === ex.rut;
    });
    if (byRut.length === 1) candidates = byRut;
  }

  if (candidates.length > 1 && ex.razon_social) {
    const nameNorm = norm(ex.razon_social);
    const byName = candidates.filter((c) => {
      const comp = indexes.compMap.get(c.company_id);
      const n = norm(comp?.RazonSocial ?? comp?.name ?? "");
      return n && (n.includes(nameNorm) || nameNorm.includes(n));
    });
    if (byName.length === 1) candidates = byName;
  }

  if (candidates.length > 1) {
    const byTotal = candidates.filter(
      (c) => Math.abs(num(c.total_amount) - ex.total) <= AMOUNT_TOL
    );
    if (byTotal.length === 1) candidates = byTotal;
  }

  return { inv: candidates[0] ?? null, note: candidates.length > 1 ? "ambiguo" : "" };
}

function classifyRow(ex, dbInv, comp) {
  if (!dbInv) {
    return "falta";
  }

  const dbBal = dbInv.balance_amount == null ? null : round2(num(dbInv.balance_amount));
  const dbCur = String(dbInv.currency_code ?? "").trim().toUpperCase();
  const isNcDb = isCreditNoteMeta(dbInv.zeta_metadata);
  const excelSaldo = round2(ex.saldo);

  if (ex.isNcTipo && !isNcDb) {
    return "NC mal aplicada";
  }
  if (isNcDb && excelSaldo > EPS) {
    return "NC mal aplicada";
  }

  if (ex.currency !== "UNKNOWN" && dbCur && ex.currency !== dbCur) {
    return "moneda mal";
  }

  if (dbBal == null) {
    return "saldo mal";
  }

  if (Math.abs(dbBal - excelSaldo) <= AMOUNT_TOL) {
    return "OK";
  }

  if (dbBal <= EPS && excelSaldo > EPS) {
    return "saldo mal";
  }

  if (dbBal > EPS && excelSaldo <= EPS) {
    return "saldo mal";
  }

  return "saldo mal";
}

function pad(s, w) {
  const t = String(s ?? "");
  return t.length >= w ? t.slice(0, w - 1) + "…" : t.padEnd(w);
}

function fmtMoney(cur, n) {
  if (cur === "USD") return `U$S ${n.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`;
  return `$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!url || !key || !workspaceId) {
    console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
    process.exit(1);
  }

  console.log("\n══ Excel pendientes vs proto_invoices.balance_amount ══\n");
  console.log(`Excel:     ${excelPath}`);
  console.log(`Workspace: ${workspaceId}\n`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const companies = await fetchCompanies(supabase);
  const compMap = new Map(companies.map((c) => [String(c.id), c]));
  const dbInvoices = await fetchDbInvoices(supabase);

  const dbPending = dbInvoices.filter(
    (i) => i.is_active !== false && round2(num(i.balance_amount)) > EPS
  );
  const dbUyu = round2(
    dbPending.filter((i) => i.currency_code === "UYU").reduce((s, i) => s + num(i.balance_amount), 0)
  );
  const dbUsd = round2(
    dbPending.filter((i) => i.currency_code === "USD").reduce((s, i) => s + num(i.balance_amount), 0)
  );
  const dbClientMoneda = new Set(
    dbPending.map((i) => {
      const c = compMap.get(String(i.company_id));
      return `${normalizeRut(c?.RUT) || c?.name}|${i.currency_code}`;
    })
  );

  console.log("── Referencia Excel (esperado por operador) ──");
  console.log(
    `  UYU ${fmtMoney("UYU", EXPECTED.uyu)} | USD ${fmtMoney("USD", EXPECTED.usd)} | ${EXPECTED.clientMoneda} clientes/moneda | ${EXPECTED.invoices} facturas`
  );
  console.log("\n── Totales DB actuales (balance_amount>0) ──");
  console.log(`  Facturas pendientes: ${dbPending.length}`);
  console.log(`  Clientes/moneda:     ${dbClientMoneda.size}`);
  console.log(`  Saldo UYU:           ${fmtMoney("UYU", dbUyu)}`);
  console.log(`  Saldo USD:           ${fmtMoney("USD", dbUsd)}`);
  console.log(`  Gap vs esperado UYU: ${fmtMoney("UYU", round2(dbUyu - EXPECTED.uyu))}`);
  console.log(`  Gap vs esperado USD: ${fmtMoney("USD", round2(dbUsd - EXPECTED.usd))}`);
  console.log(`  Gap facturas:        ${dbPending.length - EXPECTED.invoices}`);
  console.log(`  Gap clientes/mon:    ${dbClientMoneda.size - EXPECTED.clientMoneda}\n`);

  let allExcel;
  let pending;
  try {
    allExcel = parseExcel(excelPath);
    pending = allExcel.filter((r) => r.saldo > EPS);
  } catch (e) {
    if (e.code === "ENOENT_EXCEL") {
      console.error(`⚠ ${e.message}`);
      console.error("\nColocá VentasExport-1237.xlsx en temp-audits/ o pasá --excel <ruta>");
      console.error("Re-ejecutá para el match comprobante a comprobante.\n");
      process.exit(2);
    }
    throw e;
  }

  const indexes = buildDbIndexes(dbInvoices, compMap);
  indexes.compMap = compMap;

  const matchedIds = new Set();
  const auditRows = [];

  for (const ex of pending) {
    const { inv, note } = matchExcelRow(ex, indexes, matchedIds);
    if (inv) matchedIds.add(inv.id);
    const comp = inv ? compMap.get(String(inv.company_id)) : null;
    const cliente = ex.razon_social || ex.cliente_nombre || comp?.RazonSocial || comp?.name || "—";
    const dbBal = inv?.balance_amount == null ? null : round2(num(inv.balance_amount));
    const diff = inv && dbBal != null ? round2(dbBal - ex.saldo) : null;
    const estado = classifyRow(ex, inv, comp);

    auditRows.push({
      cliente,
      numero: ex.numero,
      moneda: ex.currency,
      saldoExcel: ex.saldo,
      balanceDb: dbBal,
      diff,
      estado,
      invoice_number: inv?.invoice_number ?? "",
      issue_date: ex.issue_date,
      tipo: ex.tipo,
      rut: ex.rut,
      match_note: note,
      db_nc: inv ? isCreditNoteMeta(inv.zeta_metadata) : false,
    });
  }

  // DB con saldo > 0 no presentes en Excel
  const excelKeys = new Set(
    pending.map((ex) => `${ex.numero}|${ex.issue_date}|${round2(ex.total)}`)
  );
  for (const inv of dbInvoices) {
    if (inv.is_active === false) continue;
    const bal = round2(num(inv.balance_amount));
    if (bal <= EPS) continue;
    if (matchedIds.has(inv.id)) continue;
    const parsed = parseInvoiceNumber(inv.invoice_number);
    const comp = compMap.get(String(inv.company_id));
    const k = `${parsed.numero ?? ""}|${String(inv.issue_date).slice(0, 10)}|${round2(num(inv.total_amount))}`;
    auditRows.push({
      cliente: comp?.RazonSocial ?? comp?.name ?? inv.company_id,
      numero: parsed.numero ?? "?",
      moneda: String(inv.currency_code ?? "?"),
      saldoExcel: 0,
      balanceDb: bal,
      diff: round2(bal),
      estado: "falta",
      invoice_number: inv.invoice_number,
      issue_date: String(inv.issue_date).slice(0, 10),
      tipo: "(solo DB)",
      rut: normalizeRut(comp?.RUT),
      match_note: "sobrante DB con saldo, ausente Excel",
      db_nc: isCreditNoteMeta(inv.zeta_metadata),
    });
  }

  // Totales Excel pendientes
  const excelUyu = round2(pending.filter((r) => r.currency === "UYU").reduce((s, r) => s + r.saldo, 0));
  const excelUsd = round2(pending.filter((r) => r.currency === "USD").reduce((s, r) => s + r.saldo, 0));
  const clientMoneda = new Set(
    pending.map((r) => `${r.rut || r.razon_social}|${r.currency}`)
  );

  console.log("── Totales Excel (filas saldo>0) ──");
  console.log(`  Facturas pendientes: ${pending.length}`);
  console.log(`  Clientes/moneda:     ${clientMoneda.size}`);
  console.log(`  Saldo UYU:           ${fmtMoney("UYU", excelUyu)}`);
  console.log(`  Saldo USD:           ${fmtMoney("USD", excelUsd)}`);

  console.log("\n── Totales DB (balance_amount>0) ──");
  console.log(`  Facturas pendientes: ${dbPending.length}`);
  console.log(`  Clientes/moneda:     ${dbClientMoneda.size}`);
  console.log(`  Saldo UYU:           ${fmtMoney("UYU", dbUyu)}`);
  console.log(`  Saldo USD:           ${fmtMoney("USD", dbUsd)}`);
  console.log(`  Gap UYU (DB-Excel):  ${fmtMoney("UYU", round2(dbUyu - excelUyu))}`);
  console.log(`  Gap USD (DB-Excel):  ${fmtMoney("USD", round2(dbUsd - excelUsd))}`);

  const byEstado = {};
  for (const r of auditRows) {
    byEstado[r.estado] = (byEstado[r.estado] ?? 0) + 1;
  }
  console.log("\n── Por estado ──");
  for (const [k, v] of Object.entries(byEstado).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  const hdr = [
    pad("Cliente", 22),
    pad("Nº", 6),
    pad("Mon", 4),
    pad("Saldo Excel", 12),
    pad("balance DB", 12),
    pad("Diff", 10),
    pad("Estado", 16),
  ].join(" | ");
  console.log(`\n── Comprobante a comprobante ──\n${hdr}`);
  console.log("-".repeat(hdr.length));

  const sorted = [...auditRows].sort((a, b) => {
    const o = { falta: 0, "saldo mal": 1, "moneda mal": 2, "NC mal aplicada": 3, OK: 4 };
    return (o[a.estado] ?? 5) - (o[b.estado] ?? 5);
  });

  for (const r of sorted) {
    console.log(
      [
        pad(r.cliente, 22),
        pad(r.numero, 6),
        pad(r.moneda, 4),
        pad(r.saldoExcel.toFixed(2), 12),
        pad(r.balanceDb == null ? "—" : r.balanceDb.toFixed(2), 12),
        pad(r.diff == null ? "—" : r.diff.toFixed(2), 10),
        pad(r.estado, 16),
      ].join(" | ")
    );
    if (r.estado !== "OK" && r.invoice_number) {
      console.log(`      └ ${r.invoice_number} | ${r.match_note}`);
    }
  }

  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = resolve(outDir, `excel-pending-vs-db-${ts}.csv`);
  const csvHeader =
    "cliente,numero,moneda,saldo_excel,balance_db,diferencia,estado,invoice_number,issue_date,tipo,rut,match_note,db_es_nc\n";
  const csvBody = sorted
    .map((r) =>
      [
        r.cliente,
        r.numero,
        r.moneda,
        r.saldoExcel,
        r.balanceDb ?? "",
        r.diff ?? "",
        r.estado,
        r.invoice_number,
        r.issue_date,
        r.tipo,
        r.rut,
        r.match_note,
        r.db_nc,
      ]
        .map((v) => {
          const s = String(v ?? "");
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  writeFileSync(csvPath, csvHeader + csvBody, "utf8");
  console.log(`\nCSV: ${csvPath}\n`);

  // Diagnóstico sync
  const saldoMal = auditRows.filter((r) => r.estado === "saldo mal").length;
  const faltan = auditRows.filter((r) => r.estado === "falta" && r.saldoExcel > 0).length;
  console.log("── Causa probable (sync saldos pendientes) ──");
  if (faltan > 0) console.log(`  • ${faltan} comprobantes en Excel sin fila DB o sin match (pipeline vouchers/saldos).`);
  if (saldoMal > 0) console.log(`  • ${saldoMal} comprobantes con balance_amount ≠ saldo Zeta (saldos desactualizados o match heurístico incorrecto).`);
  if (dbUyu + dbUsd < excelUyu + excelUsd - 100) {
    console.log("  • DB totala menos pendiente que Excel → correr sync saldos por cliente + revisar orphan zeroing.");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
