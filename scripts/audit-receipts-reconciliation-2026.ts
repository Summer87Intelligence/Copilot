/**
 * Reconciliation audit: Excel maestro de recibos de cobranza → `proto_receipts` (Supabase).
 *
 * READ ONLY — no DB writes, no imports productivos. Output en `temp-audits/`.
 *
 * Uso:
 *   npx tsx scripts/audit-receipts-reconciliation-2026.ts
 *
 * Env (lee `.env.local` automáticamente si no están exportadas):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - AUDIT_WORKSPACE_ID   (default: 040321ff-10fd-4da3-aeca-f1865f879986)
 *   - AUDIT_EXCEL_PATH     (default: temp-audits/RecibosCobranzaWWExport-67.xlsx)
 *   - AUDIT_DATE_FROM      (default: 2026-01-01)
 *   - AUDIT_DATE_TO        (default: 2026-12-31)
 *   - AUDIT_OUTPUT_DIR     (default: temp-audits)
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const XLSX = require("xlsx") as any;

// ---------------------------------------------------------------------------
// Env loader (mismo patrón que scripts/audit-reconciliation-2026.ts)
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_WORKSPACE = "040321ff-10fd-4da3-aeca-f1865f879986";
const DEFAULT_EXCEL = "temp-audits/RecibosCobranzaWWExport-67.xlsx";
const DEFAULT_FROM = "2026-01-01";
const DEFAULT_TO = "2026-12-31";
const DEFAULT_OUT = "temp-audits";
const AMOUNT_TOL = 0.015;

const CFG = {
  workspaceId: process.env.AUDIT_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE,
  excelPath: process.env.AUDIT_EXCEL_PATH?.trim() || DEFAULT_EXCEL,
  dateFrom: process.env.AUDIT_DATE_FROM?.trim() || DEFAULT_FROM,
  dateTo: process.env.AUDIT_DATE_TO?.trim() || DEFAULT_TO,
  outDir: process.env.AUDIT_OUTPUT_DIR?.trim() || DEFAULT_OUT,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Currency = "USD" | "UYU" | "UNKNOWN";

type ExcelRow = {
  rowIndex: number;
  fecha_excel_serial: number | null;
  issue_date: string;
  comprobante: string;
  numero: string;
  numero_raw: number | string;
  cliente: string;
  descripcion: string;
  currency: Currency;
  currency_raw: string;
  cotizacion: number | null;
  total: number;
  saldo: number;
};

type DbRow = {
  id: string;
  receipt_number: string;
  receipt_date: string;
  amount: number;
  currency_code: string | null;
  payment_method: string | null;
  reference: string | null;
  status: string | null;
  company_id: string | null;
  numero_from_payload: string;
  cliente_from_payload: string;
  total_from_payload: number | null;
  moneda_simbolo_from_payload: string;
};

type DiffRow = {
  status:
    | "match"
    | "match_amount_diff"
    | "match_currency_diff"
    | "match_date_diff"
    | "match_cliente_diff"
    | "missing_in_db"
    | "ghost_in_db"
    | "duplicate_excel"
    | "duplicate_db";
  numero: string;
  fecha_excel: string;
  fecha_db: string;
  cliente_excel: string;
  cliente_db: string;
  total_excel: number | "";
  total_db: number | "";
  currency_excel: Currency | "";
  currency_db: string;
  receipt_number: string;
  reference: string;
  notes: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(msg: string): never {
  console.error("ERROR:", msg);
  process.exit(1);
}

function excelSerialToYmd(serial: unknown): string {
  if (typeof serial === "string" && /^\d{4}-\d{2}-\d{2}/.test(serial)) {
    return serial.slice(0, 10);
  }
  if (typeof serial !== "number" || !Number.isFinite(serial)) return "";
  // Excel epoch (1900) — se compensa con offset estándar 1900-01-01 → serial 1, con bug Excel 60.
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeMonedaSymbol(raw: string): Currency {
  const t = String(raw ?? "").trim();
  if (!t) return "UNKNOWN";
  if (/U\$S|USD|US\$/i.test(t)) return "USD";
  if (/^\$\s*$|^UYU$|^\$U$/i.test(t)) return "UYU";
  if (t === "$") return "UYU";
  if (t.startsWith("$") && !t.includes("U")) return "UYU";
  return "UNKNOWN";
}

function normalizeCliente(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+/g, "")
    .replace(/\bs\.?a\.?s?\b\.?/g, "sas")
    .replace(/\bs\.?r\.?l\b\.?/g, "srl")
    .replace(/\bs\.?a\b\.?/g, "sa");
}

function approxEqual(a: number, b: number, tol = AMOUNT_TOL): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= tol) return true;
  const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1);
  return rel <= 0.001;
}

function csvCell(s: unknown): string {
  if (s === null || s === undefined) return "";
  const t = String(s);
  if (/[",\n;]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

// ---------------------------------------------------------------------------
// Excel parser
// ---------------------------------------------------------------------------

function loadExcel(filePath: string): ExcelRow[] {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) fail(`Excel no encontrado en ${abs}`);
  const wb = XLSX.readFile(abs, { cellDates: false, raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) fail("Excel sin sheets");
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];

  const headerIdx = aoa.findIndex(
    (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim().toLowerCase() === "fecha"
      ) && row.some((c) => String(c ?? "").trim().toLowerCase() === "comprobante"),
  );
  if (headerIdx < 0) fail("No se ubicó el header (Fecha/Comprobante) en el Excel");

  const headers = (aoa[headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  const idx: Record<string, number> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i].toLowerCase();
    if (h === "fecha") idx.fecha = i;
    else if (h === "comprobante") idx.comprobante = i;
    else if (h === "nº" || h === "n°" || h === "no" || h === "numero" || h === "número") idx.numero = i;
    else if (h === "cliente") idx.cliente = i;
    else if (h === "descripción" || h === "descripcion") idx.descripcion = i;
    else if (h === "moneda") idx.moneda = i;
    else if (h === "cotización" || h === "cotizacion") idx.cotizacion = i;
    else if (h === "total") idx.total = i;
    else if (h === "saldo") idx.saldo = i;
  }
  for (const k of ["fecha", "numero", "cliente", "moneda", "total"]) {
    if (idx[k] === undefined) fail(`Columna obligatoria '${k}' no encontrada en Excel`);
  }

  const out: ExcelRow[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r += 1) {
    const row = aoa[r] as unknown[] | undefined;
    if (!Array.isArray(row)) continue;
    const fechaCell = row[idx.fecha];
    if (fechaCell === null || fechaCell === undefined || fechaCell === "") continue;

    const numeroRaw = row[idx.numero];
    const cliente = String(row[idx.cliente] ?? "").trim();
    const total = Number(row[idx.total] ?? NaN);
    if (!cliente || !Number.isFinite(total)) continue;

    const fechaSerial = typeof fechaCell === "number" ? fechaCell : null;
    const issueDate = excelSerialToYmd(fechaCell);
    const monedaRaw = String(row[idx.moneda] ?? "").trim();
    out.push({
      rowIndex: r + 1,
      fecha_excel_serial: fechaSerial,
      issue_date: issueDate,
      comprobante: String(row[idx.comprobante] ?? "").trim(),
      numero: numeroRaw === null || numeroRaw === undefined ? "" : String(numeroRaw).trim(),
      numero_raw: numeroRaw as number | string,
      cliente,
      descripcion: String(row[idx.descripcion ?? -1] ?? "").trim(),
      currency: normalizeMonedaSymbol(monedaRaw),
      currency_raw: monedaRaw,
      cotizacion: idx.cotizacion !== undefined ? Number(row[idx.cotizacion] ?? null) || null : null,
      total,
      saldo: idx.saldo !== undefined ? Number(row[idx.saldo] ?? 0) || 0 : 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Supabase reader
// ---------------------------------------------------------------------------

async function loadDbRows(): Promise<DbRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await sb
    .from("proto_receipts")
    .select("id,receipt_number,receipt_date,amount,currency_code,payment_method,reference,status,company_id,notes")
    .eq("workspace_company_id", CFG.workspaceId)
    .gte("receipt_date", CFG.dateFrom)
    .lte("receipt_date", CFG.dateTo)
    .order("receipt_date", { ascending: true })
    .limit(5000);

  if (error) fail(`Supabase error: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    receipt_number: string;
    receipt_date: string;
    amount: number | string;
    currency_code: string | null;
    payment_method: string | null;
    reference: string | null;
    status: string | null;
    company_id: string | null;
    notes: string | null;
  }>;

  return rows.map((r) => {
    let payload: Record<string, unknown> = {};
    if (r.notes) {
      try {
        const parsed = JSON.parse(r.notes) as Record<string, unknown>;
        const inner = (parsed.zeta_collection_receipt_v1 as Record<string, unknown> | undefined)?.raw_payload;
        if (inner && typeof inner === "object") payload = inner as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    const numero = String(payload.Numero ?? payload.numero ?? "").trim();
    const cliente = String(payload.ClienteNombre ?? payload.ClienteRazonSocial ?? "").trim();
    const totalRaw = payload.Total ?? payload.total;
    const totalNum = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
    const monedaSimbolo = String(payload.MonedaSimbolo ?? "").trim();
    return {
      id: r.id,
      receipt_number: r.receipt_number,
      receipt_date: r.receipt_date,
      amount: typeof r.amount === "number" ? r.amount : Number(r.amount),
      currency_code: r.currency_code,
      payment_method: r.payment_method,
      reference: r.reference,
      status: r.status,
      company_id: r.company_id,
      numero_from_payload: numero,
      cliente_from_payload: cliente,
      total_from_payload: Number.isFinite(totalNum) ? totalNum : null,
      moneda_simbolo_from_payload: monedaSimbolo,
    };
  });
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

function buildKey(numero: string, fecha: string): string {
  return `${numero}|${fecha}`;
}

type IndexedExcel = {
  byKey: Map<string, ExcelRow[]>;
  byNumeroOnly: Map<string, ExcelRow[]>;
};

function indexExcel(rows: ExcelRow[]): IndexedExcel {
  const byKey = new Map<string, ExcelRow[]>();
  const byNumeroOnly = new Map<string, ExcelRow[]>();
  for (const r of rows) {
    const k = buildKey(r.numero, r.issue_date);
    const arrK = byKey.get(k) ?? [];
    arrK.push(r);
    byKey.set(k, arrK);

    const arrN = byNumeroOnly.get(r.numero) ?? [];
    arrN.push(r);
    byNumeroOnly.set(r.numero, arrN);
  }
  return { byKey, byNumeroOnly };
}

type IndexedDb = {
  byKey: Map<string, DbRow[]>;
  byNumeroOnly: Map<string, DbRow[]>;
  byReceiptNumber: Map<string, DbRow>;
};

function indexDb(rows: DbRow[]): IndexedDb {
  const byKey = new Map<string, DbRow[]>();
  const byNumeroOnly = new Map<string, DbRow[]>();
  const byReceiptNumber = new Map<string, DbRow>();
  for (const r of rows) {
    if (r.numero_from_payload) {
      const k = buildKey(r.numero_from_payload, r.receipt_date);
      const arrK = byKey.get(k) ?? [];
      arrK.push(r);
      byKey.set(k, arrK);
      const arrN = byNumeroOnly.get(r.numero_from_payload) ?? [];
      arrN.push(r);
      byNumeroOnly.set(r.numero_from_payload, arrN);
    }
    byReceiptNumber.set(r.receipt_number, r);
  }
  return { byKey, byNumeroOnly, byReceiptNumber };
}

function compareSingle(ex: ExcelRow, db: DbRow): DiffRow["status"] {
  const sameAmount = approxEqual(ex.total, Number(db.amount));
  const sameDate = ex.issue_date === db.receipt_date;
  const sameCurrency = (db.currency_code ?? "").toUpperCase() === ex.currency || ex.currency === "UNKNOWN";
  const sameCliente = normalizeCliente(ex.cliente) === normalizeCliente(db.cliente_from_payload);

  if (sameAmount && sameDate && sameCurrency && sameCliente) return "match";
  if (!sameAmount) return "match_amount_diff";
  if (!sameCurrency) return "match_currency_diff";
  if (!sameDate) return "match_date_diff";
  if (!sameCliente) return "match_cliente_diff";
  return "match";
}

function makeDiff(excelIdx: IndexedExcel, dbIdx: IndexedDb, excelInRange: ExcelRow[]): DiffRow[] {
  const diffs: DiffRow[] = [];
  const matchedDbIds = new Set<string>();

  // Duplicados REALES Excel: misma tupla (Numero, Fecha, Cliente normalizado, Total, Currency).
  // Excluye colisiones legítimas por `Numero=0` (recibos sin emitir/borradores; convención Zeta).
  const excelTupleCount = new Map<string, ExcelRow[]>();
  for (const r of excelInRange) {
    const tuple = `${r.numero}|${r.issue_date}|${normalizeCliente(r.cliente)}|${r.total.toFixed(2)}|${r.currency}`;
    const arr = excelTupleCount.get(tuple) ?? [];
    arr.push(r);
    excelTupleCount.set(tuple, arr);
  }
  for (const [, group] of excelTupleCount) {
    if (group.length > 1) {
      for (const r of group) {
        diffs.push({
          status: "duplicate_excel",
          numero: r.numero,
          fecha_excel: r.issue_date,
          fecha_db: "",
          cliente_excel: r.cliente,
          cliente_db: "",
          total_excel: r.total,
          total_db: "",
          currency_excel: r.currency,
          currency_db: "",
          receipt_number: "",
          reference: "",
          notes: `excel_row=${r.rowIndex}; cliente="${r.cliente}"; comprobante="${r.comprobante}"`,
        });
      }
    }
  }

  // Duplicados REALES DB: dos rows con MISMO `receipt_number` (= mismo `RegistroId` Zeta).
  // El upsert es por receipt_number, así que esto delataría un bug del pipeline o doble inserción.
  const dbReceiptNumberCount = new Map<string, DbRow[]>();
  for (const r of dbIdx.byReceiptNumber.values()) {
    const arr = dbReceiptNumberCount.get(r.receipt_number) ?? [];
    arr.push(r);
    dbReceiptNumberCount.set(r.receipt_number, arr);
  }
  for (const [, group] of dbReceiptNumberCount) {
    if (group.length > 1) {
      for (const r of group) {
        diffs.push({
          status: "duplicate_db",
          numero: r.numero_from_payload,
          fecha_excel: "",
          fecha_db: r.receipt_date,
          cliente_excel: "",
          cliente_db: r.cliente_from_payload,
          total_excel: "",
          total_db: Number(r.amount),
          currency_excel: "",
          currency_db: r.currency_code ?? "",
          receipt_number: r.receipt_number,
          reference: r.reference ?? "",
          notes: `id=${r.id}`,
        });
      }
    }
  }

  for (const exRow of [...excelIdx.byKey.values()].flat()) {
    const candidates = dbIdx.byKey.get(buildKey(exRow.numero, exRow.issue_date));
    let chosen: DbRow | null = null;

    if (candidates && candidates.length > 0) {
      chosen =
        candidates.find((c) => approxEqual(exRow.total, Number(c.amount))) ??
        candidates.find((c) => normalizeCliente(c.cliente_from_payload) === normalizeCliente(exRow.cliente)) ??
        candidates[0];
    } else {
      const numeroCandidates = dbIdx.byNumeroOnly.get(exRow.numero) ?? [];
      chosen =
        numeroCandidates.find(
          (c) =>
            approxEqual(exRow.total, Number(c.amount)) &&
            normalizeCliente(c.cliente_from_payload) === normalizeCliente(exRow.cliente),
        ) ?? null;
    }

    if (chosen === null) {
      diffs.push({
        status: "missing_in_db",
        numero: exRow.numero,
        fecha_excel: exRow.issue_date,
        fecha_db: "",
        cliente_excel: exRow.cliente,
        cliente_db: "",
        total_excel: exRow.total,
        total_db: "",
        currency_excel: exRow.currency,
        currency_db: "",
        receipt_number: "",
        reference: "",
        notes: `excel_row=${exRow.rowIndex}; comprobante="${exRow.comprobante}"; saldo=${exRow.saldo}`,
      });
      continue;
    }

    matchedDbIds.add(chosen.id);
    const status = compareSingle(exRow, chosen);
    if (status === "match") continue;

    diffs.push({
      status,
      numero: exRow.numero,
      fecha_excel: exRow.issue_date,
      fecha_db: chosen.receipt_date,
      cliente_excel: exRow.cliente,
      cliente_db: chosen.cliente_from_payload,
      total_excel: exRow.total,
      total_db: Number(chosen.amount),
      currency_excel: exRow.currency,
      currency_db: chosen.currency_code ?? "",
      receipt_number: chosen.receipt_number,
      reference: chosen.reference ?? "",
      notes: `excel_row=${exRow.rowIndex}; db_id=${chosen.id}`,
    });
  }

  for (const dbRow of dbIdx.byReceiptNumber.values()) {
    if (matchedDbIds.has(dbRow.id)) continue;
    const numero = dbRow.numero_from_payload;
    const numeroInExcel = numero ? excelIdx.byNumeroOnly.get(numero) : undefined;
    if (numeroInExcel && numeroInExcel.length > 0) {
      const some = numeroInExcel[0];
      const status = compareSingle(some, dbRow);
      if (status === "match") continue;
    }
    diffs.push({
      status: "ghost_in_db",
      numero,
      fecha_excel: "",
      fecha_db: dbRow.receipt_date,
      cliente_excel: "",
      cliente_db: dbRow.cliente_from_payload,
      total_excel: "",
      total_db: Number(dbRow.amount),
      currency_excel: "",
      currency_db: dbRow.currency_code ?? "",
      receipt_number: dbRow.receipt_number,
      reference: dbRow.reference ?? "",
      notes: `id=${dbRow.id}`,
    });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    JSON.stringify({
      kind: "audit_receipts_reconciliation_start",
      workspace: CFG.workspaceId,
      excel: CFG.excelPath,
      date_from: CFG.dateFrom,
      date_to: CFG.dateTo,
      output_dir: CFG.outDir,
    }),
  );

  const excelRows = loadExcel(CFG.excelPath);
  const dbRows = await loadDbRows();

  const excelInRange = excelRows.filter((r) => r.issue_date >= CFG.dateFrom && r.issue_date <= CFG.dateTo);

  const excelIdx = indexExcel(excelInRange);
  const dbIdx = indexDb(dbRows);

  const diffs = makeDiff(excelIdx, dbIdx, excelInRange);

  // Colisiones legítimas por `Numero=0` (recibos sin emitir/borradores Zeta).
  const numeroZeroExcel = excelInRange.filter((r) => r.numero === "0" || r.numero_raw === 0);
  const numeroZeroDb = dbRows.filter((r) => r.numero_from_payload === "0" || r.numero_from_payload === "");

  // ---------- Summary ----------
  const counters = {
    excel_total_rows: excelRows.length,
    excel_in_range_rows: excelInRange.length,
    db_total_rows: dbRows.length,
    diffs_total: diffs.length,
    numero_zero_excel: numeroZeroExcel.length,
    numero_zero_db: numeroZeroDb.length,
    by_status: {} as Record<string, number>,
  };
  for (const d of diffs) counters.by_status[d.status] = (counters.by_status[d.status] ?? 0) + 1;

  const matchedFully =
    excelInRange.length -
    (counters.by_status.missing_in_db ?? 0) -
    (counters.by_status.match_amount_diff ?? 0) -
    (counters.by_status.match_currency_diff ?? 0) -
    (counters.by_status.match_date_diff ?? 0) -
    (counters.by_status.match_cliente_diff ?? 0) -
    (counters.by_status.duplicate_excel ?? 0);

  const dbExtras = counters.by_status.ghost_in_db ?? 0;

  // Distribución por mes (Excel + DB)
  const excelByMonth: Record<string, number> = {};
  for (const r of excelInRange) {
    const m = r.issue_date.slice(0, 7) || "unknown";
    excelByMonth[m] = (excelByMonth[m] ?? 0) + 1;
  }
  const dbByMonth: Record<string, number> = {};
  for (const r of dbRows) {
    const m = r.receipt_date.slice(0, 7) || "unknown";
    dbByMonth[m] = (dbByMonth[m] ?? 0) + 1;
  }

  // Distribución por moneda
  const excelByCurrency: Record<string, number> = {};
  for (const r of excelInRange) excelByCurrency[r.currency] = (excelByCurrency[r.currency] ?? 0) + 1;
  const dbByCurrency: Record<string, number> = {};
  for (const r of dbRows) dbByCurrency[r.currency_code ?? "NULL"] = (dbByCurrency[r.currency_code ?? "NULL"] ?? 0) + 1;

  // ---------- Writers ----------
  const outDir = path.resolve(process.cwd(), CFG.outDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, "receipts-reconciliation-diff.csv");
  const mdPath = path.join(outDir, "receipts-reconciliation-2026.md");

  const csvHeader = [
    "status",
    "numero",
    "fecha_excel",
    "fecha_db",
    "cliente_excel",
    "cliente_db",
    "total_excel",
    "total_db",
    "currency_excel",
    "currency_db",
    "receipt_number",
    "reference",
    "notes",
  ];
  const csvLines = [csvHeader.join(",")];
  for (const d of diffs) {
    csvLines.push(
      [
        d.status,
        d.numero,
        d.fecha_excel,
        d.fecha_db,
        d.cliente_excel,
        d.cliente_db,
        d.total_excel,
        d.total_db,
        d.currency_excel,
        d.currency_db,
        d.receipt_number,
        d.reference,
        d.notes,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  fs.writeFileSync(csvPath, csvLines.join("\r\n"), "utf-8");

  const md: string[] = [];
  md.push(`# Reconciliation — Recibos de cobranza 2026\n`);
  md.push(`**Generado:** ${new Date().toISOString()}\n`);
  md.push(`**Workspace:** \`${CFG.workspaceId}\`\n`);
  md.push(`**Excel:** \`${CFG.excelPath}\`\n`);
  md.push(`**Rango:** ${CFG.dateFrom} → ${CFG.dateTo}\n`);
  md.push("");
  md.push("## Totales\n");
  md.push("| Métrica | Valor |");
  md.push("|---|---|");
  md.push(`| Excel — filas totales | ${counters.excel_total_rows} |`);
  md.push(`| Excel — filas en rango | ${counters.excel_in_range_rows} |`);
  md.push(`| DB \`proto_receipts\` — filas (rango) | ${counters.db_total_rows} |`);
  md.push(`| Coincidencias plenas estimadas | ${matchedFully} |`);
  md.push(`| Filas extra en DB (ghost) | ${dbExtras} |`);
  md.push(`| Recibos con \`Numero=0\` (Excel) — sin emitir / borradores Zeta | ${counters.numero_zero_excel} |`);
  md.push(`| Recibos con \`Numero=0\` (DB) | ${counters.numero_zero_db} |`);
  md.push("");
  md.push("## Distribución por mes\n");
  md.push("| Mes | Excel | DB |");
  md.push("|---|---|---|");
  const allMonths = new Set([...Object.keys(excelByMonth), ...Object.keys(dbByMonth)]);
  for (const m of [...allMonths].sort()) {
    md.push(`| ${m} | ${excelByMonth[m] ?? 0} | ${dbByMonth[m] ?? 0} |`);
  }
  md.push("");
  md.push("## Distribución por moneda\n");
  md.push("| Moneda | Excel | DB (currency_code) |");
  md.push("|---|---|---|");
  const allCurrencies = new Set([...Object.keys(excelByCurrency), ...Object.keys(dbByCurrency)]);
  for (const c of [...allCurrencies].sort()) {
    md.push(`| ${c} | ${excelByCurrency[c] ?? 0} | ${dbByCurrency[c] ?? 0} |`);
  }
  md.push("");
  md.push("## Diffs por estado\n");
  md.push("| Estado | Cantidad |");
  md.push("|---|---|");
  for (const k of Object.keys(counters.by_status).sort()) {
    md.push(`| ${k} | ${counters.by_status[k]} |`);
  }
  if (Object.keys(counters.by_status).length === 0) {
    md.push("| — sin diffs — | 0 |");
  }
  md.push("");
  md.push("## Detalle de diffs (top 50)\n");
  if (diffs.length === 0) {
    md.push("Sin discrepancias detectadas.\n");
  } else {
    md.push("| status | numero | fecha_excel | fecha_db | cliente_excel | cliente_db | total_excel | total_db | currency_excel | currency_db | receipt_number | notes |");
    md.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const d of diffs.slice(0, 50)) {
      md.push(
        `| ${d.status} | ${d.numero} | ${d.fecha_excel} | ${d.fecha_db} | ${d.cliente_excel} | ${d.cliente_db} | ${d.total_excel} | ${d.total_db} | ${d.currency_excel} | ${d.currency_db} | ${d.receipt_number} | ${d.notes.replace(/\|/g, "\\|")} |`,
      );
    }
    if (diffs.length > 50) md.push(`\n_Ver CSV para los ${diffs.length - 50} diffs restantes._`);
  }
  md.push("");
  md.push("## Notas metodológicas\n");
  md.push("- Match primario: `(Numero, Fecha)`; secundario: `(Numero)` con desempate por monto y cliente normalizado.");
  md.push("- Tolerancia de monto: ±0.015 absoluta o 0.1% relativa.");
  md.push("- Normalización moneda Excel: `U$S` → USD, `$` → UYU.");
  md.push("- Normalización cliente: lowercase + colapso de S.A./S.A.S./S.R.L. + espacios + puntuación.");
  md.push("- Read-only: solo lectura del Excel y de `proto_receipts` vía service role; sin writes.");
  md.push("");

  fs.writeFileSync(mdPath, md.join("\n"), "utf-8");

  console.log(
    JSON.stringify({
      kind: "audit_receipts_reconciliation_done",
      counters,
      excel_by_month: excelByMonth,
      db_by_month: dbByMonth,
      excel_by_currency: excelByCurrency,
      db_by_currency: dbByCurrency,
      csv_out: path.relative(process.cwd(), csvPath),
      md_out: path.relative(process.cwd(), mdPath),
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
  process.exit(1);
});
