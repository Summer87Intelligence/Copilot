/**
 * FASE E — Motor PURO de sugerencias de conciliación multi-entidad.
 *
 * Extiende el motor determinístico existente (`bank-movement-reconciliation.ts`,
 * solo `planned_cash_obligation`) a un conjunto normalizado de candidatos:
 * recibos Zeta, ingresos/egresos de Tesorería y obligaciones programadas.
 *
 * Reglas duras (heredadas del dominio N:M):
 *   - nunca sugiere cruzando monedas ni cruzando dirección;
 *   - una sugerencia NUNCA aplica cambios: requiere confirmación humana;
 *   - el importe sugerido nunca excede el remanente del movimiento.
 *
 * PURO: sin DB ni IA. La capa server-side arma los candidatos y persiste solo
 * tras confirmación explícita.
 */
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import {
  confidenceFromScore,
  scoreBestAmountMatch,
  scoreDateMatch,
  tokenizeReconciliationText,
  normalizeReconciliationText,
  type ReconciliationConfidence,
} from "@/lib/bank-movements/bank-movement-reconciliation";

export type SuggestionTargetType =
  | "receipt"
  | "planned_cash_obligation"
  | "treasury_income"
  | "treasury_expense";

/** Candidato normalizado a conciliar contra un movimiento bancario. */
export type ReconciliationCandidate = {
  targetType: SuggestionTargetType;
  targetId: string;
  title: string;
  description: string | null;
  reference: string | null;
  /** Importe positivo de la operación. */
  amount: number;
  /** "UYU" | "USD" — nunca se mezcla. */
  currency: string;
  /** Fecha de la operación (ymd). */
  date: string;
  direction: "inflow" | "outflow";
};

export type ReconciliationLinkSuggestion = {
  targetType: SuggestionTargetType;
  targetId: string;
  confidence: ReconciliationConfidence;
  score: number;
  reasons: string[];
  /** Importe a aplicar propuesto = min(importe candidato, remanente del movimiento). */
  suggestedApplyAmount: number;
  candidate: ReconciliationCandidate;
};

type ScorableMovement = Pick<
  BankMovement,
  "id" | "movement_date" | "description" | "amount" | "currency" | "direction" | "metadata"
>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Coincidencia textual genérica movimiento ↔ candidato (misma heurística que el motor de obligaciones). */
function scoreCandidateText(
  movementDescription: string,
  candidate: ReconciliationCandidate
): { score: number; reasons: string[] } {
  const movementTokens = new Set(tokenizeReconciliationText(movementDescription));
  if (movementTokens.size === 0) return { score: 0, reasons: [] };

  const combined = [candidate.title, candidate.description, candidate.reference]
    .filter(Boolean)
    .join(" ");
  const candidateTokens = new Set(tokenizeReconciliationText(combined));
  if (candidateTokens.size === 0) return { score: 0, reasons: [] };

  const shared = [...movementTokens].filter((t) => candidateTokens.has(t));
  if (shared.length === 0) {
    const nm = normalizeReconciliationText(movementDescription);
    const nt = normalizeReconciliationText(candidate.title);
    if (nt.length >= 4 && (nm.includes(nt) || nt.includes(nm))) {
      return { score: 10, reasons: [`Texto coincide: ${candidate.title}`] };
    }
    return { score: 0, reasons: [] };
  }
  const strongest = shared.sort((a, b) => b.length - a.length)[0]!;
  if (shared.length >= 2 || strongest.length >= 6) {
    return { score: 20, reasons: [`Texto coincide: ${candidate.title}`] };
  }
  return { score: 10, reasons: [`Texto parcial: ${strongest}`] };
}

/**
 * Puntúa un candidato contra un movimiento. Devuelve null si no supera el umbral
 * o si viola una regla dura (moneda/dirección). `remaining` es el importe aún no
 * aplicado del movimiento (limita el importe sugerido).
 */
export function scoreReconciliationCandidate(
  movement: ScorableMovement,
  candidate: ReconciliationCandidate,
  remaining: number
): ReconciliationLinkSuggestion | null {
  // Reglas duras: nunca cruzar moneda ni dirección; nada por aplicar.
  if (String(movement.currency).toUpperCase() !== String(candidate.currency).toUpperCase()) return null;
  if (movement.direction !== candidate.direction) return null;
  if (!(remaining > 0)) return null;
  if (!(candidate.amount > 0)) return null;

  const amount = scoreBestAmountMatch(movement, candidate.amount);
  if (amount.score === 0) return null;

  const date = scoreDateMatch(movement.movement_date, candidate.date);
  if (date.score === 0) return null;

  const text = scoreCandidateText(movement.description, candidate);
  const score = amount.score + date.score + text.score;
  const confidence = confidenceFromScore(score);
  if (!confidence) return null;

  const reasons = [amount.reason, date.reason, ...text.reasons].filter(
    (r): r is string => Boolean(r)
  );

  return {
    targetType: candidate.targetType,
    targetId: candidate.targetId,
    confidence,
    score,
    reasons,
    suggestedApplyAmount: round2(Math.min(candidate.amount, remaining)),
    candidate,
  };
}

/** Sugerencias ordenadas (mayor score primero) para un movimiento contra todos los candidatos. */
export function buildCandidateSuggestionsForMovement(
  movement: ScorableMovement,
  candidates: readonly ReconciliationCandidate[],
  remaining: number
): ReconciliationLinkSuggestion[] {
  return candidates
    .map((c) => scoreReconciliationCandidate(movement, c, remaining))
    .filter((s): s is ReconciliationLinkSuggestion => s != null)
    .sort((a, b) => b.score - a.score);
}
