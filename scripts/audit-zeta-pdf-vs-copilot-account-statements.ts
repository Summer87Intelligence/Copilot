#!/usr/bin/env node
/**
 * Auditoría PDF PARITY — SNAPSHOT (Nivel 3).
 *
 * Compara el modelo ledger Copilot contra PDFs de Estado de Cuenta exportados de Zeta.
 *
 * ⚠️ RESTRICCIÓN: este script es válido SOLO cuando el corte temporal del PDF coincide
 * con el período consultado en Copilot. NO ejecutar como gate diario contra PDFs viejos.
 *
 * Casos de uso correctos:
 *  - Cierre mensual: exportar PDFs frescos desde Zeta del período cerrado, luego correr.
 *  - Validación post-fix: exportar PDF nuevo después de corregir un estado de cuenta.
 *  - Reporte de diferencia específica informada por la contadora.
 *
 * Casos de uso incorrectos:
 *  - Ejecutar con PDFs de semanas/meses anteriores (falsos positivos garantizados).
 *  - Usar como verificación diaria automática.
 *  - Comparar Copilot actual contra PDF exportado hace >24h con actividad Zeta de por medio.
 *
 * Ver runbook: docs/integrations/zeta-audit-runbook.md — Nivel 3.
 *
 * Para auditoría diaria usar: npm run audit:zeta-sync-health
 *
 * Ejecución vía wrapper .mjs o directo:
 *   node scripts/audit-zeta-pdf-vs-copilot-account-statements.mjs
 *   npx tsx --env-file=.env.local scripts/audit-zeta-pdf-vs-copilot-account-statements.ts
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";

import { buildAccountStatementApiModel } from "@/lib/account-statement/build-account-statement-api-model";
import {
  parseZetaEstadoCuentaPdfText,
  type ZetaPdfClientStatement,
} from "@/lib/account-statement/parse-zeta-estado-cuenta-pdf-text";
import {
  classifyZetaPdfParity,
  type ZetaPdfParityAuditStatus,
} from "@/lib/account-statement/zeta-pdf-parity-classify";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { data: Buffer }) => {
  getText(): Promise<{ text?: string }>;
  destroy(): Promise<void>;
} };

const AMOUNT_TOL = 0.02;
const PERIOD_FROM = "2026-01-01";
const PERIOD_TO = "2026-12-31";

const ZETA_PDFS = [
  {
    path: "audits/zeta/250218923-U1-EstadosCuentaClientes-2026-06-07-20-41-38-11888.pdf",
    currency: "UYU" as const,
  },
  {
    path: "audits/zeta/250218923-U1-EstadosCuentaClientes-2026-06-07-20-42-15-31709.pdf",
    currency: "USD" as const,
  },
];

const PRIORITY_FRAGMENTS = [
  "FLETCHER",
  "ACQUAGARDEN",
  "DOBSURA",
  "ALDO",
  "PAPELERIA",
  "ALKITODO",
  "ARROYAL",
  "BLOOMMY",
  "REMIPLAT",
  "EL PAIS",
  "EL PAÍS",
  "DOLBY",
];

type AuditStatus = ZetaPdfParityAuditStatus;

type MovementRef = {
  date: string;
  kind: string;
  number: string;
  debit: number;
  credit: number;
};

type CopilotSnapshot = {
  companyId: string;
  companyName: string;
  opening: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  movementCount: number;
  cfeCount: number;
  receiptCount: number;
  movements: MovementRef[];
};

type MovementDiff = {
  missingInvoices: string[];
  extraInvoices: string[];
  missingReceipts: string[];
  extraReceipts: string[];
};

type AuditRow = {
  status: AuditStatus;
  currency: "UYU" | "USD";
  codigo: string;
  zetaName: string;
  copilotName: string;
  zetaOpening: number | null;
  copilotOpening: number | null;
  zetaDebe: number;
  copilotDebe: number | null;
  zetaHaber: number;
  copilotHaber: number | null;
  zetaFinal: number | null;
  copilotFinal: number | null;
  zetaMovements: number;
  copilotMovements: number | null;
  zetaCfe: number;
  copilotCfe: number | null;
  zetaReceipts: number;
  copilotReceipts: number | null;
  parseWarnings: string;
  notes: string;
  expectedOpeningZeta: number | null;
  currentLedgerOpeningDb: number | null;
  suggestedLedgerOpening: number | null;
  missingInvoices: string;
  extraInvoices: string;
  missingReceipts: string;
  extraReceipts: string;
  recommendedAction: string;
};

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID"
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function near(a: number, b: number, tol = AMOUNT_TOL): boolean {
  return Math.abs(a - b) <= tol;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function extractPdfText(relativePath: string): Promise<string> {
  const abs = resolve(process.cwd(), relativePath);
  if (!existsSync(abs)) {
    throw new Error(`PDF no encontrado: ${relativePath}`);
  }
  const buf = readFileSync(abs);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy().catch(() => {});
  }
}

const ROUNDING_TOL_USD = 1.0;
/** Centavos en micro-facturas UYU vs enteros en PDF parseado (p. ej. Dolby 187). */
const ROUNDING_TOL_UYU = 1.5;

