/**
 * Parser puro de extractos Santander PDF para el módulo Movimientos bancarios.
 * Recibe texto ya extraído del PDF — no toca DB ni lee binarios.
 */

import {
  isSantanderPdfStatementText,
  parseSantanderPdfMetadata,
  parseSantanderPdfMovements,
  parseSantanderPdfDate,
  parseUruguayMoney,
} from "@/lib/treasury/santander-pdf-statement-parser";
import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";

export type SantanderBankMovementDirection = "inflow" | "outflow";

export type SantanderParsedBankMovement = {
  date: string;
  reference: string | null;
  type: string;
  description: string;
  debit: number | null;
  credit: number | null;
  amount: number;
  direction: SantanderBankMovementDirection;
  balance: number | null;
  raw_text: string;
};

export type SantanderBankStatementParseResult = {
  bank_name: "Santander";
  account_number: string;
  currency_code: "UYU" | "USD";
  period_start: string;
  period_end: string;
  opening_balance: number | null;
  closing_balance: number | null;
  movements: SantanderParsedBankMovement[];
};

export type SantanderBankStatementPreview = SantanderBankStatementParseResult & {
  movements_count: number;
  totals: {
    inflows: number;
    outflows: number;
    net: number;
  };
};

const UY_MONEY_PATTERN = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|-?\d+(?:,\d{2})?/g;

const ROW_DATE_START = /^\d{2}\/\d{2}\/\d{4}\b/;
const TABLE_HEADER_RE = /fecha.*(?:debito|débito).*(?:credito|crédito).*saldo/i;

function normalizeMatchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function isTableFooterLine(line: string): boolean {
  const lower = normalizeMatchText(line);
  return (
    lower.includes("saldo informado") ||
    lower.includes("movimientos en transito") ||
    lower.includes("movimientos en tránsito")
  );
}

/** Une líneas de descripción que pdf-parse separa del movimiento. */
export function joinMultilineMovementRows(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (TABLE_HEADER_RE.test(normalizeMatchText(line))) {
      inTable = true;
      out.push(line);
      continue;
    }

    if (!inTable || isTableFooterLine(line)) {
      inTable = false;
      out.push(line);
      continue;
    }

    const lower = normalizeMatchText(line);
    if (
      ROW_DATE_START.test(line) ||
      lower.includes("saldo inicial") ||
      lower.includes("saldo final")
    ) {
      out.push(line);
      continue;
    }

    if (out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]!} ${line}`;
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

/** Normaliza artefactos comunes de pdf-parse (fechas partidas, espacios). */
export function normalizeSantanderPdfExtractedText(text: string): string {
  const joined = joinMultilineMovementRows(
    text
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/(\b\d{2}\/\d{2}\/)(\d{2})\s*\n\s*(\d{2})\b/g, "$1$2$3")
      .replace(/(\b\d{2}\/\d{2}\/)(\d{2})\s+(\d{2})\b(?=\s)/g, "$1$2$3")
  );
  return joined;
}

function moneyTokens(line: string): string[] {
  return [...line.matchAll(UY_MONEY_PATTERN)].map((m) => m[0]);
}

function extractOpeningClosingBalances(text: string): {
  opening_balance: number | null;
  closing_balance: number | null;
} {
  let opening_balance: number | null = null;
  let closing_balance: number | null = null;

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");

    if (lower.includes("saldo inicial")) {
      const tokens = moneyTokens(line);
      if (tokens.length > 0) {
        opening_balance = parseUruguayMoney(tokens[tokens.length - 1]);
      }
      continue;
    }

    if (lower.includes("saldo final")) {
      const tokens = moneyTokens(line);
      if (tokens.length > 0) {
        closing_balance = parseUruguayMoney(tokens[tokens.length - 1]);
      }
    }
  }

  return { opening_balance, closing_balance };
}

function isBalanceRow(description: string): boolean {
  const lower = description
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return lower.includes("saldo inicial") || lower.includes("saldo final");
}

function rawTextFromMovement(movement: SantanderParsedMovement): string {
  const rawBlock = movement.rawPayload.rawBlock;
  if (typeof rawBlock === "string" && rawBlock.trim()) return rawBlock.trim();
  return movement.description;
}

function mapTreasuryMovement(movement: SantanderParsedMovement): SantanderParsedBankMovement {
  const isOutflow = movement.movementType === "debit";
  const debit = isOutflow ? movement.amount : null;
  const credit = !isOutflow ? movement.amount : null;
  const amount = isOutflow ? -movement.amount : movement.amount;

  return {
    date: movement.movementDate,
    reference: movement.documentNumber,
    type: "",
    description: movement.description,
    debit,
    credit,
    amount,
    direction: isOutflow ? "outflow" : "inflow",
    balance: movement.balanceAfter,
    raw_text: rawTextFromMovement(movement),
  };
}

function computeTotals(movements: SantanderParsedBankMovement[]): {
  inflows: number;
  outflows: number;
  net: number;
} {
  let inflows = 0;
  let outflows = 0;
  for (const m of movements) {
    if (m.direction === "inflow" && m.credit != null) inflows += m.credit;
    if (m.direction === "outflow" && m.debit != null) outflows += m.debit;
  }
  return {
    inflows: roundMoney(inflows),
    outflows: roundMoney(outflows),
    net: roundMoney(inflows - outflows),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseSantanderBankStatementText(text: string): SantanderBankStatementParseResult {
  const normalized = normalizeSantanderPdfExtractedText(text);

  if (!isSantanderPdfStatementText(normalized)) {
    throw new Error("NOT_SANTANDER");
  }

  const metadata = parseSantanderPdfMetadata(normalized);
  const treasuryMovements = parseSantanderPdfMovements(normalized, metadata);
  const { opening_balance, closing_balance } = extractOpeningClosingBalances(normalized);

  const movements = treasuryMovements
    .map(mapTreasuryMovement)
    .filter((m) => !isBalanceRow(m.description));

  if (movements.length === 0) {
    throw new Error("NO_MOVEMENTS");
  }

  const account_number = metadata.accountNumber ?? "";
  const period_start = metadata.periodFrom ?? "";
  const period_end = metadata.periodTo ?? "";

  if (!account_number || !period_start || !period_end) {
    throw new Error("INCOMPLETE_METADATA");
  }

  return {
    bank_name: "Santander",
    account_number,
    currency_code: metadata.currencyCode,
    period_start,
    period_end,
    opening_balance,
    closing_balance,
    movements,
  };
}

export function buildSantanderBankStatementPreview(
  text: string
): SantanderBankStatementPreview {
  const parsed = parseSantanderBankStatementText(text);
  const totals = computeTotals(parsed.movements);
  return {
    ...parsed,
    movements_count: parsed.movements.length,
    totals,
  };
}

export { parseSantanderPdfDate, parseUruguayMoney };
