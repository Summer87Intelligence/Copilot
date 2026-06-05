/**
 * Conciliación de movimientos Santander importados vs Tesorería, recibos Zeta y clientes.
 * Motor puro — sin I/O.
 */

export {
  isSantanderPdfStatementText,
  parseSantanderPdfMetadata,
  parseSantanderPdfMovements,
  parseSantanderPdfStatementText,
  type SantanderPdfMetadata,
} from "@/lib/treasury/santander-pdf-statement-parser";

import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";
import type { ManualCashMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type SantanderReconciliationStatus =
  | "matched"
  | "possible"
  | "missing_copilot"
  | "missing_zeta"
  | "amount_diff"
  | "unknown"
  | "ignored"
  | "duplicate";

export const SANTANDER_STATUS_LABELS: Record<SantanderReconciliationStatus, string> = {
  matched: "Coincide",
  possible: "Posible coincidencia",
  missing_copilot: "Falta en Copilot",
  missing_zeta: "Falta en Zeta",
  amount_diff: "Diferencia de monto",
  unknown: "No identificado",
  ignored: "Ignorado",
  duplicate: "Duplicado",
};

export type SantanderMatchHit = {
  source: "treasury_manual" | "zeta_receipt" | "client";
  id: string;
  label: string;
  confidence: number;
  amountDelta: number;
  dayDelta: number;
  /** Human-readable match reason, e.g. "Forma de transferencia" */
  matchReason?: string;
  /** The raw transfer_method value that produced the match */
  transferMethodMatched?: string;
};

export type ZetaReceiptMatchInput = {
  id: string;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  receiptDate: string;
  clientName: string | null;
  receiptNumber: string | null;
};

export type ClientMatchInput = {
  id: string;
  name: string;
  debtUyu: number;
  debtUsd: number;
  transferMethod?: string | null;
};

export type EnrichedSantanderImportRow = {
  movementDate: string;
  description: string;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  movementType: "credit" | "debit";
  externalId: string;
  documentNumber: string | null;
  balanceAfter: number | null;
  rawPayload: Record<string, unknown>;
  duplicate: boolean;
  status: SantanderReconciliationStatus;
  statusLabel: string;
  suggestedAction: string;
  decisionHint: string;
  confidence: number | null;
  matches: SantanderMatchHit[];
};

export type BankImportPreviewRow = EnrichedSantanderImportRow;

export type SantanderImportSummary = {
  total: number;
  matched: number;
  possible: number;
  missingCopilot: number;
  missingZeta: number;
  amountDiff: number;
  unknown: number;
  ignored: number;
  duplicate: number;
  creditsByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
  debitsByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
};

const TREASURY_DAY_WINDOW = 2;
const ZETA_DAY_WINDOW = 3;
const AMOUNT_EXACT = 0.01;
const AMOUNT_CLOSE = 5;

function dayDelta(a: string, b: string): number {
  const am = Date.parse(`${a}T12:00:00.000Z`);
  const bm = Date.parse(`${b}T12:00:00.000Z`);
  if (!Number.isFinite(am) || !Number.isFinite(bm)) return 99;
  return Math.abs(Math.round((am - bm) / 86_400_000));
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normalizeText(b).split(" ").filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.max(ta.size, tb.size);
}

function treasuryTypeCompatible(
  bankType: "credit" | "debit",
  manual: ManualCashMovement
): boolean {
  if (bankType === "credit") {
    return manual.movementType === "income";
  }
  return manual.movementType === "expense";
}

function scoreTreasuryMatch(
  row: SantanderParsedMovement,
  manual: ManualCashMovement
): SantanderMatchHit | null {
  if (row.currencyCode !== manual.currencyCode) return null;
  if (!treasuryTypeCompatible(row.movementType, manual)) return null;
  const amountDelta = Math.abs(row.amount - manual.amount);
  const days = dayDelta(row.movementDate, manual.movementDate);
  if (days > TREASURY_DAY_WINDOW) return null;
  if (amountDelta > AMOUNT_CLOSE) return null;
  const confidence = Math.max(
    35,
    Math.round(100 - amountDelta * 8 - days * 6 - (tokenOverlap(row.description, manual.concept) < 0.2 ? 15 : 0))
  );
  return {
    source: "treasury_manual",
    id: manual.id,
    label: manual.concept,
    confidence,
    amountDelta,
    dayDelta: days,
  };
}

function scoreZetaMatch(
  row: SantanderParsedMovement,
  receipt: ZetaReceiptMatchInput
): SantanderMatchHit | null {
  if (row.movementType !== "credit") return null;
  if (row.currencyCode !== receipt.currencyCode) return null;
  const amountDelta = Math.abs(row.amount - receipt.amount);
  const days = dayDelta(row.movementDate, receipt.receiptDate);
  if (days > ZETA_DAY_WINDOW) return null;
  if (amountDelta > AMOUNT_CLOSE) return null;
  const nameBoost =
    receipt.clientName && tokenOverlap(row.description, receipt.clientName) >= 0.35 ? 12 : 0;
  const confidence = Math.max(
    35,
    Math.round(100 - amountDelta * 8 - days * 5 + nameBoost)
  );
  const label = receipt.clientName
    ? `Recibo ${receipt.receiptNumber ?? receipt.id.slice(0, 8)} · ${receipt.clientName}`
    : `Recibo ${receipt.receiptNumber ?? receipt.id.slice(0, 8)}`;
  return {
    source: "zeta_receipt",
    id: receipt.id,
    label,
    confidence,
    amountDelta,
    dayDelta: days,
  };
}

function scoreClientHint(
  row: SantanderParsedMovement,
  client: ClientMatchInput
): SantanderMatchHit | null {
  const overlap = tokenOverlap(row.description, client.name);
  if (overlap < 0.4) return null;
  const debt = row.currencyCode === "UYU" ? client.debtUyu : client.debtUsd;
  const amountDelta = Math.abs(row.amount - debt);
  const confidence = Math.round(40 + overlap * 40 - Math.min(amountDelta, 50));
  return {
    source: "client",
    id: client.id,
    label: client.name,
    confidence: Math.min(75, confidence),
    amountDelta,
    dayDelta: 0,
  };
}

const GENERIC_BANK_TOKENS = new Set([
  "banco", "transferencia", "recibida", "recibido", "credito", "debito",
  "cuenta", "santander", "brou", "itau", "bbva", "pago", "empresa",
  "del", "los", "las", "por", "con", "sin", "una", "los",
  "sa", "sas", "srl", "ltda", "spa",
]);

export function normalizeBankMatchText(value: string): string {
  return normalizeText(value);
}

function isTransferMethodUsable(tm: string | null | undefined): tm is string {
  if (!tm) return false;
  const norm = normalizeText(tm);
  if (norm.length < 5) return false;
  const significantTokens = norm
    .split(" ")
    .filter((t) => t.length > 1 && !GENERIC_BANK_TOKENS.has(t));
  return significantTokens.length >= 1;
}

function scoreTransferMethodHint(
  row: SantanderParsedMovement,
  client: ClientMatchInput
): SantanderMatchHit | null {
  if (!isTransferMethodUsable(client.transferMethod)) return null;

  const normDesc = normalizeText(row.description);
  const normTM = normalizeText(client.transferMethod);

  // Primary: transfer method text is a substring of the bank description
  if (normDesc.includes(normTM)) {
    return {
      source: "client",
      id: client.id,
      label: client.name,
      confidence: 75,
      amountDelta: 0,
      dayDelta: 0,
      matchReason: "Forma de transferencia",
      transferMethodMatched: client.transferMethod,
    };
  }

  // Secondary: significant token overlap excluding generic bank tokens
  const tmTokens = new Set(
    normTM.split(" ").filter((t) => t.length > 2 && !GENERIC_BANK_TOKENS.has(t))
  );
  const descTokens = new Set(
    normDesc.split(" ").filter((t) => t.length > 2 && !GENERIC_BANK_TOKENS.has(t))
  );
  if (tmTokens.size === 0) return null;

  let hits = 0;
  for (const t of tmTokens) if (descTokens.has(t)) hits++;
  if (hits < 2) return null;

  const overlap = hits / Math.max(tmTokens.size, descTokens.size);
  const confidence = Math.min(70, Math.round(35 + overlap * 50));
  return {
    source: "client",
    id: client.id,
    label: client.name,
    confidence,
    amountDelta: 0,
    dayDelta: 0,
    matchReason: "Forma de transferencia",
    transferMethodMatched: client.transferMethod,
  };
}

function bestMatch(matches: SantanderMatchHit[]): SantanderMatchHit | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function resolveStatus(
  row: SantanderParsedMovement,
  matches: SantanderMatchHit[],
  duplicate: boolean,
  forceIgnored: boolean
): Pick<EnrichedSantanderImportRow, "status" | "statusLabel" | "suggestedAction" | "decisionHint" | "confidence"> {
  if (forceIgnored) {
    return {
      status: "ignored",
      statusLabel: SANTANDER_STATUS_LABELS.ignored,
      suggestedAction: "Ignorar",
      decisionHint: "Marcado para ignorar en esta revisión.",
      confidence: null,
    };
  }
  if (duplicate) {
    return {
      status: "duplicate",
      statusLabel: SANTANDER_STATUS_LABELS.duplicate,
      suggestedAction: "Omitir",
      decisionHint: "Ya existe en movimientos bancarios importados.",
      confidence: null,
    };
  }

  const treasury = bestMatch(matches.filter((m) => m.source === "treasury_manual"));
  const zeta = bestMatch(matches.filter((m) => m.source === "zeta_receipt"));
  const top = bestMatch(matches);

  if (treasury && treasury.amountDelta <= AMOUNT_EXACT && treasury.confidence >= 85) {
    if (row.movementType === "credit" && !zeta) {
      return {
        status: "missing_zeta",
        statusLabel: SANTANDER_STATUS_LABELS.missing_zeta,
        suggestedAction: "Revisar en Zeta",
        decisionHint:
          "El movimiento coincide con Tesorería pero no hay recibo Zeta en la ventana de fechas.",
        confidence: treasury.confidence,
      };
    }
    return {
      status: "matched",
      statusLabel: SANTANDER_STATUS_LABELS.matched,
      suggestedAction: "Ver detalle",
      decisionHint: "Este movimiento parece ya registrado en Tesorería.",
      confidence: treasury.confidence,
    };
  }

  if (treasury && treasury.amountDelta > AMOUNT_EXACT && treasury.amountDelta <= AMOUNT_CLOSE) {
    return {
      status: "amount_diff",
      statusLabel: SANTANDER_STATUS_LABELS.amount_diff,
      suggestedAction: "Revisar monto",
      decisionHint: `Hay coincidencia por fecha pero el monto difiere en ${treasury.amountDelta.toFixed(2)}.`,
      confidence: treasury.confidence,
    };
  }

  if (zeta && zeta.confidence >= 85 && zeta.amountDelta <= AMOUNT_EXACT && !treasury) {
    return {
      status: "missing_copilot",
      statusLabel: SANTANDER_STATUS_LABELS.missing_copilot,
      suggestedAction: "Revisar Tesorería",
      decisionHint: "Hay recibo en Zeta pero no un movimiento equivalente en Tesorería.",
      confidence: zeta.confidence,
    };
  }

  if ((treasury && treasury.confidence >= 55) || (zeta && zeta.confidence >= 55) || (top && top.source === "client")) {
    let decisionHint: string;
    if (top?.source === "client") {
      decisionHint =
        top.matchReason === "Forma de transferencia"
          ? "El cliente coincide por su forma de transferencia registrada; conviene validar manualmente."
          : "El nombre del cliente aparece en la descripción; conviene validar manualmente.";
    } else {
      decisionHint = "Coincidencia parcial por monto, fecha o texto.";
    }
    return {
      status: "possible",
      statusLabel: SANTANDER_STATUS_LABELS.possible,
      suggestedAction: "Ver detalle",
      decisionHint,
      confidence: top?.confidence ?? null,
    };
  }

  if (row.movementType === "credit") {
    return {
      status: "missing_copilot",
      statusLabel: SANTANDER_STATUS_LABELS.missing_copilot,
      suggestedAction: "Revisar cobro",
      decisionHint: "Cobro en banco sin coincidencia clara en Tesorería ni Zeta.",
      confidence: null,
    };
  }

  return {
    status: "unknown",
    statusLabel: SANTANDER_STATUS_LABELS.unknown,
    suggestedAction: "Ver detalle",
    decisionHint: "No se encontró coincidencia suficiente.",
    confidence: null,
  };
}

export function enrichSantanderImportRows(input: {
  rows: readonly SantanderParsedMovement[];
  manualMovements: readonly ManualCashMovement[];
  receipts: readonly ZetaReceiptMatchInput[];
  clients: readonly ClientMatchInput[];
  existingExternalIds: ReadonlySet<string>;
  ignoredExternalIds?: ReadonlySet<string>;
}): EnrichedSantanderImportRow[] {
  const ignored = input.ignoredExternalIds ?? new Set<string>();

  return input.rows.map((row) => {
    const matches: SantanderMatchHit[] = [];
    for (const manual of input.manualMovements) {
      const hit = scoreTreasuryMatch(row, manual);
      if (hit) matches.push(hit);
    }
    for (const receipt of input.receipts) {
      const hit = scoreZetaMatch(row, receipt);
      if (hit) matches.push(hit);
    }
    for (const client of input.clients) {
      const nameHit = scoreClientHint(row, client);
      const tmHit = scoreTransferMethodHint(row, client);
      if (tmHit && nameHit) {
        matches.push(tmHit.confidence >= nameHit.confidence ? tmHit : nameHit);
      } else if (tmHit) {
        matches.push(tmHit);
      } else if (nameHit) {
        matches.push(nameHit);
      }
    }

    const duplicate = input.existingExternalIds.has(row.externalId);
    const resolved = resolveStatus(row, matches, duplicate, ignored.has(row.externalId));

    return {
      movementDate: row.movementDate,
      description: row.description,
      amount: row.amount,
      currencyCode: row.currencyCode,
      movementType: row.movementType,
      externalId: row.externalId,
      documentNumber: row.documentNumber,
      balanceAfter: row.balanceAfter,
      rawPayload: row.rawPayload,
      duplicate,
      matches: matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
      ...resolved,
    };
  });
}

export function buildSantanderImportSummary(
  rows: readonly EnrichedSantanderImportRow[]
): SantanderImportSummary {
  const summary: SantanderImportSummary = {
    total: rows.length,
    matched: 0,
    possible: 0,
    missingCopilot: 0,
    missingZeta: 0,
    amountDiff: 0,
    unknown: 0,
    ignored: 0,
    duplicate: 0,
    creditsByCurrency: {},
    debitsByCurrency: {},
  };

  for (const row of rows) {
    if (row.status === "matched") summary.matched += 1;
    else if (row.status === "possible") summary.possible += 1;
    else if (row.status === "missing_copilot") summary.missingCopilot += 1;
    else if (row.status === "missing_zeta") summary.missingZeta += 1;
    else if (row.status === "amount_diff") summary.amountDiff += 1;
    else if (row.status === "ignored") summary.ignored += 1;
    else if (row.status === "duplicate") summary.duplicate += 1;
    else summary.unknown += 1;

    if (row.movementType === "credit") {
      summary.creditsByCurrency[row.currencyCode] =
        (summary.creditsByCurrency[row.currencyCode] ?? 0) + row.amount;
    } else {
      summary.debitsByCurrency[row.currencyCode] =
        (summary.debitsByCurrency[row.currencyCode] ?? 0) + row.amount;
    }
  }

  return summary;
}