function roundingTolerance(currency: "UYU" | "USD"): number {
  return currency === "UYU" ? ROUNDING_TOL_UYU : ROUNDING_TOL_USD;
}

function zetaDateToIso(d: string): string {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return d;
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeComprobanteNumber(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/^A-/, "A");
  const m = t.match(/^([A-Z]?)(\d+)$/);
  if (m) return `${m[1] ?? ""}${m[2]}`;
  const tail = t.match(/:([A-Z]?)(\d+)$/);
  if (tail) return `${tail[1] ?? ""}${tail[2]}`;
  return t;
}

function movementKey(m: MovementRef): string {
  return `${m.date}|${m.kind}|${normalizeComprobanteNumber(m.number)}|${m.debit}|${m.credit}`;
}

function zetaToMovementRef(m: ZetaPdfClientStatement["movements"][number]): MovementRef {
  return {
    date: zetaDateToIso(m.date),
    kind: m.kind,
    number: m.number,
    debit: m.debit,
    credit: m.credit,
  };
}

function compareMovements(
  zeta: ZetaPdfClientStatement,
  copilot: CopilotSnapshot | null
): MovementDiff {
  const empty: MovementDiff = {
    missingInvoices: [],
    extraInvoices: [],
    missingReceipts: [],
    extraReceipts: [],
  };
  if (!copilot) return empty;

  const zetaKeys = new Map<string, MovementRef>();
  const copilotKeys = new Map<string, MovementRef>();

  for (const m of zeta.movements) {
    const ref = zetaToMovementRef(m);
    zetaKeys.set(movementKey(ref), ref);
  }
  for (const m of copilot.movements) {
    copilotKeys.set(movementKey(m), m);
  }

  const fmtInv = (m: MovementRef) =>
    `${m.date} ${m.number || "?"} D=${m.debit}${m.kind === "credit_note" ? " NC" : ""}`;
  const fmtRec = (m: MovementRef) => `${m.date} ${m.number || "?"} H=${m.credit}`;

  for (const [k, m] of zetaKeys) {
    if (copilotKeys.has(k)) continue;
    if (m.kind === "receipt") empty.missingReceipts.push(fmtRec(m));
    else empty.missingInvoices.push(fmtInv(m));
  }
  for (const [k, m] of copilotKeys) {
    if (zetaKeys.has(k)) continue;
    if (m.kind === "receipt") empty.extraReceipts.push(fmtRec(m));
    else empty.extraInvoices.push(fmtInv(m));
  }
  return empty;
}

function suggestedOpening(zeta: ZetaPdfClientStatement): number | null {
  if (zeta.openingBalance == null) return null;
  return zeta.openingBalance;
}

function buildRecommendedAction(
  status: AuditStatus,
  zeta: ZetaPdfClientStatement,
  copilot: CopilotSnapshot | null,
  diff: MovementDiff,
  dbOpening: number | null
): string {
  if (status === "OK" || status === "ROUNDING_OK") return "none";
  if (status === "CLIENT_NOT_FOUND") return "crear/vincular proto_company por Codigo Zeta";
  if (status === "PARSE_WARNING") return "revisar parse PDF Zeta";

  if (status === "DIFF_OPENING") {
    const sug = suggestedOpening(zeta);
    if (sug != null && !near(sug, copilot?.opening ?? NaN))
      return `UPDATE ledger_opening_balance: DB=${dbOpening ?? "NULL"} → ${sug} (PDF Saldo anterior)`;
    return "revisar opening balance en proto_companies";
  }

  if (diff.extraReceipts.length > 0)
    return `recibos extra en Copilot: ${diff.extraReceipts.join("; ")} — verificar duplicado sync`;
  if (diff.missingReceipts.length > 0)
    return `recibos faltantes sync: ${diff.missingReceipts.join("; ")}`;
  if (diff.extraInvoices.length > 0)
    return `facturas/NC extra: ${diff.extraInvoices.join("; ")}`;
  if (diff.missingInvoices.length > 0)
    return `facturas faltantes sync/CCV1: ${diff.missingInvoices.join("; ")}`;

  if (status === "DIFF_DEBE" || status === "DIFF_HABER" || status === "DIFF_FINAL")
    return "revisar comprobantes y clasificación NC/shadow";

  return "investigar";
}

