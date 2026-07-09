/**
 * Motor puro de sugerencias de conciliación banco ↔ Tesorería (Sprint F).
 * Sin DB ni IA.
 */
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

export const RECONCILIATION_DATE_WINDOW_DAYS = 7;

export type ReconciliationConfidence = "high" | "medium" | "low";

export type ReconciliationTargetType = "planned_cash_obligation";

export type ReconciliationSuggestion = {
  target_type: ReconciliationTargetType;
  target_id: string;
  confidence: ReconciliationConfidence;
  score: number;
  reasons: string[];
  movement: Pick<
    BankMovement,
    | "id"
    | "movement_date"
    | "description"
    | "amount"
    | "currency"
    | "direction"
    | "bank_reference"
    | "account_label"
    | "status"
  >;
  target: {
    id: string;
    title: string;
    description: string | null;
    amount_estimated: number;
    currency_code: string;
    due_date: string;
    direction: string;
    status: string;
    notes: string | null;
    obligation_type: string;
  };
};

const GENERIC_TEXT_TOKENS = new Set([
  "pago",
  "transferencia",
  "debito",
  "débito",
  "credito",
  "crédito",
  "operacion",
  "operación",
  "banca",
  "digital",
  "compra",
  "cargo",
  "abono",
  "extraccion",
  "extracción",
  "santander",
]);

const OPEN_OBLIGATION_STATUSES = new Set(["planned", "confirmed", "overdue", "paid"]);

export function normalizeReconciliationText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeReconciliationText(value: string): string[] {
  return normalizeReconciliationText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_TEXT_TOKENS.has(token));
}

export function parseYmdDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

