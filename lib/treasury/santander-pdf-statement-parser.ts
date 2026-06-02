import type { BankMovementType, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";
import { buildSantanderMovementExternalId } from "@/lib/treasury/santander-statement-parser";

export type SantanderPdfMetadata = {
  clientName: string | null;
  accountNumber: string | null;
  accountLabel: string | null;
  currencyCode: TreasuryCurrencyCode;
  periodFrom: string | null;
  periodTo: string | null;
};

const UY_MONEY_PATTERN = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|-?\d+(?:,\d{2})?/g;
const DATE_PATTERN = /\b(\d{2}\/\d{2}\/\d{4})\b/;
const ROW_DATE_START = /^\d{2}\/\d{2}\/\d{4}\b/;

function normalizePdfText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeMatchText(text: string): string {
  return normalizePdfText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function parseSantanderPdfDate(value: string): string | null {
  const trimmed = value.trim();
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (!slash) return null;
  const day = slash[1]!.padStart(2, "0");
  const month = slash[2]!.padStart(2, "0");
  const year = slash[3]!.length === 2 ? `20${slash[3]}` : slash[3]!;
  return `${year}-${month}-${day}`;
}

export function parseUruguayMoney(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.includes("-");
  const cleaned = trimmed
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  if (negative && n > 0) return -n;
  return n;
}

export function isSantanderPdfStatementText(text: string): boolean {
  const normalized = normalizeMatchText(text);

  const hasHeader =
    normalized.includes("fecha") &&
    normalized.includes("referencia") &&
    (normalized.includes("debito") || normalized.includes("debito")) &&
    (normalized.includes("credito") || normalized.includes("credito")) &&
    normalized.includes("saldo");

  if (!hasHeader) return false;

  // Accept if Santander brand is present alongside movement section
  if (normalized.includes("santander") && normalized.includes("movimientos")) {
    return true;
  }

  // Accept by structure when brand text is not extractable (e.g. logo as image):
  // requires bank-level field markers + date range
  const hasBankStructure =
    normalized.includes("cliente") &&
    normalized.includes("cuenta") &&
    normalized.includes("moneda") &&
    normalized.includes("movimientos");

  const hasDateRange = /\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(text);

  return hasBankStructure && hasDateRange;
}

export function parseSantanderPdfMetadata(text: string): SantanderPdfMetadata {
  // Support both "Cliente: value" (with colon) and "Cliente\nvalue" (logo-as-image PDFs)
  const clientMatch =
    /Cliente:\s*(.+?)(?:\n|$)/i.exec(text) ??
    /\bCliente\b[^\n]*\n([^\n]+)/i.exec(text);

  // Support both "Cuenta: value" and "Cuenta ...\nvalue"
  const accountMatch =
    /Cuenta:\s*(.+?)(?:\n|$)/i.exec(text) ??
    /\bCuenta\b[^\n]*\n([^\n]+)/i.exec(text);

  // Support "Moneda: USD" and standalone "USD/UYU" in the header section
  const currencyMatch =
    /Moneda:\s*(USD|UYU|U\$S)/i.exec(text) ??
    /\b(USD|UYU|U\$S)\b/.exec(text.slice(0, 600));

  const periodMatch =
    /Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text) ??
    /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/.exec(text);

  const accountLabel = accountMatch?.[1]?.trim() ?? null;
  const accountNumber =
    accountLabel?.match(/(\d{6,})/)?.[1] ??
    text.match(/\b(\d{10,})\b/)?.[1] ??
    null;

  let currencyCode: TreasuryCurrencyCode = "UYU";
  const currencyRaw = currencyMatch?.[1]?.toUpperCase() ?? "";
  if (currencyRaw.includes("USD") || currencyRaw.includes("U$S")) currencyCode = "USD";

  return {
    clientName: clientMatch?.[1]?.trim() ?? null,
    accountNumber,
    accountLabel,
    currencyCode,
    periodFrom: periodMatch?.[1] ? parseSantanderPdfDate(periodMatch[1]) : null,
    periodTo: periodMatch?.[2] ? parseSantanderPdfDate(periodMatch[2]) : null,
  };
}

function isTableDataLine(line: string): boolean {
  if (!ROW_DATE_START.test(line.trim())) return false;
  const lower = line.toLowerCase();
  if (lower.includes("saldo informado")) return false;
  if (lower.includes("movimientos en tránsito")) return false;
  return true;
}

function findTableStartIndex(lines: readonly string[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeMatchText(lines[i] ?? "");
    if (
      normalized.includes("fecha") &&
      normalized.includes("referencia") &&
      normalized.includes("debito") &&
      normalized.includes("credito") &&
      normalized.includes("saldo")
    ) {
      return i + 1;
    }
  }
  return -1;
}

function splitRowCells(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim());
  }
  return line.split(/\s{2,}/).map((cell) => cell.trim());
}

function extractReferenceAndDescription(textPart: string): { reference: string; description: string } {
  const trimmed = textPart.trim();
  if (!trimmed) return { reference: "", description: "" };

  const refMatch =
    /^([A-Z]{0,4}\d{4,}[A-Z0-9]*)\b/i.exec(trimmed) ??
    /^(\d{4,})\b/.exec(trimmed) ??
    /^([A-Z0-9-]{4,})\b/i.exec(trimmed);
  if (!refMatch) {
    return { reference: "", description: trimmed };
  }
  const reference = refMatch[1] ?? "";
  const description = trimmed.slice(refMatch[0].length).trim();
  return { reference, description };
}