function countCopilotKinds(
  movements: Array<{ kind: string }>
): { cfeCount: number; receiptCount: number } {
  let cfeCount = 0;
  let receiptCount = 0;
  for (const m of movements) {
    if (m.kind === "receipt") receiptCount += 1;
    else if (m.kind === "invoice" || m.kind === "credit_note") cfeCount += 1;
  }
  return { cfeCount, receiptCount };
}

async function buildCopilotSnapshot(
  companyId: string,
  currency: "UYU" | "USD"
): Promise<CopilotSnapshot> {
  const model = await buildAccountStatementApiModel(supabase, companyId, workspaceId!, {
    from: PERIOD_FROM,
    to: PERIOD_TO,
    currencies: [currency],
  });

  const block = model.blocks.find((b) => b.currency === currency);
  if (!block) {
    return {
      companyId,
      companyName: model.companyName,
      opening: 0,
      totalDebit: 0,
      totalCredit: 0,
      finalBalance: 0,
      movementCount: 0,
      cfeCount: 0,
      receiptCount: 0,
      movements: [],
    };
  }

  const { cfeCount, receiptCount } = countCopilotKinds(block.movements);
  const movements: MovementRef[] = block.movements.map((m) => ({
    date: m.date,
    kind: m.kind,
    number: m.number,
    debit: m.debit,
    credit: m.credit,
  }));

  return {
    companyId,
    companyName: model.companyName,
    opening: round2(block.previousBalance),
    totalDebit: round2(block.summary.totalDebit),
    totalCredit: round2(block.summary.totalCredit),
    finalBalance: round2(block.finalBalance),
    movementCount: block.movements.length,
    cfeCount,
    receiptCount,
    movements,
  };
}

function classify(
  zeta: ZetaPdfClientStatement,
  copilot: CopilotSnapshot | null
): AuditStatus {
  if (!copilot) return classifyZetaPdfParity(zeta, null);
  return classifyZetaPdfParity(zeta, {
    opening: copilot.opening,
    totalDebit: copilot.totalDebit,
    totalCredit: copilot.totalCredit,
    finalBalance: copilot.finalBalance,
  });
}

function buildNotes(
  zeta: ZetaPdfClientStatement,
  copilot: CopilotSnapshot | null
): string {
  const parts: string[] = [];
  if (zeta.movementCount !== copilot?.movementCount) {
    parts.push(`mov zeta=${zeta.movementCount} copilot=${copilot?.movementCount ?? "?"}`);
  }
  if (zeta.cfeCount !== copilot?.cfeCount) {
    parts.push(`cfe zeta=${zeta.cfeCount} copilot=${copilot?.cfeCount ?? "?"}`);
  }
  if (zeta.receiptCount !== copilot?.receiptCount) {
    parts.push(`rec zeta=${zeta.receiptCount} copilot=${copilot?.receiptCount ?? "?"}`);
  }
  return parts.join("; ");
}

async function fetchCompaniesByCodigo(): Promise<
  Map<string, { id: string; name: string; obUyu: number | null; obUsd: number | null }>
> {
  const map = new Map<
    string,
    { id: string; name: string; obUyu: number | null; obUsd: number | null }
  >();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("proto_companies")
      .select(
        "id, Codigo, name, RazonSocial, Nombre, ledger_opening_balance_uyu, ledger_opening_balance_usd"
      )
      .eq("workspace_company_id", workspaceId!)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      const codigo = String(row.Codigo ?? "").trim();
      if (!codigo) continue;
      const name =
        String(row.RazonSocial ?? row.Nombre ?? row.name ?? "").trim() || String(row.name ?? "");
      map.set(codigo, {
        id: String(row.id),
        name,
        obUyu: row.ledger_opening_balance_uyu != null ? Number(row.ledger_opening_balance_uyu) : null,
        obUsd: row.ledger_opening_balance_usd != null ? Number(row.ledger_opening_balance_usd) : null,
      });
    }
    if (batch.length < pageSize) break;
  }
  return map;
}

