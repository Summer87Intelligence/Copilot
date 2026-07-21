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
// Strict variant: decimal part is required (`,\d{2}`), so bare integers are NOT matched.
const UY_STRICT_MONEY_SRC = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}`;
// Relaxed variant: also matches thousand-separated integers without decimal (e.g. UYU "3.335").
const UY_RELAXED_MONEY_SRC = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d{1,3}(?:\.\d{3})+|-?\d+,\d{2}`;

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

function findStrictMoneyAmounts(text: string): string[] {
  return [...text.matchAll(new RegExp(UY_STRICT_MONEY_SRC, "g"))].map((m) => m[0]);
}

function findRelaxedMoneyAmounts(text: string): string[] {
  return [...text.matchAll(new RegExp(UY_RELAXED_MONEY_SRC, "g"))].map((m) => m[0]);
}

function extractRefDescFromRemainder(text: string): { reference: string; description: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const refParts: string[] = [];
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i]!;
    // Reference token: must contain at least one digit, only alphanumeric/hyphen chars
    if (/\d/.test(t) && /^[A-Z0-9-]+$/i.test(t)) {
      refParts.push(t);
    } else {
      break;
    }
  }
  return {
    reference: refParts.join(""),
    description: tokens.slice(i).join(" ").trim(),
  };
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
    (normalized.includes("debito") || normalized.includes("credito")) &&
    normalized.includes("saldo");

  if (!hasHeader) return false;

  // Accept if Santander brand is present alongside movement section
  if (normalized.includes("santander") && normalized.includes("movimientos")) {
    return true;
  }

  // Accept by structure when brand text is not extractable (e.g. logo as image):
  // requires bank-level field markers + date range
  const hasBankStructure =
    (normalized.includes("cliente") || normalized.includes("cuenta")) &&
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
      (normalized.includes("debito") || normalized.includes("credito")) &&
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
    // No forzar Math.abs(): el extracto puede quedar en saldo negativo de forma legítima
    // (confirmado con el extracto real USD 005101107711, 06/07/2026) y el token de saldo ya
    // trae su propio signo "-" en el texto — forzarlo a positivo ocultaba ese saldo negativo real.
    balanceAfter: balanceAfter,
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

