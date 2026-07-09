/**
 * Parser puro de Excel consolidado Santander (hoja "Movimientos consolidados").
 */

import type {
  SantanderBankMovementDirection,
  SantanderBankStatementParseResult,
  SantanderBankStatementPreview,
  SantanderParsedBankMovement,
} from "@/lib/bank-movements/santander-pdf-parser";
import { computeSantanderMovementTotals } from "@/lib/bank-movements/santander-bank-statement-totals";
import {
  normalizeSantanderExcelAmount,
  normalizeSantanderExcelSignedAmount,
} from "@/lib/bank-movements/santander-excel-amount";

export const SANTANDER_CONSOLIDATED_SHEET_NAME = "Movimientos consolidados";

const HEADER_ALIASES: Record<string, string[]> = {
  fecha: ["fecha"],
  referencia: ["referencia"],
  tipoConcepto: ["tipo movimiento / concepto", "tipo movimiento", "concepto"],
  descripcion: ["descripcion", "descripción"],
  debito: ["debito", "débito", "debito usd", "débito usd"],
  credito: ["credito", "crédito", "credito usd", "crédito usd"],
  importeNeto: ["importe neto", "importe neto usd"],
  saldo: ["saldo", "saldo usd"],
  moneda: ["moneda"],
  cuenta: ["cuenta"],
  archivosOrigen: ["archivos origen"],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function normalizeSheetName(value: string): string {
  return normalizeHeader(value);
}

function resolveHeaderIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let i = 0; i < normalized.length; i += 1) {
      const header = normalized[i]!;
      if (aliases.some((alias) => header === alias || header.includes(alias))) {
        index[key] = i;
        break;
      }
    }
  }

  return index;
}

function readCell(row: (string | number | null)[], columnIndex: number | undefined): unknown {
  if (columnIndex == null) return "";
  return row[columnIndex] ?? "";
}

function parseMoney(value: unknown, currency: "UYU" | "USD"): number | null {
  return normalizeSantanderExcelAmount(value, currency);
}

function parseSignedMoney(value: unknown, currency: "UYU" | "USD"): number | null {
  return normalizeSantanderExcelSignedAmount(value, currency);
}

function parseDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86_400_000));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (slash) {
    const day = slash[1]!.padStart(2, "0");
    const month = slash[2]!.padStart(2, "0");
    const year = slash[3]!.length === 2 ? `20${slash[3]}` : slash[3]!;
    return `${year}-${month}-${day}`;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function parseCurrency(value: unknown): "UYU" | "USD" | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (upper.includes("USD") || upper.includes("U$S") || upper === "840") return "USD";
  if (upper.includes("UYU") || upper.includes("$U") || upper === "858") return "UYU";
  return null;
}

