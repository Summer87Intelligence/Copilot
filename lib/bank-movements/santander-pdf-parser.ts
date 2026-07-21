/**
 * Parser puro de extractos Santander PDF para el módulo Movimientos bancarios.
 * Recibe texto ya extraído del PDF — no toca DB ni lee binarios.
 */

import { computeSantanderMovementTotals } from "@/lib/bank-movements/santander-bank-statement-totals";
import {
  isSantanderPdfStatementText,
  parseSantanderPdfMetadata,
  parseSantanderPdfMovements,
  parseSantanderPdfDate,
  parseUruguayMoney,
} from "@/lib/treasury/santander-pdf-statement-parser";
import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";

export type SantanderBankMovementDirection = "inflow" | "outflow";

/** Sección 10 — resultado de validar saldo_anterior + crédito + débito = saldo_actual por fila. */
export type SantanderBalanceCheck = "ok" | "mismatch" | "unknown";

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
  source_file?: string | null;
  /**
   * Campos adicionales del parser PDF (secciones 9-13 de BANK-V3-APPLY-PDF-IMPORT-FIX-AND-
   * DEMO-READY-001). Opcionales: el productor Excel consolidado (santander-excel-consolidated-
   * parser.ts) no los completa — se mantiene sin cambios esta fase, fuera de alcance (solo
   * PDF). Cuando faltan, tratar como "no calculado", no como "vacío conocido".
   */
  /** Sección 12 — identidad estructurada del pagador/beneficiario. Solo el parser: sin persistencia/aprendizaje. */
  payer_name_raw?: string | null;
  payer_name_normalized?: string | null;
  payer_token?: string | null;
  /** Referencia de operación tipo LR/TR/TT/LE embebida en la descripción (sección 9). */
  embedded_reference?: string | null;
  /** NRR (número de referencia de red) cuando el banco lo incluye (sección 9). */
  nrr?: string | null;
  /** Sección 10 — saldo antes de este movimiento y resultado de la validación de esa fila. */
  balance_before?: number | null;
  balance_check?: SantanderBalanceCheck;
  /**
   * Sección 11 — agrupa principal + comisión de la MISMA operación sin fusionarlos en un
   * solo movimiento. null cuando no hay referencia de operación que permita un agrupamiento
   * seguro (nunca se agrupa solo por nombre o monto).
   */
  operation_group_key?: string | null;
  /**
   * Sección 13 — fingerprint de deduplicación recomendado (más robusto que `reference` solo):
   * cuenta + moneda + fecha + referencia normalizada + tipo + débito + crédito + descripción
   * normalizada + ocurrencia. Es un campo adicional del parser; el `external_id` real usado
   * para deduplicar en producción (`buildSantanderMovementExternalId`) NO se modifica esta
   * fase para no invalidar la deduplicación de extractos ya importados (CSV/Excel/PDF
   * comparten esa función) — ver INFORME FINAL.
   */
  dedup_fingerprint?: string;
};