export function daysBetweenDates(leftYmd: string, rightYmd: string): number {
  const left = parseYmdDate(leftYmd);
  const right = parseYmdDate(rightYmd);
  const diffMs = Math.abs(left.getTime() - right.getTime());
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function isAmountWithinTolerance(
  movementAmount: number,
  obligationAmount: number,
  currency: string
): { ok: boolean; exact: boolean } {
  const diff = Math.abs(movementAmount - obligationAmount);
  if (diff < 0.005) return { ok: true, exact: true };

  const pct = obligationAmount > 0 ? diff / obligationAmount : 1;
  const pctOk = pct <= 0.01;
  const absOk = currency === "USD" ? diff <= 2 : diff <= 50;
  return { ok: pctOk || absOk, exact: false };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Candidatos de monto para conciliar, incluyendo corrección de imports Excel Santander.
 */
export function reconciliationMovementAmountCandidates(
  movement: Pick<BankMovement, "amount" | "direction" | "metadata" | "currency">
): number[] {
  const resolved = roundMoney(resolveImportedBankMovementAmount(movement));
  const candidates = [resolved];

  if (
    resolved > 0 &&
    resolved < 100 &&
    movement.metadata?.parser !== "santander_excel_consolidated_v1"
  ) {
    const scaled = roundMoney(resolved * 1000);
    if (scaled !== resolved && scaled >= 100) {
      candidates.push(scaled);
    }
  }

  return [...new Set(candidates)];
}

export function obligationAmountForReconciliation(obligation: PlannedCashObligation): number {
  return obligation.amountFinal ?? obligation.amountEstimated;
}

export function scoreAmountMatch(
  movementAmount: number,
  obligationAmount: number,
  currency: string
): { score: number; reason: string | null } {
  const tolerance = isAmountWithinTolerance(movementAmount, obligationAmount, currency);
  if (!tolerance.ok) return { score: 0, reason: null };
  if (tolerance.exact) return { score: 50, reason: "Monto exacto" };
  return { score: 30, reason: "Monto similar" };
}

export function scoreBestAmountMatch(
  movement: Pick<BankMovement, "amount" | "direction" | "metadata" | "currency">,
  obligationAmount: number
): { score: number; reason: string | null } {
  let bestScore = 0;
  let bestReason: string | null = null;
  for (const candidate of reconciliationMovementAmountCandidates(movement)) {
    const result = scoreAmountMatch(candidate, obligationAmount, movement.currency);
    if (result.score > bestScore) {
      bestScore = result.score;
      bestReason = result.reason;
    }
  }
  return { score: bestScore, reason: bestReason };
}

export function scoreDateMatch(movementDate: string, dueDate: string): { score: number; reason: string | null } {
  const delta = daysBetweenDates(movementDate, dueDate);
  if (delta === 0) return { score: 30, reason: "Misma fecha" };
  if (delta <= 2) return { score: 20, reason: `Fecha cercana (${delta} día${delta === 1 ? "" : "s"})` };
  if (delta <= RECONCILIATION_DATE_WINDOW_DAYS) {
    return { score: 10, reason: `Fecha dentro de ${RECONCILIATION_DATE_WINDOW_DAYS} días` };
  }
  return { score: 0, reason: null };
}

export function scoreTextMatch(
  movementDescription: string,
  obligation: Pick<PlannedCashObligation, "title" | "description" | "notes" | "metadata">
): { score: number; reasons: string[] } {
  const movementTokens = new Set(tokenizeReconciliationText(movementDescription));
  if (movementTokens.size === 0) return { score: 0, reasons: [] };

  const obligationText = [obligation.title, obligation.description, obligation.notes]
    .filter(Boolean)
    .join(" ");
  const counterparty =
    obligation.metadata && typeof obligation.metadata.counterparty === "string"
      ? obligation.metadata.counterparty
      : "";
  const category =
    obligation.metadata && typeof obligation.metadata.category === "string"
      ? obligation.metadata.category
      : "";
  const combined = `${obligationText} ${counterparty} ${category}`.trim();
  const obligationTokens = new Set(tokenizeReconciliationText(combined));
  if (obligationTokens.size === 0) return { score: 0, reasons: [] };

  const shared = [...movementTokens].filter((token) => obligationTokens.has(token));
  if (shared.length === 0) {
    const normalizedMovement = normalizeReconciliationText(movementDescription);
    const normalizedTitle = normalizeReconciliationText(obligation.title);
    if (
      normalizedTitle.length >= 4 &&
      (normalizedMovement.includes(normalizedTitle) || normalizedTitle.includes(normalizedMovement))
    ) {
      return { score: 10, reasons: [`Texto coincide: ${obligation.title}`] };
    }
    return { score: 0, reasons: [] };
  }

  const strongest = shared.sort((a, b) => b.length - a.length)[0]!;
  if (shared.length >= 2 || strongest.length >= 6) {
    return { score: 20, reasons: [`Texto coincide: ${obligation.title}`] };
  }
  return { score: 10, reasons: [`Texto parcial: ${strongest}`] };
}

export function confidenceFromScore(score: number): ReconciliationConfidence | null {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  if (score >= 35) return "low";
  return null;
}

export function mapObligationTarget(obligation: PlannedCashObligation): ReconciliationSuggestion["target"] {
  return {
    id: obligation.id,
    title: obligation.title,
    description: obligation.description,
    amount_estimated: obligation.amountEstimated,
    currency_code: obligation.currencyCode,
    due_date: obligation.dueDate,
    direction: obligation.direction,
    status: obligation.status,
    notes: obligation.notes,
    obligation_type: obligation.obligationType,
  };
}

export function isObligationCandidateForMovement(movement: Pick<BankMovement, "direction" | "currency">, obligation: PlannedCashObligation): boolean {
  if (movement.currency !== obligation.currencyCode) return false;
  if (!OPEN_OBLIGATION_STATUSES.has(obligation.status)) return false;
  if (movement.direction === "outflow" && obligation.direction !== "outflow") return false;
  if (movement.direction === "inflow") return false;
  return true;
}

export function scoreBankMovementAgainstObligation(
  movement: Pick<
    BankMovement,
    | "id"
    | "movement_date"
    | "description"
    | "amount"
    | "currency"
    | "direction"
    | "bank_reference"
    | "account_label"
    | "status"
    | "metadata"
  >,
  obligation: PlannedCashObligation
): ReconciliationSuggestion | null {
  if (!isObligationCandidateForMovement(movement, obligation)) return null;

  const obligationAmount = obligationAmountForReconciliation(obligation);
  const amount = scoreBestAmountMatch(movement, obligationAmount);
  if (amount.score === 0) return null;

  const date = scoreDateMatch(movement.movement_date, obligation.dueDate);
  if (date.score === 0) return null;

  const text = scoreTextMatch(movement.description, obligation);
  const score = amount.score + date.score + text.score;
  const confidence = confidenceFromScore(score);
  if (!confidence) return null;

  const reasons = [amount.reason, date.reason, ...text.reasons].filter(
    (reason): reason is string => Boolean(reason)
  );

  return {
    target_type: "planned_cash_obligation",
    target_id: obligation.id,
    confidence,
    score,
    reasons,
    movement,
    target: mapObligationTarget(obligation),
  };
}

export function buildReconciliationSuggestionsForMovement(
  movement: Pick<
    BankMovement,
    | "id"
    | "movement_date"
    | "description"
    | "amount"
    | "currency"
    | "direction"
    | "bank_reference"
    | "account_label"
    | "status"
    | "metadata"
  >,
  obligations: PlannedCashObligation[]
): ReconciliationSuggestion[] {
  const suggestions = obligations
    .map((obligation) => scoreBankMovementAgainstObligation(movement, obligation))
    .filter((item): item is ReconciliationSuggestion => item != null)
    .sort((a, b) => b.score - a.score);

  return suggestions;
}

export function buildReconciliationSuggestions(
  movements: BankMovement[],
  obligations: PlannedCashObligation[]
): Array<{ movement: BankMovement; suggestions: ReconciliationSuggestion[] }> {
  return movements.map((movement) => ({
    movement,
    suggestions: buildReconciliationSuggestionsForMovement(movement, obligations),
  }));
}