function movementFromDateBlockStr(
  block: string,
  metadata: SantanderPdfMetadata
): SantanderParsedMovement | null {
  const lines = block.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0]!;
  if (!ROW_DATE_START.test(firstLine)) return null;
  const firstLower = firstLine.toLowerCase();
  if (firstLower.includes("saldo informado") || firstLower.includes("movimientos en tr")) return null;

  // Collapse relevant lines; stop at next date start or known footer lines.
  // "saldo inicial"/"saldo final" deben cortar el bloque igual que una fecha:
  // el ULTIMO movimiento del extracto no tiene una fecha siguiente que lo
  // limite, así que sin este corte la línea de saldo final (y cualquier
  // marcador de página que la siga) queda fusionada dentro del movimiento —
  // y como isBalanceRow reconoce "saldo final" en la descripción, ese
  // movimiento real termina descartado en silencio (bug real confirmado con
  // los dos extractos de julio 2026).
  const relevantLines: string[] = [firstLine];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (ROW_DATE_START.test(l)) break;
    const ll = l.toLowerCase();
    if (
      ll.includes("saldo informado") ||
      ll.includes("movimientos en tr") ||
      ll.includes("saldo inicial") ||
      ll.includes("saldo final")
    ) {
      break;
    }
    relevantLines.push(l);
  }

  const collapsed = relevantLines.join(" ").replace(/\s+/g, " ").trim();
  const dateMatch = /^(\d{2}\/\d{2}\/\d{4})\b/.exec(collapsed);
  if (!dateMatch) return null;
  const movementDate = parseSantanderPdfDate(dateMatch[1]!);
  if (!movementDate) return null;

  let moneyAmounts = findStrictMoneyAmounts(collapsed);
  let activeMoneyReSrc = UY_STRICT_MONEY_SRC;

  // Relax matching for UYU amounts without `,\d{2}` decimal (e.g. "3.335" from pdf-parse)
  if (moneyAmounts.length < 2) {
    moneyAmounts = findRelaxedMoneyAmounts(collapsed);
    activeMoneyReSrc = UY_RELAXED_MONEY_SRC;
  }

  if (moneyAmounts.length < 2) return null;

  const balanceRaw = moneyAmounts[moneyAmounts.length - 1]!;
  const amountRaw = moneyAmounts[moneyAmounts.length - 2]!;
  const balanceAfterValue = parseUruguayMoney(balanceRaw);
  const amountValue = parseUruguayMoney(amountRaw);
  if (amountValue == null || amountValue === 0) return null;

  const movementType: BankMovementType = amountValue < 0 ? "debit" : "credit";
  const amount = Math.abs(amountValue);

  const activeMoneyRe = new RegExp(activeMoneyReSrc, "g");
  const remainder = collapsed
    .replace(/^\d{2}\/\d{2}\/\d{4}\s*/, "")
    .replace(activeMoneyRe, " ")
    .replace(/\s+/g, " ")
    .trim();

  const { reference, description } = extractRefDescFromRemainder(remainder);
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
    // No forzar Math.abs(): ver comentario equivalente en movementFromColumns más arriba.
    balanceAfter: balanceAfterValue,
    importedFrom: "csv",
    rawPayload: {
      source: "pdf",
      reference: documentNumber,
      rawBlock: block,
      clientName: metadata.clientName,
      accountNumber: metadata.accountNumber,
      periodFrom: metadata.periodFrom,
      periodTo: metadata.periodTo,
    },
  };
}

function parseSantanderPdfRowsByDateBlocks(
  text: string,
  metadata: SantanderPdfMetadata
): SantanderParsedMovement[] {
  const blocks = text
    .replace(/\r/g, "")
    .split(/(?=\b\d{2}\/\d{2}\/\d{4}\b)/)
    .filter((b) => /^\s*\d{2}\/\d{2}\/\d{4}/.test(b));

  const out: SantanderParsedMovement[] = [];
  for (const block of blocks) {
    const movement = movementFromDateBlockStr(block, metadata);
    if (movement) out.push(movement);
  }

  if (process.env.NODE_ENV === "development" && out.length === 0 && blocks.length > 0) {
    console.log("[santander-pdf] date-block fallback: 0 movements from", blocks.length, "blocks");
  }

  return out;
}

export function parseSantanderPdfMovements(
  text: string,
  metadata: SantanderPdfMetadata = parseSantanderPdfMetadata(text)
): SantanderParsedMovement[] {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const startIdx = findTableStartIndex(lines);

  // Tab-separated: use column-aware tabular parser (fastest, most accurate)
  if (startIdx >= 0) {
    const tableLines = lines.slice(startIdx).filter(Boolean);
    if (tableLines.some((l) => l.includes("\t"))) {
      const tabular = parseTabularLines(tableLines, metadata);
      if (tabular.length > 0) return tabular;
    }
  }

  // Robust fallback: date-block approach handles space-separated PDFs and split references
  const dateBlocks = parseSantanderPdfRowsByDateBlocks(text, metadata);
  if (dateBlocks.length > 0) return dateBlocks;

  // Last resort: original multiline block parser (requires header to be detected)
  if (startIdx >= 0) {
    const tableLines = lines.slice(startIdx).filter(Boolean);
    return parseMultilineBlocks(tableLines.join("\n"), metadata);
  }

  return [];
}

export function parseSantanderPdfStatementText(text: string): {
  metadata: SantanderPdfMetadata;
  movements: SantanderParsedMovement[];
} {
  const metadata = parseSantanderPdfMetadata(text);
  const movements = parseSantanderPdfMovements(text, metadata);
  return { metadata, movements };
}