function normalizeAccountNumber(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

export function findSantanderConsolidatedSheetName(sheetNames: string[]): string | null {
  const target = normalizeSheetName(SANTANDER_CONSOLIDATED_SHEET_NAME);
  return sheetNames.find((name) => normalizeSheetName(name) === target) ?? null;
}

export function isSantanderConsolidatedRows(rows: (string | number | null)[][]): boolean {
  if (rows.length < 2) return false;
  const headers = rows[0]!.map((cell) => String(cell ?? ""));
  const headerIndex = resolveHeaderIndex(headers);
  const hasDate = headerIndex.fecha != null;
  const hasAccount = headerIndex.cuenta != null;
  const hasCurrency = headerIndex.moneda != null;
  const hasAmount =
    headerIndex.debito != null ||
    headerIndex.credito != null ||
    headerIndex.importeNeto != null;
  const hasDescription = headerIndex.tipoConcepto != null || headerIndex.descripcion != null;
  return hasDate && hasAccount && hasCurrency && hasAmount && hasDescription;
}

function buildMovementFromRow(
  row: (string | number | null)[],
  headerIndex: Record<string, number>,
  currency: "UYU" | "USD"
): SantanderParsedBankMovement | null {
  const movementDate = parseDate(readCell(row, headerIndex.fecha));
  const tipoConcepto = String(readCell(row, headerIndex.tipoConcepto)).trim();
  const descripcion = String(readCell(row, headerIndex.descripcion)).trim();
  const description = tipoConcepto || descripcion;
  if (!movementDate || !description) return null;

  const debit = parseMoney(readCell(row, headerIndex.debito), currency);
  const credit = parseMoney(readCell(row, headerIndex.credito), currency);
  const netAmount = parseSignedMoney(readCell(row, headerIndex.importeNeto), currency);
  const balance = parseSignedMoney(readCell(row, headerIndex.saldo), currency);

  let direction: SantanderBankMovementDirection;
  let amount: number;
  let debitOut: number | null = debit;
  let creditIn: number | null = credit;

  if (debit != null && debit > 0) {
    direction = "outflow";
    amount = -debit;
  } else if (credit != null && credit > 0) {
    direction = "inflow";
    amount = credit;
  } else if (netAmount != null && netAmount !== 0) {
    direction = netAmount < 0 ? "outflow" : "inflow";
    amount = netAmount;
    debitOut = netAmount < 0 ? Math.abs(netAmount) : null;
    creditIn = netAmount > 0 ? netAmount : null;
  } else {
    return null;
  }

  const referenceRaw = String(readCell(row, headerIndex.referencia)).trim();
  const reference = referenceRaw || null;
  const sourceFileRaw = String(readCell(row, headerIndex.archivosOrigen)).trim();
  const source_file = sourceFileRaw || null;
  const raw_text = descripcion && descripcion !== description ? descripcion : description;

  return {
    date: movementDate,
    reference,
    type: tipoConcepto && descripcion && tipoConcepto !== descripcion ? tipoConcepto : "",
    description,
    debit: debitOut,
    credit: creditIn,
    amount,
    direction,
    balance,
    raw_text,
    source_file,
  };
}

export function parseSantanderConsolidatedExcelRows(
  rows: (string | number | null)[][]
): SantanderBankStatementParseResult {
  if (!isSantanderConsolidatedRows(rows)) {
    throw new Error("NOT_CONSOLIDATED");
  }

  const headers = rows[0]!.map((cell) => String(cell ?? ""));
  const headerIndex = resolveHeaderIndex(headers);
  const movements: SantanderParsedBankMovement[] = [];
  let account_number: string | null = null;
  let currency_code: "UYU" | "USD" | null = null;

  for (const row of rows.slice(1)) {
    const cells = row.map((cell) => cell ?? "");
    const rowAccount = normalizeAccountNumber(readCell(cells, headerIndex.cuenta));
    const rowCurrency = parseCurrency(readCell(cells, headerIndex.moneda));
    if (rowAccount) account_number = rowAccount;
    if (rowCurrency) currency_code = rowCurrency;

    const movement = buildMovementFromRow(cells, headerIndex, rowCurrency ?? currency_code ?? "UYU");
    if (movement) movements.push(movement);
  }

  if (!account_number || !currency_code || movements.length === 0) {
    throw new Error("NO_MOVEMENTS");
  }

  const dates = movements.map((m) => m.date).sort();
  const period_start = dates[0]!;
  const period_end = dates[dates.length - 1]!;
  const opening_balance = movements[0]?.balance ?? null;
  const closing_balance = movements[movements.length - 1]?.balance ?? null;

  return {
    bank_name: "Santander",
    account_number,
    currency_code,
    period_start,
    period_end,
    opening_balance,
    closing_balance,
    movements,
  };
}

export async function parseSantanderConsolidatedExcelBuffer(
  buffer: Buffer
): Promise<SantanderBankStatementParseResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = findSantanderConsolidatedSheetName(workbook.SheetNames);
  if (!sheetName) {
    throw new Error("NOT_CONSOLIDATED");
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("EMPTY_FILE");
  }
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return parseSantanderConsolidatedExcelRows(rows);
}

export async function isSantanderConsolidatedExcelBuffer(buffer: Buffer): Promise<boolean> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = findSantanderConsolidatedSheetName(workbook.SheetNames);
    if (!sheetName) return false;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return false;
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return isSantanderConsolidatedRows(rows);
  } catch {
    return false;
  }
}

export async function buildSantanderConsolidatedExcelPreview(
  buffer: Buffer
): Promise<SantanderBankStatementPreview> {
  const parsed = await parseSantanderConsolidatedExcelBuffer(buffer);
  const totals = computeSantanderMovementTotals(parsed.movements);
  return {
    ...parsed,
    movements_count: parsed.movements.length,
    totals,
  };
}
