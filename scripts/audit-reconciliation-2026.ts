/**
 * Reconciliation audit: Excel maestro → proto_invoices (Supabase).
 * READ ONLY — no DB writes, no imports from app/.
 *
 * Usage:
 *   npx tsx scripts/audit-reconciliation-2026.ts
 *   # or with env file:
 *   node --env-file=.env.local --import tsx scripts/audit-reconciliation-2026.ts
 *
 * Env (loaded from .env.local automatically if not already set):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   AUDIT_WORKSPACE_ID   (default: 040321ff-10fd-4da3-aeca-f1865f879986)
 *   AUDIT_EXCEL_PATH     (default: temp-audits/VentasExport-7826.xlsx)
 *   AUDIT_DATE_FROM      (default: 2026-01-01)
 *   AUDIT_DATE_TO        (default: 2026-04-30)
 *   AUDIT_OUTPUT_DIR     (default: temp-audits)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const XLSX = require("xlsx") as any;

// ---------------------------------------------------------------------------
// Env loader
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
const DEFAULT_EXCEL    = "temp-audits/VentasExport-7826.xlsx";
const DEFAULT_FROM     = "2026-01-01";
const DEFAULT_TO       = "2026-04-30";
const DEFAULT_OUT      = "temp-audits";
const AMOUNT_TOL       = 0.015; // tolerance for float comparison

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Currency = "USD" | "UYU" | "UNKNOWN";

type ExcelRow = {
  rowIndex: number;
  issue_date: string;
  tipo: string;
  comprobante: string;
  numero: string;
  numero_raw: number;
  estado_dgi: string;
  cliente_nombre: string;
  razon_social: string;
  rut: string;          // normalized: digits only
  rut_raw: string;
  currency: Currency;
  currency_raw: string;
  cotizacion: number;
  total: number;
  saldo: number;
};

type CopilotRow = {
  id: string;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  balance_amount: number | null;
  currency_code: string | null;
  status: string | null;
  company_id: string;
  company_rut: string | null;
  company_codigo: string | null;
  company_name: string | null;
  inv_format: "ccv1" | "noser" | "legacy_cc" | "legacy_comp" | "unknown";
  inv_empresa: string | null;
  inv_cliente: string | null;
  inv_serie: string | null;
  inv_numero: string | null;
};

type MatchKind =
  | "matched_numero_rut"
  | "matched_numero_only"
  | "matched_fallback"
  | "ambiguous"
  | "missing_in_copilot"
  | "surplus_in_copilot";

type FieldDiff = { field: string; excel: string; copilot: string };

type MatchResult = {
  kind: MatchKind;
  excel: ExcelRow | null;
  copilot: CopilotRow | null;
  diffs: FieldDiff[];
  notes: string[];
};

// ---------------------------------------------------------------------------
// Excel parsing
// ---------------------------------------------------------------------------

function xlsxSerialToYmd(serial: number): string {
  // (serial - 25569) = days since Unix epoch 1970-01-01
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function normalizeCurrency(raw: string): Currency {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "U$S" || s === "USD" || s === "US$" || s.includes("DOLAR")) return "USD";
  if (s === "$" || s === "UYU" || s === "UR$" || s === "$U" || s.includes("PES")) return "UYU";
  return "UNKNOWN";
}

function normalizeRut(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "").trim();
}

function parseExcel(filePath: string): ExcelRow[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 → raw arrays; defval:null → empty cells are null
  const all: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // Row 0: date range metadata, Row 1: blank, Row 2: headers, Row 3+: data
  const results: ExcelRow[] = [];
  for (let i = 3; i < all.length; i++) {
    const row = all[i] as unknown[];
    if (!row || row[0] == null) continue;
    const fechaRaw = row[0];
    if (typeof fechaRaw !== "number") continue;

    const numero_raw = typeof row[3] === "number" ? row[3] : Number(row[3]);
    results.push({
      rowIndex: i,
      issue_date:     xlsxSerialToYmd(fechaRaw),
      tipo:           String(row[1] ?? "").trim(),
      comprobante:    String(row[2] ?? "").trim(),
      numero:         String(isNaN(numero_raw) ? (row[3] ?? "") : numero_raw),
      numero_raw,
      estado_dgi:     String(row[4] ?? "").trim(),
      cliente_nombre: String(row[6] ?? "").trim(),
      razon_social:   String(row[7] ?? "").trim(),
      rut_raw:        String(row[8] ?? "").trim(),
      rut:            normalizeRut(row[8]),
      currency_raw:   String(row[9] ?? "").trim(),
      currency:       normalizeCurrency(String(row[9] ?? "")),
      cotizacion:     typeof row[10] === "number" ? row[10] : Number(row[10] ?? 0),
      total:          typeof row[11] === "number" ? row[11] : Number(row[11] ?? 0),
      saldo:          typeof row[12] === "number" ? row[12] : Number(row[12] ?? 0),
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Invoice number parser
// ---------------------------------------------------------------------------

function parseInvoiceNumber(
  inv: string
): Pick<CopilotRow, "inv_format" | "inv_empresa" | "inv_cliente" | "inv_serie" | "inv_numero"> {
  const p = inv.split(":");
  if (p[0] !== "ZETA") {
    return { inv_format: "unknown", inv_empresa: null, inv_cliente: null, inv_serie: null, inv_numero: null };
  }
  if (p[1] === "CCV1") {
    if (p.length === 6 && p[2] !== "NOSER" && p[2] !== "COMP") {
      return { inv_format: "ccv1", inv_empresa: p[2] ?? null, inv_cliente: p[3] ?? null, inv_serie: p[4] ?? null, inv_numero: p[5] ?? null };
    }
    if (p[2] === "NOSER") {
      return { inv_format: "noser", inv_empresa: null, inv_cliente: p[3] ?? null, inv_serie: null, inv_numero: null };
    }
    if (p[2] === "COMP") {
      return { inv_format: "legacy_comp", inv_empresa: null, inv_cliente: null, inv_serie: null, inv_numero: null };
    }
  }
  if (p[1] === "CC") {
    return { inv_format: "legacy_cc", inv_empresa: null, inv_cliente: null, inv_serie: null, inv_numero: null };
  }
  return { inv_format: "unknown", inv_empresa: null, inv_cliente: null, inv_serie: null, inv_numero: null };
}

// ---------------------------------------------------------------------------
// Supabase fetch
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCopilotInvoices(
  supabase: any,
  workspaceId: string,
  dateFrom: string,
  dateTo: string
): Promise<CopilotRow[]> {
  // Companies lookup for RUT
  const { data: companies, error: cErr } = await supabase
    .from("proto_companies")
    .select("id, Codigo, RUT, RazonSocial")
    .eq("workspace_company_id", workspaceId);
  if (cErr) throw new Error(`proto_companies: ${cErr.message}`);

  type C = { id: string; Codigo?: unknown; RUT?: unknown; RazonSocial?: unknown };
  const compMap = new Map<string, { rut: string; codigo: string; name: string }>();
  for (const c of (companies ?? []) as C[]) {
    compMap.set(c.id, {
      rut:    normalizeRut(c.RUT),
      codigo: String(c.Codigo ?? "").trim(),
      name:   String(c.RazonSocial ?? "").trim(),
    });
  }

  // Invoices with pagination
  const PAGE = 1000;
  const all: CopilotRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, issue_date, total_amount, balance_amount, currency_code, status, company_id")
      .eq("workspace_company_id", workspaceId)
      .gte("issue_date", dateFrom)
      .lte("issue_date", dateTo)
      .or("is_active.is.null,is_active.eq.true")
      .like("invoice_number", "ZETA:%")
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`proto_invoices: ${error.message}`);
    type R = { id: string; invoice_number: string; issue_date: string; total_amount: number; balance_amount: number | null; currency_code: string | null; status: string | null; company_id: string };
    const rows = (data ?? []) as R[];

    for (const r of rows) {
      const comp = compMap.get(r.company_id);
      const parsed = parseInvoiceNumber(r.invoice_number);
      all.push({
        ...r,
        company_rut:    comp?.rut ?? null,
        company_codigo: comp?.codigo ?? null,
        company_name:   comp?.name ?? null,
        ...parsed,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function computeDiffs(ex: ExcelRow, cp: CopilotRow): FieldDiff[] {
  const d: FieldDiff[] = [];

  if (ex.issue_date !== cp.issue_date) {
    d.push({ field: "issue_date", excel: ex.issue_date, copilot: cp.issue_date });
  }
  if (Math.abs(ex.total - cp.total_amount) > AMOUNT_TOL) {
    d.push({ field: "total_amount", excel: ex.total.toFixed(2), copilot: cp.total_amount.toFixed(2) });
  }
  const cpCur = cp.currency_code ?? "NULL";
  if (ex.currency !== "UNKNOWN" && ex.currency !== cpCur) {
    d.push({ field: "currency_code", excel: ex.currency, copilot: cpCur });
  }
  if (ex.rut && cp.company_rut && ex.rut !== cp.company_rut) {
    d.push({ field: "rut", excel: ex.rut, copilot: cp.company_rut });
  }
  return d;
}

function matchRows(excel: ExcelRow[], copilot: CopilotRow[]): MatchResult[] {
  // Index Copilot ccv1 rows by numero
  const byNumero = new Map<string, CopilotRow[]>();
  for (const cp of copilot) {
    if (cp.inv_format !== "ccv1" || !cp.inv_numero) continue;
    const arr = byNumero.get(cp.inv_numero) ?? [];
    arr.push(cp);
    byNumero.set(cp.inv_numero, arr);
  }

  // Fallback index: issue_date|total
  const byDateTotal = new Map<string, CopilotRow[]>();
  for (const cp of copilot) {
    const k = `${cp.issue_date}|${cp.total_amount.toFixed(2)}`;
    const arr = byDateTotal.get(k) ?? [];
    arr.push(cp);
    byDateTotal.set(k, arr);
  }

  const matched = new Set<string>(); // copilot ids already matched
  const results: MatchResult[] = [];

  for (const ex of excel) {
    const candidates = (byNumero.get(ex.numero) ?? []).filter(c => !matched.has(c.id));

    if (candidates.length === 0) {
      // Fallback: issue_date + total + RUT
      const fbKey = `${ex.issue_date}|${ex.total.toFixed(2)}`;
      const fb = (byDateTotal.get(fbKey) ?? []).filter(c => !matched.has(c.id));
      const byRut = fb.filter(c => ex.rut && c.company_rut === ex.rut);
      if (byRut.length === 1) {
        const cp = byRut[0]!;
        matched.add(cp.id);
        results.push({ kind: "matched_fallback", excel: ex, copilot: cp, diffs: computeDiffs(ex, cp), notes: ["Matched via fallback (date+total+RUT): no numero match found"] });
      } else {
        results.push({ kind: "missing_in_copilot", excel: ex, copilot: null, diffs: [], notes: [] });
      }
      continue;
    }

    if (candidates.length === 1) {
      const cp = candidates[0]!;
      matched.add(cp.id);
      results.push({ kind: "matched_numero_only", excel: ex, copilot: cp, diffs: computeDiffs(ex, cp), notes: [] });
      continue;
    }

    // Multiple candidates: try RUT disambiguation
    if (ex.rut) {
      const byRut = candidates.filter(c => c.company_rut === ex.rut);
      if (byRut.length === 1) {
        const cp = byRut[0]!;
        matched.add(cp.id);
        results.push({ kind: "matched_numero_rut", excel: ex, copilot: cp, diffs: computeDiffs(ex, cp), notes: [] });
        continue;
      }
    }

    // Try total disambiguation
    const byTotal = candidates.filter(c => Math.abs(c.total_amount - ex.total) <= AMOUNT_TOL);
    if (byTotal.length === 1) {
      const cp = byTotal[0]!;
      matched.add(cp.id);
      results.push({ kind: "matched_numero_rut", excel: ex, copilot: cp, diffs: computeDiffs(ex, cp), notes: ["Disambiguation by total (multiple series same numero)"] });
      continue;
    }

    // Ambiguous — pick first, flag
    const cp = candidates[0]!;
    matched.add(cp.id);
    const ambNotes = [`${candidates.length} candidatos con mismo Nº: ${candidates.map(c => c.invoice_number).join(" | ")}`];
    results.push({ kind: "ambiguous", excel: ex, copilot: cp, diffs: computeDiffs(ex, cp), notes: ambNotes });
  }

  // Surplus: ccv1 copilot rows not matched
  for (const cp of copilot) {
    if (matched.has(cp.id)) continue;
    const note = cp.inv_format !== "ccv1" ? `Formato legacy: ${cp.inv_format}` : "";
    results.push({ kind: "surplus_in_copilot", excel: null, copilot: cp, diffs: [], notes: note ? [note] : [] });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

type Stats = {
  excel_total: number;
  copilot_total: number;
  matched: number;
  matched_pct: string;
  missing: number;
  surplus: number;
  with_diffs: number;
  ambiguous: number;
  excel_usd: number; excel_uyu: number;
  copilot_usd: number; copilot_uyu: number;
  diff_usd: number; diff_uyu: number;
};

function computeStats(results: MatchResult[], excel: ExcelRow[], copilot: CopilotRow[]): Stats {
  const matched = results.filter(r => r.kind !== "missing_in_copilot" && r.kind !== "surplus_in_copilot");
  const withDiffs = matched.filter(r => r.diffs.length > 0);
  const missing = results.filter(r => r.kind === "missing_in_copilot");
  const surplus = results.filter(r => r.kind === "surplus_in_copilot");
  const ambiguous = results.filter(r => r.kind === "ambiguous");

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const excelUsd = sum(excel.filter(r => r.currency === "USD").map(r => r.total));
  const excelUyu = sum(excel.filter(r => r.currency === "UYU").map(r => r.total));
  const copilotUsd = sum(copilot.filter(c => c.currency_code === "USD").map(c => c.total_amount));
  const copilotUyu = sum(copilot.filter(c => c.currency_code === "UYU").map(c => c.total_amount));

  const pct = excel.length > 0 ? ((matched.length / excel.length) * 100).toFixed(1) + "%" : "N/A";

  return {
    excel_total: excel.length,
    copilot_total: copilot.length,
    matched: matched.length,
    matched_pct: pct,
    missing: missing.length,
    surplus: surplus.length,
    with_diffs: withDiffs.length,
    ambiguous: ambiguous.length,
    excel_usd: excelUsd, excel_uyu: excelUyu,
    copilot_usd: copilotUsd, copilot_uyu: copilotUyu,
    diff_usd: copilotUsd - excelUsd,
    diff_uyu: copilotUyu - excelUyu,
  };
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function excelRowLine(ex: ExcelRow): string {
  return `  - Nº ${ex.numero} | ${ex.issue_date} | ${ex.razon_social} | RUT ${ex.rut} | ${ex.currency} ${fmt(ex.total)} | ${ex.tipo}`;
}

function copilotRowLine(cp: CopilotRow): string {
  return `  - ${cp.invoice_number} | ${cp.issue_date} | ${cp.company_name ?? "?"} | RUT ${cp.company_rut ?? "?"} | ${cp.currency_code ?? "NULL"} ${fmt(cp.total_amount)} | balance ${fmt(cp.balance_amount ?? 0)}`;
}

function generateMarkdown(
  results: MatchResult[],
  excel: ExcelRow[],
  copilot: CopilotRow[],
  stats: Stats,
  config: { excelPath: string; dateFrom: string; dateTo: string }
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push(`# Reconciliation Report — ${config.dateFrom} → ${config.dateTo}`);
  lines.push(`\n_Generado: ${now}_`);
  lines.push(`_Excel: ${config.excelPath}_`);
  lines.push("");

  // 1. Resumen ejecutivo
  lines.push("## 1. Resumen ejecutivo");
  lines.push("");
  lines.push(`| Campo | Valor |`);
  lines.push(`|---|---|`);
  lines.push(`| Filas Excel | ${stats.excel_total} |`);
  lines.push(`| Filas Copilot (periodo, activas) | ${stats.copilot_total} |`);
  lines.push(`| Matched | ${stats.matched} (${stats.matched_pct}) |`);
  lines.push(`| Con diferencias (matched) | ${stats.with_diffs} |`);
  lines.push(`| Ambiguos | ${stats.ambiguous} |`);
  lines.push(`| Faltantes en Copilot | ${stats.missing} |`);
  lines.push(`| Sobrantes en Copilot | ${stats.surplus} |`);
  lines.push("");

  // 2. Faltantes en Copilot
  const missing = results.filter(r => r.kind === "missing_in_copilot");
  lines.push(`## 2. Facturas faltantes en Copilot (${missing.length})`);
  lines.push("");
  if (missing.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of missing) lines.push(excelRowLine(r.excel!));
  }
  lines.push("");

  // 3. Sobrantes en Copilot
  const surplus = results.filter(r => r.kind === "surplus_in_copilot");
  lines.push(`## 3. Facturas sobrantes en Copilot (${surplus.length})`);
  lines.push("");
  if (surplus.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of surplus) {
      lines.push(copilotRowLine(r.copilot!));
      if (r.notes.length) lines.push(`    ↳ ${r.notes.join("; ")}`);
    }
  }
  lines.push("");

  // 4. Diferencias de moneda
  const curDiffs = results.filter(r => r.diffs.some(d => d.field === "currency_code"));
  lines.push(`## 4. Diferencias de moneda (${curDiffs.length})`);
  lines.push("");
  if (curDiffs.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of curDiffs) {
      const d = r.diffs.find(x => x.field === "currency_code")!;
      lines.push(`  - Nº ${r.excel?.numero} | Excel: **${d.excel}** → Copilot: **${d.copilot}** | ${r.copilot?.invoice_number}`);
    }
  }
  lines.push("");

  // 5. Diferencias de monto
  const amtDiffs = results.filter(r => r.diffs.some(d => d.field === "total_amount"));
  lines.push(`## 5. Diferencias de monto (${amtDiffs.length})`);
  lines.push("");
  if (amtDiffs.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of amtDiffs) {
      const d = r.diffs.find(x => x.field === "total_amount")!;
      const delta = Number(d.copilot) - Number(d.excel);
      const sign = delta > 0 ? "+" : "";
      lines.push(`  - Nº ${r.excel?.numero} | Excel: ${r.excel?.currency} ${d.excel} → Copilot: ${r.copilot?.currency_code ?? "?"} ${d.copilot} | delta: ${sign}${fmt(delta)} | ${r.copilot?.invoice_number}`);
    }
  }
  lines.push("");

  // 6. Diferencias de fecha
  const dateDiffs = results.filter(r => r.diffs.some(d => d.field === "issue_date"));
  lines.push(`## 6. Diferencias de fecha (${dateDiffs.length})`);
  lines.push("");
  if (dateDiffs.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of dateDiffs) {
      const d = r.diffs.find(x => x.field === "issue_date")!;
      lines.push(`  - Nº ${r.excel?.numero} | Excel: ${d.excel} → Copilot: ${d.copilot} | ${r.copilot?.invoice_number}`);
    }
  }
  lines.push("");

  // 7. Diferencias de cliente/RUT
  const rutDiffs = results.filter(r => r.diffs.some(d => d.field === "rut"));
  lines.push(`## 7. Diferencias de cliente / RUT (${rutDiffs.length})`);
  lines.push("");
  if (rutDiffs.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of rutDiffs) {
      const d = r.diffs.find(x => x.field === "rut")!;
      lines.push(`  - Nº ${r.excel?.numero} | ${r.excel?.razon_social} | Excel RUT: ${d.excel} → Copilot RUT: ${d.copilot} | ${r.copilot?.invoice_number}`);
    }
  }
  lines.push("");

  // 8. Ambiguos
  const ambiguous = results.filter(r => r.kind === "ambiguous");
  lines.push(`## 8. Facturas ambiguas (${ambiguous.length})`);
  lines.push("");
  if (ambiguous.length === 0) {
    lines.push("_Ninguna._");
  } else {
    for (const r of ambiguous) {
      lines.push(excelRowLine(r.excel!));
      for (const n of r.notes) lines.push(`    ↳ ${n}`);
      if (r.diffs.length) lines.push(`    ↳ Diffs: ${r.diffs.map(d => `${d.field}: ${d.excel}→${d.copilot}`).join(", ")}`);
    }
  }
  lines.push("");

  // 9. Totales por moneda
  lines.push("## 9. Totales por moneda");
  lines.push("");
  lines.push(`| Moneda | Excel | Copilot | Diferencia |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| USD | ${fmt(stats.excel_usd)} | ${fmt(stats.copilot_usd)} | ${stats.diff_usd >= 0 ? "+" : ""}${fmt(stats.diff_usd)} |`);
  lines.push(`| UYU | ${fmt(stats.excel_uyu)} | ${fmt(stats.copilot_uyu)} | ${stats.diff_uyu >= 0 ? "+" : ""}${fmt(stats.diff_uyu)} |`);
  lines.push("");

  // Desglose por moneda en Excel
  const excelByCur = new Map<string, { count: number; total: number }>();
  for (const ex of excel) {
    const k = ex.currency;
    const prev = excelByCur.get(k) ?? { count: 0, total: 0 };
    excelByCur.set(k, { count: prev.count + 1, total: prev.total + ex.total });
  }
  lines.push("### Desglose Excel por moneda");
  lines.push("");
  for (const [cur, { count, total }] of excelByCur.entries()) {
    lines.push(`- ${cur}: ${count} facturas, total ${fmt(total)}`);
  }
  lines.push("");

  // Desglose por moneda en Copilot
  const copilotByCur = new Map<string, { count: number; total: number }>();
  for (const cp of copilot) {
    const k = cp.currency_code ?? "NULL";
    const prev = copilotByCur.get(k) ?? { count: 0, total: 0 };
    copilotByCur.set(k, { count: prev.count + 1, total: prev.total + cp.total_amount });
  }
  lines.push("### Desglose Copilot por moneda");
  lines.push("");
  for (const [cur, { count, total }] of copilotByCur.entries()) {
    lines.push(`- ${cur}: ${count} facturas, total ${fmt(total)}`);
  }
  lines.push("");

  // 10. Validación final
  const hasCritical = missing.length > 0 || surplus.length > 0 || curDiffs.length > 0 || amtDiffs.length > 0;
  const hasWarning = dateDiffs.length > 0 || rutDiffs.length > 0 || ambiguous.length > 0;
  const status = hasCritical ? "ERROR" : hasWarning ? "WARNING" : "OK";
  const statusEmoji = hasCritical ? "🔴" : hasWarning ? "🟡" : "🟢";

  lines.push("## 10. Validación final");
  lines.push("");
  lines.push(`**Estado: ${statusEmoji} ${status}**`);
  lines.push("");
  lines.push(`| Check | Resultado |`);
  lines.push(`|---|---|`);
  lines.push(`| Faltantes en Copilot | ${missing.length === 0 ? "✅ 0" : `❌ ${missing.length}`} |`);
  lines.push(`| Sobrantes en Copilot | ${surplus.length === 0 ? "✅ 0" : `⚠️ ${surplus.length}`} |`);
  lines.push(`| Diferencias de moneda | ${curDiffs.length === 0 ? "✅ 0" : `❌ ${curDiffs.length}`} |`);
  lines.push(`| Diferencias de monto | ${amtDiffs.length === 0 ? "✅ 0" : `❌ ${amtDiffs.length}`} |`);
  lines.push(`| Diferencias de fecha | ${dateDiffs.length === 0 ? "✅ 0" : `⚠️ ${dateDiffs.length}`} |`);
  lines.push(`| Diferencias de RUT | ${rutDiffs.length === 0 ? "✅ 0" : `⚠️ ${rutDiffs.length}`} |`);
  lines.push(`| Facturas ambiguas | ${ambiguous.length === 0 ? "✅ 0" : `⚠️ ${ambiguous.length}`} |`);
  lines.push(`| Match rate | ${stats.matched_pct} |`);
  lines.push("");

  return lines.join("\n");
}

function generateCsv(results: MatchResult[]): string {
  const headers = [
    "kind",
    "excel_numero", "excel_issue_date", "excel_tipo", "excel_razon_social", "excel_rut",
    "excel_currency", "excel_total", "excel_saldo",
    "copilot_invoice_number", "copilot_issue_date", "copilot_total_amount",
    "copilot_currency_code", "copilot_balance", "copilot_rut", "copilot_company",
    "copilot_serie",
    "diff_fields", "notes",
  ];

  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = [headers.join(",")];
  for (const r of results) {
    const ex = r.excel;
    const cp = r.copilot;
    const diffStr = r.diffs.map(d => `${d.field}:${d.excel}→${d.copilot}`).join("; ");
    const notesStr = r.notes.join("; ");
    rows.push([
      r.kind,
      ex?.numero ?? "", ex?.issue_date ?? "", ex?.tipo ?? "", ex?.razon_social ?? "", ex?.rut ?? "",
      ex?.currency ?? "", ex?.total ?? "", ex?.saldo ?? "",
      cp?.invoice_number ?? "", cp?.issue_date ?? "", cp?.total_amount ?? "",
      cp?.currency_code ?? "", cp?.balance_amount ?? "", cp?.company_rut ?? "", cp?.company_name ?? "",
      cp?.inv_serie ?? "",
      diffStr, notesStr,
    ].map(escape).join(","));
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Ejecutar con: node --env-file=.env.local --import tsx scripts/audit-reconciliation-2026.ts");
    process.exit(1);
  }

  const workspaceId = process.env.AUDIT_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE;
  const excelPath   = process.env.AUDIT_EXCEL_PATH?.trim() || DEFAULT_EXCEL;
  const dateFrom    = process.env.AUDIT_DATE_FROM?.trim() || DEFAULT_FROM;
  const dateTo      = process.env.AUDIT_DATE_TO?.trim() || DEFAULT_TO;
  const outputDir   = process.env.AUDIT_OUTPUT_DIR?.trim() || DEFAULT_OUT;

  console.log("─".repeat(60));
  console.log("RECONCILIATION AUDIT — Zeta sync vs Excel maestro");
  console.log("─".repeat(60));
  console.log(`Excel:     ${excelPath}`);
  console.log(`Periodo:   ${dateFrom} → ${dateTo}`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Output:    ${outputDir}/`);
  console.log("");

  // Parse Excel
  console.log("📊 Leyendo Excel...");
  const excel = parseExcel(excelPath);
  console.log(`   → ${excel.length} filas cargadas`);

  // Fetch Copilot
  console.log("🗃️  Consultando Supabase...");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const copilot = await fetchCopilotInvoices(supabase, workspaceId, dateFrom, dateTo);
  console.log(`   → ${copilot.length} facturas Zeta activas en periodo`);

  const ccv1 = copilot.filter(c => c.inv_format === "ccv1");
  const legacy = copilot.filter(c => c.inv_format !== "ccv1");
  if (legacy.length > 0) {
    console.log(`   → ${legacy.length} con formato legacy (noser/hash) — se reportan como surplus`);
  }

  // Match
  console.log("🔗 Ejecutando matching...");
  const results = matchRows(excel, copilot);
  const stats = computeStats(results, excel, copilot);

  console.log("");
  console.log("─".repeat(60));
  console.log("RESUMEN");
  console.log("─".repeat(60));
  console.log(`Excel total:          ${stats.excel_total}`);
  console.log(`Copilot total:        ${stats.copilot_total} (ccv1: ${ccv1.length}, legacy: ${legacy.length})`);
  console.log(`Matched:              ${stats.matched} (${stats.matched_pct})`);
  console.log(`Con diferencias:      ${stats.with_diffs}`);
  console.log(`Ambiguos:             ${stats.ambiguous}`);
  console.log(`Faltantes en Copilot: ${stats.missing}`);
  console.log(`Sobrantes en Copilot: ${stats.surplus}`);
  console.log("");
  console.log(`Excel USD total:      ${fmt(stats.excel_usd)}`);
  console.log(`Copilot USD total:    ${fmt(stats.copilot_usd)}  (diff: ${stats.diff_usd >= 0 ? "+" : ""}${fmt(stats.diff_usd)})`);
  console.log(`Excel UYU total:      ${fmt(stats.excel_uyu)}`);
  console.log(`Copilot UYU total:    ${fmt(stats.copilot_uyu)}  (diff: ${stats.diff_uyu >= 0 ? "+" : ""}${fmt(stats.diff_uyu)})`);
  console.log("");

  // Write outputs
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const mdPath  = path.join(outputDir, "reconciliation-2026-01-04.md");
  const csvPath = path.join(outputDir, "reconciliation-diff.csv");

  const md = generateMarkdown(results, excel, copilot, stats, { excelPath, dateFrom, dateTo });
  const csv = generateCsv(results);

  fs.writeFileSync(mdPath,  md,  "utf-8");
  fs.writeFileSync(csvPath, csv, "utf-8");

  console.log(`📝 Markdown: ${mdPath}`);
  console.log(`📊 CSV diff: ${csvPath}`);
  console.log("");

  // Per-section preview
  const missing = results.filter(r => r.kind === "missing_in_copilot");
  const curDiffs = results.filter(r => r.diffs.some(d => d.field === "currency_code"));
  const amtDiffs = results.filter(r => r.diffs.some(d => d.field === "total_amount"));

  if (missing.length > 0) {
    console.log(`❌ FALTANTES (${missing.length}):`);
    for (const r of missing.slice(0, 10)) {
      const ex = r.excel!;
      console.log(`   Nº${ex.numero} | ${ex.issue_date} | ${ex.razon_social} | ${ex.currency} ${fmt(ex.total)}`);
    }
    if (missing.length > 10) console.log(`   ... y ${missing.length - 10} más (ver reporte completo)`);
    console.log("");
  }

  if (curDiffs.length > 0) {
    console.log(`⚠️  DIFERENCIAS MONEDA (${curDiffs.length}):`);
    for (const r of curDiffs.slice(0, 5)) {
      const d = r.diffs.find(x => x.field === "currency_code")!;
      console.log(`   Nº${r.excel?.numero} | Excel:${d.excel} → Copilot:${d.copilot}`);
    }
    console.log("");
  }

  if (amtDiffs.length > 0) {
    console.log(`⚠️  DIFERENCIAS MONTO (${amtDiffs.length}):`);
    for (const r of amtDiffs.slice(0, 5)) {
      const d = r.diffs.find(x => x.field === "total_amount")!;
      console.log(`   Nº${r.excel?.numero} | Excel:${d.excel} → Copilot:${d.copilot}`);
    }
    console.log("");
  }

  const hasCritical = missing.length > 0 || stats.surplus > 0 || curDiffs.length > 0 || amtDiffs.length > 0;
  const hasWarning  = results.filter(r => r.diffs.some(d => d.field === "issue_date" || d.field === "rut")).length > 0 || stats.ambiguous > 0;
  const status      = hasCritical ? "🔴 ERROR" : hasWarning ? "🟡 WARNING" : "🟢 OK";
  console.log(`Estado final: ${status}`);
  console.log("─".repeat(60));
}

main().catch(e => {
  console.error("FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