function movementFromColumns(
  cells: string[],
  metadata: SantanderPdfMetadata,
  rawBlock: string
): SantanderParsedMovement | null {
  const movementDate = parseSantanderPdfDate(cells[0] ?? "");
  if (!movementDate) return null;

  let reference = "";
  let description = "";
  let debitRaw = "";
  let creditRaw = "";
  let balanceRaw = "";

  if (cells.length >= 7) {
    reference = cells[1] ?? "";
    description = cells[3] ?? "";
    debitRaw = cells[4] ?? "";
    creditRaw = cells[5] ?? "";
    balanceRaw = cells[6] ?? "";
  } else if (cells.length === 6) {
    reference = cells[1] ?? "";
    description = cells[2] ?? "";
    debitRaw = cells[3] ?? "";
    creditRaw = cells[4] ?? "";
    balanceRaw = cells[5] ?? "";
  } else {
    const moneyTokens = [...rawBlock.matchAll(UY_MONEY_PATTERN)].map((m) => m[0]);
    if (moneyTokens.length === 0) return null;
    balanceRaw = moneyTokens[moneyTokens.length - 1] ?? "";
    if (moneyTokens.length >= 2) {
      const prior = moneyTokens[moneyTokens.length - 2] ?? "";
      if (prior.includes("-")) debitRaw = prior;
      else creditRaw = prior;
    }
    const textWithoutMoney = rawBlock
      .replace(DATE_PATTERN, " ")
      .replace(UY_MONEY_PATTERN, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parsed = extractReferenceAndDescription(textWithoutMoney.slice(10).trim());
    reference = parsed.reference;
    description = parsed.description;
  }

  const debit = parseUruguayMoney(debitRaw);
  const credit = parseUruguayMoney(creditRaw);
  const balanceAfter = parseUruguayMoney(balanceRaw);

  let movementType: BankMovementType;
  let amount: number;
  if (debit != null && Math.abs(debit) > 0) {
    movementType = "debit";
    amount = Math.abs(debit);
  } else if (credit != null && credit > 0) {
    movementType = "credit";
    amount = credit;
  } else {
    return null;
  }

  if (!description) return null;

  const documentNumber = reference || null;
  const externalId = buildSantanderMovementExternalId({
    movementDate,
    description,
    amount,
    movementType,
    documentNumber,
  });

  return {
    movementDate,
    description,
    amount,
    currencyCode: metadata.currencyCode,
    movementType,
    externalId,
    documentNumber,
    balanceAfter: balanceAfter != null ? Math.abs(balanceAfter) : null,
    importedFrom: "csv",
    rawPayload: {
      source: "pdf",
      reference: documentNumber,
      rawBlock,
      clientName: metadata.clientName,
      accountNumber: metadata.accountNumber,
      periodFrom: metadata.periodFrom,
      periodTo: metadata.periodTo,
    },
  };
}

function parseTabularLines(
  lines: readonly string[],
  metadata: SantanderPdfMetadata
): SantanderParsedMovement[] {
  const out: SantanderParsedMovement[] = [];
  for (const line of lines) {
    if (!isTableDataLine(line)) continue;
    const movement = movementFromColumns(splitRowCells(line), metadata, line);
    if (movement) out.push(movement);
  }
  return out;
}

function splitMovementBlocks(tableText: string): string[] {
  const normalized = tableText.replace(/\r/g, "").trim();
  if (!normalized) return [];
  return normalized
    .split(/(?=\d{2}\/\d{2}\/\d{4}\b)/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => ROW_DATE_START.test(block));
}

function parseMultilineBlocks(
  tableText: string,
  metadata: SantanderPdfMetadata
): SantanderParsedMovement[] {
  const out: SantanderParsedMovement[] = [];
  for (const block of splitMovementBlocks(tableText)) {
    if (!isTableDataLine(block.split("\n")[0] ?? block)) continue;
    const singleLine = block.replace(/\s+/g, " ").trim();
    const movement = movementFromColumns(splitRowCells(singleLine), metadata, block);
    if (movement) out.push(movement);
  }
  return out;
}

export function parseSantanderPdfMovements(
  text: string,
  metadata: SantanderPdfMetadata = parseSantanderPdfMetadata(text)
): SantanderParsedMovement[] {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const startIdx = findTableStartIndex(lines);
  if (startIdx < 0) return [];

  const tableLines = lines.slice(startIdx).filter(Boolean);
  const tabular = parseTabularLines(tableLines, metadata);
  if (tabular.length > 0) return tabular;

  return parseMultilineBlocks(tableLines.join("\n"), metadata);
}

export function parseSantanderPdfStatementText(text: string): {
  metadata: SantanderPdfMetadata;
  movements: SantanderParsedMovement[];
} {
  const metadata = parseSantanderPdfMetadata(text);
  const movements = parseSantanderPdfMovements(text, metadata);
  return { metadata, movements };
}