export type SantanderStatementBalanceValidation = {
  ok: boolean;
  opening_balance: number | null;
  closing_balance_expected: number | null;
  closing_balance_computed: number | null;
  difference: number | null;
  row_mismatches_count: number;
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
  /** Sección 10. Opcional: no calculado por el productor Excel consolidado (fuera de alcance esta fase). */
  balance_validation?: SantanderStatementBalanceValidation;
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

/**
 * Marcador de salto de pagina que `pdf-parse` intercala entre paginas
 * (ej. "-- 5 of 6 --"). No es contenido del extracto: si no se retira antes
 * de acumular lineas por movimiento, cuando cae justo despues del ultimo
 * movimiento de la ultima pagina, termina fusionado con la linea "Saldo
 * final" (no hay una fecha siguiente que corte el bloque) - y como
 * `isBalanceRow` reconoce esa descripcion contaminada como fila de saldo, el
 * movimiento real se descarta en silencio. Confirmado con los dos extractos
 * reales de julio 2026 (cuenta USD 005101107711 y UYU 000001211749): ambos
 * perdian su ultimo movimiento por este motivo antes de este fix.
 */
const PDF_PAGE_MARKER_RE = /\n{0,2}--\s*\d+\s+of\s+\d+\s*--\n{0,2}/gi;

/** Normaliza artefactos comunes de pdf-parse (fechas partidas, espacios, marcador de pagina). */
export function normalizeSantanderPdfExtractedText(text: string): string {
  const joined = joinMultilineMovementRows(
    text
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(PDF_PAGE_MARKER_RE, "\n")
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

const NRR_RE = /NRR:?\s*(\d+)/i;
/** LR/TR/TT/LE + dígitos: referencia de operación de transferencia (sección 9). */
const OPERATION_REF_PREFIX_RE = /^(LR|TR|TT|LE)\d+/i;
/** Texto que suele preceder al nombre del pagador/beneficiario en la descripción del banco. */
const PAYER_NAME_MARKER_PATTERNS: RegExp[] = [
  /NRR:?\s*\d+\s+(.+)$/i,
  /TRF\.?\s*PLAZA\s*-\s*(.+)$/i,
  /RECIBIDA\s*\/?\s*(.+)$/i,
];

/** Descarta tokens iniciales que contienen dígitos (referencias/identificadores), no nombres. */
function stripLeadingReferenceTokens(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && /\d/.test(tokens[i]!)) i += 1;
  return tokens.slice(i).join(" ");
}

function extractNrr(description: string): string | null {
  const m = NRR_RE.exec(description);
  return m ? m[1]! : null;
}

function extractEmbeddedReference(reference: string | null): string | null {
  if (!reference) return null;
  return OPERATION_REF_PREFIX_RE.test(reference) ? reference : null;
}

/**
 * Heurística de mejor esfuerzo (sección 12): el nombre del pagador/beneficiario no siempre
 * está delimitado de forma inequívoca en el texto del banco. Cubre los patrones reales
 * observados en los extractos de julio 2026 (RECIBIDA / TRF. PLAZA- / NRR:<dígitos>). Nunca
 * se persiste ni se usa para aprendizaje esta fase — es solo un campo estructurado del parser.
 */
function extractPayerNameRaw(description: string): string | null {
  for (const re of PAYER_NAME_MARKER_PATTERNS) {
    const m = re.exec(description);
    if (!m || !m[1]) continue;
    const cleaned = stripLeadingReferenceTokens(m[1]);
    if (cleaned.length >= 3) return cleaned;
  }
  return null;
}

function normalizePayerName(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function payerTokenFromNormalized(normalized: string | null): string | null {
  if (!normalized) return null;
  const token = normalized.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return token || null;
}

/**
 * Sección 11 — clave que agrupa principal + comisión de una misma operación sin fusionarlos.
 * Solo se genera cuando hay una referencia real (nunca por nombre/monto solamente): en los
 * extractos reales, la comisión de una transferencia comparte exactamente la misma referencia
 * (y a veces el mismo NRR) que su movimiento principal.
 */
function buildOperationGroupKey(params: {
  accountNumber: string;
  currencyCode: string;
  movementDate: string;
  reference: string | null;
  nrr: string | null;
}): string | null {
  if (!params.reference) return null;
  const parts = [params.accountNumber, params.currencyCode, params.movementDate, params.reference.toUpperCase()];
  if (params.nrr) parts.push(`NRR${params.nrr}`);
  return parts.join("|");
}

function normalizeDescriptionForFingerprint(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapTreasuryMovement(
  movement: SantanderParsedMovement,
  metadata: { accountNumber: string; currencyCode: "UYU" | "USD" }
): SantanderParsedBankMovement {
  const isOutflow = movement.movementType === "debit";
  const debit = isOutflow ? movement.amount : null;
  const credit = !isOutflow ? movement.amount : null;
  const amount = isOutflow ? -movement.amount : movement.amount;

  const nrr = extractNrr(movement.description);
  const payerNameRaw = extractPayerNameRaw(movement.description);
  const payerNameNormalized = normalizePayerName(payerNameRaw);

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
    payer_name_raw: payerNameRaw,
    payer_name_normalized: payerNameNormalized,
    payer_token: payerTokenFromNormalized(payerNameNormalized),
    embedded_reference: extractEmbeddedReference(movement.documentNumber),
    nrr,
    balance_before: null,
    balance_check: "unknown",
    operation_group_key: buildOperationGroupKey({
      accountNumber: metadata.accountNumber,
      currencyCode: metadata.currencyCode,
      movementDate: movement.movementDate,
      reference: movement.documentNumber,
      nrr,
    }),
    dedup_fingerprint: "",
  };
}

const BALANCE_TOLERANCE = 0.01;

/**
 * Sección 10 — completa `balance_before`/`balance_check` por fila (saldo_anterior + crédito -
 * débito = saldo_actual, con tolerancia de un centésimo) y calcula el fingerprint de
 * deduplicación con ocurrencia (sección 13), en un solo pase secuencial sobre las filas ya
 * ordenadas cronológicamente por el parser.
 */
function annotateBalanceAndDedup(
  movements: SantanderParsedBankMovement[],
  metadata: { accountNumber: string; currencyCode: "UYU" | "USD" },
  openingBalance: number | null
): { movements: SantanderParsedBankMovement[]; rowMismatchesCount: number } {
  let runningBalance = openingBalance;
  let rowMismatchesCount = 0;
  const occurrenceCounts = new Map<string, number>();

  const annotated = movements.map((m) => {
    const balanceBefore = runningBalance;
    let balanceCheck: SantanderBalanceCheck = "unknown";
    if (balanceBefore != null && m.balance != null) {
      const expected = balanceBefore + (m.credit ?? 0) - (m.debit ?? 0);
      balanceCheck = Math.abs(expected - m.balance) <= BALANCE_TOLERANCE ? "ok" : "mismatch";
      if (balanceCheck === "mismatch") rowMismatchesCount += 1;
    }
    if (m.balance != null) runningBalance = m.balance;

    const referenceNormalized = (m.reference ?? "").toUpperCase().replace(/\s+/g, "");
    const baseKey = [
      metadata.accountNumber,
      metadata.currencyCode,
      m.date,
      referenceNormalized,
      m.direction,
      m.debit ?? "",
      m.credit ?? "",
      normalizeDescriptionForFingerprint(m.description),
    ].join("|");
    const occurrence = occurrenceCounts.get(baseKey) ?? 0;
    occurrenceCounts.set(baseKey, occurrence + 1);

    return {
      ...m,
      balance_before: balanceBefore,
      balance_check: balanceCheck,
      dedup_fingerprint: `${baseKey}|${occurrence}`,
    };
  });

  return { movements: annotated, rowMismatchesCount };
}

export function parseSantanderBankStatementText(text: string): SantanderBankStatementParseResult {
  const normalized = normalizeSantanderPdfExtractedText(text);

  if (!isSantanderPdfStatementText(normalized)) {
    throw new Error("NOT_SANTANDER");
  }

  const metadata = parseSantanderPdfMetadata(normalized);
  const treasuryMovements = parseSantanderPdfMovements(normalized, metadata);
  const { opening_balance, closing_balance } = extractOpeningClosingBalances(normalized);

  const movementMetadata = { accountNumber: metadata.accountNumber ?? "", currencyCode: metadata.currencyCode };
  const rawMovements = treasuryMovements
    .map((m) => mapTreasuryMovement(m, movementMetadata))
    .filter((m) => !isBalanceRow(m.description));

  if (rawMovements.length === 0) {
    throw new Error("NO_MOVEMENTS");
  }

  const account_number = metadata.accountNumber ?? "";
  const period_start = metadata.periodFrom ?? "";
  const period_end = metadata.periodTo ?? "";

  if (!account_number || !period_start || !period_end) {
    throw new Error("INCOMPLETE_METADATA");
  }

  const { movements, rowMismatchesCount } = annotateBalanceAndDedup(
    rawMovements,
    { accountNumber: account_number, currencyCode: metadata.currencyCode },
    opening_balance
  );

  const closingBalanceComputed = movements[movements.length - 1]?.balance ?? null;
  const difference =
    closing_balance != null && closingBalanceComputed != null ? closingBalanceComputed - closing_balance : null;
  const balance_validation: SantanderStatementBalanceValidation = {
    ok:
      rowMismatchesCount === 0 &&
      (difference == null || Math.abs(difference) <= BALANCE_TOLERANCE),
    opening_balance,
    closing_balance_expected: closing_balance,
    closing_balance_computed: closingBalanceComputed,
    difference,
    row_mismatches_count: rowMismatchesCount,
  };

  return {
    bank_name: "Santander",
    account_number,
    currency_code: metadata.currencyCode,
    period_start,
    period_end,
    opening_balance,
    closing_balance,
    movements,
    balance_validation,
  };
}

export function buildSantanderBankStatementPreview(
  text: string
): SantanderBankStatementPreview {
  const parsed = parseSantanderBankStatementText(text);
  const totals = computeSantanderMovementTotals(parsed.movements);
  return {
    ...parsed,
    movements_count: parsed.movements.length,
    totals,
  };
}

export { parseSantanderPdfDate, parseUruguayMoney };
