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

// ---------------------------------------------------------------------------
// PDF export timestamp (para detección SNAPSHOT_STALE)
// ---------------------------------------------------------------------------

/**
 * Parsea el timestamp de exportación desde el nombre del archivo PDF.
 * Formato esperado: ...YYYY-MM-DD-HH-mm-ss-NONCE.pdf
 * Zona horaria: Uruguay UTC-3.
 */
function parsePdfExportTimestamp(pdfPath: string): Date | null {
  const m = pdfPath.match(/(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})-\d+\.pdf/);
  if (!m) return null;
  const [, date, hh, mm, ss] = m;
  // UY = UTC-3
  return new Date(`${date}T${hh}:${mm}:${ss}-03:00`);
}

/** Timestamp del PDF más reciente entre todos los definidos en ZETA_PDFS (corte de frescura). */
function computePdfCutoff(pdfs: Array<{ path: string }>): Date {
  const ts = pdfs
    .map((p) => parsePdfExportTimestamp(p.path))
    .filter((d): d is Date => d !== null);
  if (ts.length === 0) return new Date(0);
  return new Date(Math.max(...ts.map((d) => d.getTime())));
}

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

/** Extensión local del status — añade SNAPSHOT_STALE y REAL_DIFF al contrato del clasificador. */
type AuditStatus = ZetaPdfParityAuditStatus | "SNAPSHOT_STALE" | "REAL_DIFF";

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
  snapshotStaleReason: string;
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

/**
 * Excluye facturas/NC "extra" que también figuran como missing con el mismo
 * comprobante (p. ej. redondeo A1230 D=458 vs D=457.5). Solo deben evaluarse
 * para SNAPSHOT_STALE los comprobantes realmente nuevos en Copilot.
 */
function filterSnapshotStaleExtraInvoices(
  extraInvoices: string[],
  missingInvoices: string[]
): string[] {
  const missingNumbers = new Set(
    missingInvoices
      .map(parseExtraInvoiceDisplayNumber)
      .filter((n): n is string => n != null)
  );
  return extraInvoices.filter((line) => {
    const num = parseExtraInvoiceDisplayNumber(line);
    if (!num) return true;
    return !missingNumbers.has(num);
  });
}

// ---------------------------------------------------------------------------
// SNAPSHOT_STALE reclassification
// ---------------------------------------------------------------------------

const DEBUG_SNAPSHOT_STALE =
  process.env.DEBUG_SNAPSHOT_STALE === "1" ||
  process.env.DEBUG_SNAPSHOT_STALE === "true";

function snapshotStaleDebug(codigo: string, msg: string, payload?: unknown) {
  if (!DEBUG_SNAPSHOT_STALE) return;
  console.log(`[SNAPSHOT_STALE debug cod=${codigo}] ${msg}`);
  if (payload !== undefined) console.log(JSON.stringify(payload, null, 2));
}

/** Normaliza referencia visible del recibo: A-781 → A781; rechaza ZETA:COB:*. */
function normalizeReceiptDisplayRef(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s.includes(":")) return null;
  return s.replace(/^([A-Z]+)-(\d+)$/, "$1$2");
}

/** Variantes para lookup en proto_receipts.reference. */
function referenceLookupVariants(displayRef: string): string[] {
  const n = displayRef.trim().toUpperCase();
  if (n.includes(":")) return [n];
  const m = n.match(/^([A-Z]+)(\d+)$/);
  if (m) return [n, `${m[1]}-${m[2]}`];
  return [n];
}

function parseExtraReceiptDisplayNumber(extraLine: string): string | null {
  const m = extraLine.match(/\s+([A-Za-z0-9:_-]+)\s+H=/);
  if (!m?.[1]) return null;
  const raw = m[1].trim().toUpperCase();
  if (raw.includes(":")) return raw;
  return normalizeReceiptDisplayRef(raw) ?? raw;
}

/** Parsea "2026-06-08 A393 D=0 NC" → A393 */
function parseExtraInvoiceDisplayNumber(extraLine: string): string | null {
  const m = extraLine.match(/\s+([A-Za-z0-9:_-]+)\s+D=/);
  if (!m?.[1]) return null;
  const raw = m[1].trim().toUpperCase();
  if (raw.includes(":")) return raw;
  return normalizeReceiptDisplayRef(raw) ?? raw;
}