function matchesPriority(name: string, codigo: string): boolean {
  const upper = `${name} ${codigo}`.toUpperCase();
  return PRIORITY_FRAGMENTS.some((f) => upper.includes(f.replace("Í", "I")));
}

function toCsvRow(row: AuditRow): string {
  return [
    row.status,
    row.currency,
    row.codigo,
    row.zetaName,
    row.copilotName,
    row.zetaOpening,
    row.copilotOpening,
    row.zetaDebe,
    row.copilotDebe,
    row.zetaHaber,
    row.copilotHaber,
    row.zetaFinal,
    row.copilotFinal,
    row.zetaMovements,
    row.copilotMovements,
    row.zetaCfe,
    row.copilotCfe,
    row.zetaReceipts,
    row.copilotReceipts,
    row.expectedOpeningZeta,
    row.currentLedgerOpeningDb,
    row.suggestedLedgerOpening,
    row.missingInvoices,
    row.extraInvoices,
    row.missingReceipts,
    row.extraReceipts,
    row.recommendedAction,
    row.parseWarnings,
    row.notes,
  ]
    .map(csvEscape)
    .join(",");
}

function printClientResult(label: string, rows: AuditRow[]) {
  const hit =
    rows.find((r) => label.toUpperCase().split("/").some((p) => r.zetaName.toUpperCase().includes(p.trim()))) ??
    rows.find((r) => r.codigo && label.includes(r.codigo));
  if (!hit) {
    console.log(`  ${label}: (no encontrado en PDF parseado)`);
    return;
  }
  console.log(
    `  ${label} [${hit.currency} cod=${hit.codigo}]: ${hit.status}` +
      ` | zeta opening=${fmt(hit.zetaOpening)} debe=${fmt(hit.zetaDebe)} haber=${fmt(hit.zetaHaber)} final=${fmt(hit.zetaFinal)}` +
      ` | copilot opening=${fmt(hit.copilotOpening)} debe=${fmt(hit.copilotDebe)} haber=${fmt(hit.copilotHaber)} final=${fmt(hit.copilotFinal)}` +
      (hit.notes ? ` | ${hit.notes}` : "")
  );
}

