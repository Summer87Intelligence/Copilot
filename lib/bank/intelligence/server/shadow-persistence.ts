/**
 * Reglas de persistencia shadow: create / update / supersede / skip.
 * Puro respecto a DB (decide); la escritura vive en applyShadowPersistDecision.
 */

import type {
  ShadowPersistDecision,
  ShadowProposal,
  ShadowSuggestionRow,
} from "@/lib/bank/intelligence/server/types";
import {
  SHADOW_MIN_PERSIST_CONFIDENCE,
  SHADOW_SUBSTANTIAL_CONFIDENCE_DELTA,
} from "@/lib/bank/intelligence/server/types";

/** Evidencia insuficiente → no persistir. */
export function hasInsufficientEvidence(proposal: ShadowProposal): boolean {
  if (proposal.recommendedAction === "REJECT") return false;
  if (proposal.recommendedAction !== "UNIDENTIFIED") return false;
  if (proposal.confidence >= SHADOW_MIN_PERSIST_CONFIDENCE) return false;
  if (proposal.proposedClientId != null || proposal.proposedReceiptId != null) return false;
  if (proposal.reasons.length > 0) return false;
  return true;
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Cambio sustancial ⇒ supersede + create (preserva historial). */
export function isSubstantialSuggestionChange(
  existing: ShadowSuggestionRow,
  proposal: ShadowProposal
): boolean {
  if (existing.proposedClientId !== proposal.proposedClientId) return true;
  if (existing.proposedReceiptId !== proposal.proposedReceiptId) return true;
  if (existing.recommendedAction !== proposal.recommendedAction) return true;
  if (existing.payerIdentityId !== proposal.payerIdentityId) return true;
  if (
    Math.abs(existing.confidence - proposal.confidence) >= SHADOW_SUBSTANTIAL_CONFIDENCE_DELTA
  ) {
    return true;
  }
  if (sortedJson(existing.reasons) !== sortedJson(proposal.reasons)) return true;
  if (sortedJson(existing.warnings) !== sortedJson(proposal.warnings)) return true;
  return false;
}

/** Igualdad efectiva (idempotencia: skip). */
export function isIdenticalSuggestion(
  existing: ShadowSuggestionRow,
  proposal: ShadowProposal
): boolean {
  return (
    existing.proposedClientId === proposal.proposedClientId &&
    existing.proposedReceiptId === proposal.proposedReceiptId &&
    existing.recommendedAction === proposal.recommendedAction &&
    existing.payerIdentityId === proposal.payerIdentityId &&
    existing.confidence === proposal.confidence &&
    sortedJson(existing.reasons) === sortedJson(proposal.reasons) &&
    sortedJson(existing.warnings) === sortedJson(proposal.warnings)
  );
}

/**
 * Decide create | update | supersede | skip para una propuesta.
 *
 * - Nunca muta filas confirmed / rejected / reversed / superseded.
 * - Solo opera sobre la sugerencia ACTIVA (generated | pending_review).
 * - Historial terminal puede coexistir; no bloquea crear una nueva activa
 *   salvo que ya exista una activa idéntica o protegida.
 */
export function decideShadowPersistAction(input: {
  proposal: ShadowProposal;
  existingActive: ShadowSuggestionRow | null;
}): ShadowPersistDecision {
  const { proposal, existingActive } = input;

  if (hasInsufficientEvidence(proposal)) {
    return { action: "skip", reason: "INSUFFICIENT_EVIDENCE" };
  }

  if (!existingActive) {
    return { action: "create" };
  }

  // Defensa: si por error llega un terminal como "active", no tocarlo.
  if (
    existingActive.status === "confirmed" ||
    existingActive.status === "rejected" ||
    existingActive.status === "reversed" ||
    existingActive.status === "superseded" ||
    existingActive.status === "expired"
  ) {
    return {
      action: "skip",
      reason: `PROTECTED_${existingActive.status.toUpperCase()}`,
    };
  }

  if (isIdenticalSuggestion(existingActive, proposal)) {
    return { action: "skip", reason: "IDEMPOTENT_UNCHANGED" };
  }

  if (isSubstantialSuggestionChange(existingActive, proposal)) {
    return {
      action: "supersede",
      existingId: existingActive.id,
      previousStatus: existingActive.status,
    };
  }

  return { action: "update", existingId: existingActive.id };
}