function invoiceNumberSuffixPatterns(displayKey: string): string[] {
  const n = displayKey.trim().toUpperCase();
  if (n.includes(":")) return [n];
  const m = n.match(/^([A-Z]+)(\d+)$/);
  if (!m) return [n];
  const [, serie, num] = m;
  return [`%:${serie}:${num}`, `%:${num}`];
}

function readInvoiceCfeTipo(zetaMetadata: unknown): number | null {
  if (!zetaMetadata || typeof zetaMetadata !== "object") return null;
  const meta = zetaMetadata as Record<string, unknown>;
  const ccv1 = meta["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  const raw = ccv1?.cfe_tipo ?? (ccv1?.raw_payload as Record<string, unknown> | undefined)?.CFETipo;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function isCreditNoteInvoice(zetaMetadata: unknown, extraLine: string): boolean {
  if (/\bNC\b/i.test(extraLine)) return true;
  const cfe = readInvoiceCfeTipo(zetaMetadata);
  return cfe === 181 || cfe === 182 || cfe === 112;
}

function invoiceDisplayKeyFromRow(
  invoiceNumber: string,
  zetaMetadata: unknown
): string | null {
  const meta = zetaMetadata as Record<string, unknown> | null;
  const ccv1 = meta?.["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  const serie = String(ccv1?.serie ?? "").trim().toUpperCase();
  const numero = String(ccv1?.numero ?? "").trim();
  if (serie && numero) {
    return normalizeReceiptDisplayRef(`${serie}${numero}`) ?? `${serie}${numero}`;
  }
  const tail = invoiceNumber.match(/:([A-Z]):(\d+)$/i);
  if (tail) {
    return normalizeReceiptDisplayRef(`${tail[1]}${tail[2]}`) ?? `${tail[1]}${tail[2]}`.toUpperCase();
  }
  return null;
}

type ExtraInvoiceLookup = {
  displayKey: string;
  syncedAt: Date | null;
  invoiceNumber: string | null;
  isCreditNote: boolean;
  cfeTipo: number | null;
  extraLine: string;
};

async function lookupExtraInvoicesOrCreditNotes(
  extraLines: string[],
  displayKeys: string[]
): Promise<Map<string, ExtraInvoiceLookup>> {
  const lineByKey = new Map<string, string>();
  for (let i = 0; i < displayKeys.length; i++) {
    lineByKey.set(displayKeys[i]!, extraLines[i] ?? "");
  }

  const result = new Map<string, ExtraInvoiceLookup>();
  for (const key of displayKeys) {
    result.set(key, {
      displayKey: key,
      syncedAt: null,
      invoiceNumber: null,
      isCreditNote: false,
      cfeTipo: null,
      extraLine: lineByKey.get(key) ?? "",
    });
  }

  const orParts = new Set<string>();
  for (const key of displayKeys) {
    if (key.includes(":")) {
      orParts.add(`invoice_number.eq.${key}`);
    } else {
      for (const pat of invoiceNumberSuffixPatterns(key)) {
        orParts.add(`invoice_number.ilike.${pat}`);
      }
    }
  }

  if (orParts.size === 0) return result;

  const { data, error } = await supabase
    .from("proto_invoices")
    .select("invoice_number, created_at, zeta_metadata")
    .eq("workspace_company_id", workspaceId!)
    .or([...orParts].join(","));

  if (error || !data) return result;

  for (const row of data) {
    const invoiceNumber = String(row.invoice_number ?? "");
    const syncedAt = new Date(String(row.created_at));
    const displayKey = invoiceDisplayKeyFromRow(invoiceNumber, row.zeta_metadata);
    if (!displayKey) continue;

    const entry = result.get(displayKey);
    if (!entry) continue;

    entry.syncedAt = syncedAt;
    entry.invoiceNumber = invoiceNumber;
    entry.cfeTipo = readInvoiceCfeTipo(row.zeta_metadata);
    entry.isCreditNote = isCreditNoteInvoice(row.zeta_metadata, entry.extraLine);
  }

  return result;
}

type ExtraReceiptLookup = {
  displayKey: string;
  syncedAt: Date | null;
  receiptNumber: string | null;
  reference: string | null;
};

async function lookupExtraReceipts(
  displayKeys: string[]
): Promise<Map<string, ExtraReceiptLookup>> {
  const result = new Map<string, ExtraReceiptLookup>();
  for (const key of displayKeys) {
    result.set(key, {
      displayKey: key,
      syncedAt: null,
      receiptNumber: null,
      reference: null,
    });
  }

  const zetaIds = displayKeys.filter((k) => k.includes(":"));
  const refVariants = new Set<string>();
  for (const key of displayKeys) {
    if (!key.includes(":")) {
      for (const v of referenceLookupVariants(key)) refVariants.add(v);
    }
  }

  const orParts: string[] = [];
  for (const z of zetaIds) orParts.push(`receipt_number.eq.${z}`);
  for (const r of refVariants) orParts.push(`reference.eq.${r}`);

  if (orParts.length === 0) return result;

  const { data, error } = await supabase
    .from("proto_receipts")
    .select("receipt_number, reference, created_at")
    .eq("workspace_company_id", workspaceId!)
    .or(orParts.join(","));

  if (error || !data) return result;

  for (const row of data) {
    const syncedAt = new Date(String(row.created_at));
    const receiptNumber = String(row.receipt_number ?? "");
    const reference = row.reference == null ? null : String(row.reference);

    if (receiptNumber.includes(":")) {
      const entry = result.get(receiptNumber);
      if (entry) {
        entry.syncedAt = syncedAt;
        entry.receiptNumber = receiptNumber;
        entry.reference = reference;
      }
    }

    const refNorm = reference ? normalizeReceiptDisplayRef(reference) : null;
    if (refNorm) {
      const entry = result.get(refNorm);
      if (entry) {
        entry.syncedAt = syncedAt;
        entry.receiptNumber = receiptNumber;
        entry.reference = reference;
      }
    }
  }

  return result;
}

/**
 * Para rows DIFF_* con movimientos extra en Copilot (recibos y/o facturas/NC),
 * verifica si todos fueron sincronizados DESPUÉS del PDF export cutoff.
 */
async function reclassifyIfSnapshotStale(
  codigo: string,
  initialStatus: ZetaPdfParityAuditStatus,
  extraReceiptStrings: string[],
  extraInvoiceStrings: string[],
  pdfCutoff: Date
): Promise<{ newStatus: "SNAPSHOT_STALE" | "REAL_DIFF"; reason: string } | null> {
  const DIFF_STATUSES: ZetaPdfParityAuditStatus[] = [
    "DIFF_HABER",
    "DIFF_FINAL",
    "DIFF_DEBE",
  ];
  if (!DIFF_STATUSES.includes(initialStatus)) return null;
  if (extraReceiptStrings.length === 0 && extraInvoiceStrings.length === 0) return null;

  const receiptKeys = extraReceiptStrings
    .map(parseExtraReceiptDisplayNumber)
    .filter((n): n is string => n != null);
  const invoiceKeys = extraInvoiceStrings
    .map(parseExtraInvoiceDisplayNumber)
    .filter((n): n is string => n != null);

  snapshotStaleDebug(codigo, "initialStatus", initialStatus);
  snapshotStaleDebug(codigo, "extraReceipts", extraReceiptStrings);
  snapshotStaleDebug(codigo, "extraInvoices", extraInvoiceStrings);
  snapshotStaleDebug(codigo, "receiptKeys parsed", receiptKeys);
  snapshotStaleDebug(codigo, "invoiceKeys parsed", invoiceKeys);
  snapshotStaleDebug(codigo, "pdfCutoff", pdfCutoff.toISOString());

  const expectedReceipts = extraReceiptStrings.length;
  const expectedInvoices = extraInvoiceStrings.length;
  if (receiptKeys.length !== expectedReceipts || invoiceKeys.length !== expectedInvoices) {
    snapshotStaleDebug(codigo, "abort: unparsable extra movement lines");
    return {
      newStatus: "REAL_DIFF",
      reason: "Movimientos extra sin comprobante parseable en diff",
    };
  }

  const [receiptLookups, invoiceLookups] = await Promise.all([
    receiptKeys.length > 0 ? lookupExtraReceipts(receiptKeys) : Promise.resolve(new Map()),
    invoiceKeys.length > 0
      ? lookupExtraInvoicesOrCreditNotes(extraInvoiceStrings, invoiceKeys)
      : Promise.resolve(new Map()),
  ]);

  snapshotStaleDebug(
    codigo,
    "proto_receipts query result",
    Object.fromEntries(
      [...receiptLookups.entries()].map(([k, v]) => [
        k,
        {
          syncedAt: v.syncedAt?.toISOString() ?? null,
          receiptNumber: v.receiptNumber,
          reference: v.reference,
        },
      ])
    )
  );
  snapshotStaleDebug(
    codigo,
    "proto_invoices query result",
    Object.fromEntries(
      [...invoiceLookups.entries()].map(([k, v]) => [
        k,
        {
          syncedAt: v.syncedAt?.toISOString() ?? null,
          invoiceNumber: v.invoiceNumber,
          isCreditNote: v.isCreditNote,
          cfeTipo: v.cfeTipo,
        },
      ])
    )
  );

  type ExtraSyncRef = { label: string; syncedAt: Date | null };

  const extras: ExtraSyncRef[] = [
    ...receiptKeys.map((key) => {
      const row = receiptLookups.get(key);
      return {
        label: row?.reference ?? key,
        syncedAt: row?.syncedAt ?? null,
      };
    }),
    ...invoiceKeys.map((key) => {
      const row = invoiceLookups.get(key);
      const kind = row?.isCreditNote ? "NC" : "factura";
      return {
        label: `${key} (${kind})`,
        syncedAt: row?.syncedAt ?? null,
      };
    }),
  ];

  const unresolved = extras.filter((e) => e.syncedAt == null).map((e) => e.label);
  if (unresolved.length > 0) {
    snapshotStaleDebug(codigo, "abort: unresolved in DB", unresolved);
    return {
      newStatus: "REAL_DIFF",
      reason: `Movimientos extra no encontrados en DB: ${unresolved.join("; ")}`,
    };
  }

  const beforePdf = extras.filter((e) => e.syncedAt! <= pdfCutoff).map((e) => e.label);
  if (beforePdf.length > 0) {
    snapshotStaleDebug(codigo, "→ REAL_DIFF (synced before PDF)", beforePdf);
    return {
      newStatus: "REAL_DIFF",
      reason: `Movimientos no explicados por edad del PDF: ${beforePdf.join("; ")}`,
    };
  }

  const receiptDetails = receiptKeys.map((key) => {
    const row = receiptLookups.get(key)!;
    return `recibo ${row.reference ?? key} (${row.receiptNumber}) synced ${row.syncedAt!.toISOString().slice(0, 16)}`;
  });
  const invoiceDetails = invoiceKeys.map((key) => {
    const row = invoiceLookups.get(key)!;
    const kind = row.isCreditNote ? "NC" : "factura";
    if (row.isCreditNote) {
      return `NC ${key} (${row.invoiceNumber}) synced ${row.syncedAt!.toISOString().slice(0, 16)} — Copilot contiene comprobante posterior al PDF; snapshot PDF desactualizado`;
    }
    return `${kind} ${key} (${row.invoiceNumber}) synced ${row.syncedAt!.toISOString().slice(0, 16)}`;
  });

  const details = [...receiptDetails, ...invoiceDetails].join("; ");
  snapshotStaleDebug(codigo, "→ SNAPSHOT_STALE", details);
  return {
    newStatus: "SNAPSHOT_STALE",
    reason: `PDF exportado ${pdfCutoff.toISOString().slice(0, 16)}Z — movimientos nuevos: ${details}`,
  };
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
  if (status === "OK" || status === "ROUNDING_OK" || status === "SNAPSHOT_STALE") return "none";
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
): ZetaPdfParityAuditStatus {
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
    row.snapshotStaleReason,
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

const PASS_STATUSES: AuditStatus[] = ["OK", "ROUNDING_OK", "SNAPSHOT_STALE"];

async function main() {
  console.log("=".repeat(72));
  console.log("AUDITORÍA PDF ZETA vs COPILOT — Estado de cuenta ledger");
  console.log(`Período: ${PERIOD_FROM} .. ${PERIOD_TO}`);
  console.log("=".repeat(72));

  const pdfCutoff = computePdfCutoff(ZETA_PDFS);
  console.log(`\nPDF export cutoff: ${pdfCutoff.toISOString()} (timestamp más reciente de los PDFs)`);

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

    const initialStatus = classify(zeta, copilot);
    const notes = buildNotes(zeta, copilot);
    const movDiff = compareMovements(zeta, copilot);
    const dbOpening =
      zeta.currency === "UYU" ? (company?.obUyu ?? null) : (company?.obUsd ?? null);

    // Reclassify DIFF_* → SNAPSHOT_STALE or REAL_DIFF
    const staleExtraInvoices = filterSnapshotStaleExtraInvoices(
      movDiff.extraInvoices,
      movDiff.missingInvoices
    );
    const reclass = await reclassifyIfSnapshotStale(
      zeta.codigo,
      initialStatus,
      movDiff.extraReceipts,
      staleExtraInvoices,
      pdfCutoff
    );
    const status: AuditStatus = reclass?.newStatus ?? initialStatus;
    const snapshotStaleReason = reclass?.reason ?? "";

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
      snapshotStaleReason,
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
    "status,currency,codigo_zeta,zeta_name,copilot_name,zeta_opening,copilot_opening,zeta_debe,copilot_debe,zeta_haber,copilot_haber,zeta_final,copilot_final,zeta_movements,copilot_movements,zeta_cfe,copilot_cfe,zeta_receipts,copilot_receipts,expected_opening_zeta,current_ledger_opening_db,suggested_ledger_opening,missing_invoices,extra_invoices,missing_receipts,extra_receipts,recommended_action,parse_warnings,notes,snapshot_stale_reason";
  writeFileSync(outPath, [header, ...auditRows.map(toCsvRow)].join("\n") + "\n", "utf8");

  const passRows = auditRows.filter((r) => PASS_STATUSES.includes(r.status));
  const staleRows = auditRows.filter((r) => r.status === "SNAPSHOT_STALE");
  const realDiffRows = auditRows.filter((r) => !PASS_STATUSES.includes(r.status));

  console.log("\n" + "=".repeat(72));
  console.log("RESUMEN");
  console.log("=".repeat(72));
  console.log(`Clientes parseados UYU: ${uyuCount}`);
  console.log(`Clientes parseados USD: ${usdCount}`);
  console.log(`Total filas: ${auditRows.length}`);
  console.log(`✅ PASS (OK + ROUNDING_OK + SNAPSHOT_STALE): ${passRows.length}`);
  console.log(`📸 SNAPSHOT_STALE (documentado, no bloquea): ${staleRows.length}`);
  console.log(`❌ REAL_DIFF (requiere acción): ${realDiffRows.length}`);

  const byStatus = new Map<string, number>();
  for (const r of auditRows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }
  console.log("\nPor estado:");
  for (const [st, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st}: ${n}`);
  }

  if (staleRows.length > 0) {
    console.log("\nSNAPSHOT_STALE (Copilot más actualizado que el PDF):");
    for (const r of staleRows) {
      console.log(`  [SNAPSHOT_STALE] ${r.currency} ${r.codigo} ${r.zetaName}`);
      console.log(`    ${r.snapshotStaleReason}`);
    }
  }

  if (realDiffRows.length > 0) {
    console.log("\nREAL_DIFF (diferencias reales no explicadas por frescura del PDF):");
    for (const r of realDiffRows.slice(0, 15)) {
      console.log(
        `  [${r.status}] ${r.currency} ${r.codigo} ${r.zetaName}` +
          ` | zeta ${fmt(r.zetaOpening)}/${fmt(r.zetaDebe)}/${fmt(r.zetaHaber)}/${fmt(r.zetaFinal)}` +
          ` vs copilot ${fmt(r.copilotOpening)}/${fmt(r.copilotDebe)}/${fmt(r.copilotHaber)}/${fmt(r.copilotFinal)}` +
          (r.notes ? ` (${r.notes})` : "")
      );
    }
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

  if (realDiffRows.length > 0) {
    console.log(`\n❌ Gate FAIL — ${realDiffRows.length} REAL_DIFF requieren corrección.`);
    process.exit(1);
  } else {
    const staleNote = staleRows.length > 0 ? `${staleRows.length} SNAPSHOT_STALE documentados, ` : "";
    console.log(`\n✅ Gate PASS — ${staleNote}sin REAL_DIFF.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