async function main() {
  console.log("=".repeat(72));
  console.log("AUDITORÍA PDF ZETA vs COPILOT — Estado de cuenta ledger");
  console.log(`Período: ${PERIOD_FROM} .. ${PERIOD_TO}`);
  console.log("=".repeat(72));

  const companiesByCodigo = await fetchCompaniesByCodigo();
  const zetaClients: ZetaPdfClientStatement[] = [];

  for (const pdf of ZETA_PDFS) {
    console.log(`\nLeyendo ${pdf.path} (${pdf.currency})...`);
    const text = await extractPdfText(pdf.path);
    const parsed = parseZetaEstadoCuentaPdfText(text, pdf.currency);
    console.log(`  Clientes parseados: ${parsed.length}`);
    zetaClients.push(...parsed);
  }

  const uyuCount = zetaClients.filter((c) => c.currency === "UYU").length;
  const usdCount = zetaClients.filter((c) => c.currency === "USD").length;

  const copilotCache = new Map<string, CopilotSnapshot>();
  const auditRows: AuditRow[] = [];

  for (const zeta of zetaClients) {
    const company = companiesByCodigo.get(zeta.codigo);
    let copilot: CopilotSnapshot | null = null;

    if (company) {
      const cacheKey = `${company.id}|${zeta.currency}`;
      if (copilotCache.has(cacheKey)) {
        copilot = copilotCache.get(cacheKey)!;
      } else {
        copilot = await buildCopilotSnapshot(company.id, zeta.currency);
        copilotCache.set(cacheKey, copilot);
      }
    }

    const status = classify(zeta, copilot);
    const notes = buildNotes(zeta, copilot);
    const movDiff = compareMovements(zeta, copilot);
    const dbOpening =
      zeta.currency === "UYU" ? (company?.obUyu ?? null) : (company?.obUsd ?? null);

    auditRows.push({
      status,
      currency: zeta.currency,
      codigo: zeta.codigo,
      zetaName: zeta.name,
      copilotName: copilot?.companyName ?? "",
      zetaOpening: zeta.openingBalance,
      copilotOpening: copilot?.opening ?? null,
      zetaDebe: zeta.totalDebit,
      copilotDebe: copilot?.totalDebit ?? null,
      zetaHaber: zeta.totalCredit,
      copilotHaber: copilot?.totalCredit ?? null,
      zetaFinal: zeta.finalBalance,
      copilotFinal: copilot?.finalBalance ?? null,
      zetaMovements: zeta.movementCount,
      copilotMovements: copilot?.movementCount ?? null,
      zetaCfe: zeta.cfeCount,
      copilotCfe: copilot?.cfeCount ?? null,
      zetaReceipts: zeta.receiptCount,
      copilotReceipts: copilot?.receiptCount ?? null,
      expectedOpeningZeta: zeta.openingBalance,
      currentLedgerOpeningDb: dbOpening,
      suggestedLedgerOpening: suggestedOpening(zeta),
      missingInvoices: movDiff.missingInvoices.join("|"),
      extraInvoices: movDiff.extraInvoices.join("|"),
      missingReceipts: movDiff.missingReceipts.join("|"),
      extraReceipts: movDiff.extraReceipts.join("|"),
      recommendedAction: buildRecommendedAction(status, zeta, copilot, movDiff, dbOpening),
      parseWarnings: zeta.parseWarnings.join("|"),
      notes,
    });
  }

  auditRows.sort((a, b) => {
    const pa = matchesPriority(a.zetaName, a.codigo) ? 0 : 1;
    const pb = matchesPriority(b.zetaName, b.codigo) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
  });

  const outDir = resolve(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "zeta-pdf-vs-copilot-account-statements.csv");
  const header =
    "status,currency,codigo_zeta,zeta_name,copilot_name,zeta_opening,copilot_opening,zeta_debe,copilot_debe,zeta_haber,copilot_haber,zeta_final,copilot_final,zeta_movements,copilot_movements,zeta_cfe,copilot_cfe,zeta_receipts,copilot_receipts,expected_opening_zeta,current_ledger_opening_db,suggested_ledger_opening,missing_invoices,extra_invoices,missing_receipts,extra_receipts,recommended_action,parse_warnings,notes";
  writeFileSync(outPath, [header, ...auditRows.map(toCsvRow)].join("\n") + "\n", "utf8");

  const okCount = auditRows.filter((r) => r.status === "OK" || r.status === "ROUNDING_OK").length;
  const diffRows = auditRows.filter((r) => r.status !== "OK" && r.status !== "ROUNDING_OK");

  console.log("\n" + "=".repeat(72));
  console.log("RESUMEN");
  console.log("=".repeat(72));
  console.log(`Clientes parseados UYU: ${uyuCount}`);
  console.log(`Clientes parseados USD: ${usdCount}`);
  console.log(`Total filas: ${auditRows.length}`);
  console.log(`OK: ${okCount}`);
  console.log(`Con diferencias / warnings: ${diffRows.length}`);

  const byStatus = new Map<string, number>();
  for (const r of auditRows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }
  console.log("\nPor estado:");
  for (const [st, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st}: ${n}`);
  }

  console.log("\nTop diferencias (no OK):");
  for (const r of diffRows.slice(0, 15)) {
    console.log(
      `  [${r.status}] ${r.currency} ${r.codigo} ${r.zetaName}` +
        ` | zeta ${fmt(r.zetaOpening)}/${fmt(r.zetaDebe)}/${fmt(r.zetaHaber)}/${fmt(r.zetaFinal)}` +
        ` vs copilot ${fmt(r.copilotOpening)}/${fmt(r.copilotDebe)}/${fmt(r.copilotHaber)}/${fmt(r.copilotFinal)}` +
        (r.notes ? ` (${r.notes})` : "")
    );
  }

  console.log("\nClientes prioritarios:");
  printClientResult("Fletcher", auditRows);
  printClientResult("ACQUAGARDEN", auditRows);
  printClientResult("DOBSURA", auditRows);
  printClientResult("ALDO/PAPELERIA", auditRows);
  printClientResult("Bloommy", auditRows);
  printClientResult("Remiplat", auditRows);
  printClientResult("Arroyal", auditRows);
  printClientResult("ALKITODO", auditRows);

  console.log(`\nCSV: ${outPath}`);
  console.log("\n(No commit / no push — auditoría read-only)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
