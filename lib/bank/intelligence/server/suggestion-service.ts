/**
 * Servicio de propuestas shadow: ejecuta el motor puro sobre contexto cargado.
 * BANK-SHADOW-CORRECTION-001: política de colisión de recibos entre propuestas del batch.
 */

import {
  matchBankMovement,
  MAX_TIED_RECEIPT_CONFIDENCE,
  type ReconciliationMatchInput,
} from "@/lib/bank/intelligence/reconciliation-matching";
import type { ShadowMovementContext } from "@/lib/bank/intelligence/server/loaders/shadow-context-loader";
import { mapMatchResultToProposal } from "@/lib/bank/intelligence/server/mappers";
import type { ShadowProposal } from "@/lib/bank/intelligence/server/types";

/**
 * Genera UNA propuesta explicable a partir del contexto ya cargado.
 * No toca DB. Determinístico si el contexto lo es.
 */
export function buildShadowProposalFromContext(
  ctx: ShadowMovementContext,
  generatedAt?: string
): ShadowProposal {
  const input: ReconciliationMatchInput = {
    movement: ctx.movement,
    clients: ctx.clients,
    receipts: ctx.receipts,
    invoices: ctx.invoices,
    historicalLinks: ctx.historicalLinks,
    options: { dateWindowDays: ctx.dateWindowDays },
  };

  const result = matchBankMovement(input);

  const proposal = mapMatchResultToProposal({
    workspaceId: ctx.movement.workspaceId,
    bankMovementId: ctx.movement.id,
    payerIdentityId: ctx.payerIdentity?.id ?? null,
    payerFp: ctx.payerFp,
    movementFpHash: ctx.movementFpHash,
    result,
    dateWindowDays: ctx.dateWindowDays,
    generatedAt,
  });

  proposal.candidateEvidence.historicalLinkStatuses = ctx.historicalLinks.map(
    (l) => `${l.clientId}:${l.status}`
  );

  return proposal;
}

/** Filtra candidatos de otros workspaces antes del motor (defensa en profundidad). */
export function filterContextToWorkspace(
  ctx: ShadowMovementContext,
  workspaceId: string
): ShadowMovementContext {
  return {
    ...ctx,
    clients: ctx.clients.filter((c) => c.workspaceId === workspaceId),
    receipts: ctx.receipts.filter((r) => r.workspaceId === workspaceId),
    invoices: ctx.invoices.filter((i) => i.workspaceId === workspaceId),
    historicalLinks: ctx.historicalLinks.filter((l) => l.workspaceId === workspaceId),
  };
}

/**
 * Si dos+ propuestas del mismo batch fijan el mismo proposedReceiptId,
 * ninguna queda como candidato único seguro:
 * - proposedReceiptId → null
 * - warning RECEIPT_CANDIDATE_COLLISION
 * - recommendedAction → REVIEW
 * - nunca AUTO
 * - no escribe ni reserva el recibo
 *
 * Puro y determinístico (ordena por bankMovementId al agrupar).
 */
export function applyReceiptCollisionPolicy(
  proposals: readonly ShadowProposal[]
): ShadowProposal[] {
  const byReceipt = new Map<string, string[]>();
  for (const p of proposals) {
    if (!p.proposedReceiptId) continue;
    const list = byReceipt.get(p.proposedReceiptId) ?? [];
    list.push(p.bankMovementId);
    byReceipt.set(p.proposedReceiptId, list);
  }

  const collidingReceipts = new Set<string>();
  for (const [receiptId, movementIds] of byReceipt) {
    if (movementIds.length > 1) collidingReceipts.add(receiptId);
  }

  if (collidingReceipts.size === 0) {
    return proposals.map((p) => ({ ...p }));
  }

  return proposals.map((p) => {
    if (!p.proposedReceiptId || !collidingReceipts.has(p.proposedReceiptId)) {
      return { ...p };
    }

    const collidedReceiptId = p.proposedReceiptId;
    const warnings = p.warnings.includes("RECEIPT_CANDIDATE_COLLISION")
      ? [...p.warnings]
      : [...p.warnings, "RECEIPT_CANDIDATE_COLLISION" as const];
    if (!warnings.includes("MULTIPLE_STRONG_CANDIDATES")) {
      warnings.push("MULTIPLE_STRONG_CANDIDATES");
    }

    const tiedFromCollision =
      p.tiedCandidates.length > 0
        ? p.tiedCandidates
        : [
            {
              receiptId: collidedReceiptId,
              clientId: p.proposedClientId ?? "",
              amountMinor: 0,
              currency: "UYU" as const,
              date: "",
              daysFromMovement: 0,
              candidateRank: 1,
              score: 0,
            },
          ];

    // Incluir todos los movimientos que colisionan en evidence (vía matchedReceiptIds).
    const matchedReceiptIds = [
      ...new Set([
        ...p.candidateEvidence.matchedReceiptIds,
        collidedReceiptId,
        ...[...collidingReceipts],
      ]),
    ].sort();

    return {
      ...p,
      proposedReceiptId: null,
      recommendedAction: "REVIEW" as const,
      confidence: Math.min(p.confidence, MAX_TIED_RECEIPT_CONFIDENCE),
      warnings,
      collisionDetected: true,
      ambiguityReason: p.ambiguityReason ?? "RECEIPT_CANDIDATE_COLLISION",
      tiedCandidates: tiedFromCollision,
      candidateEvidence: {
        ...p.candidateEvidence,
        matchedReceiptIds,
        tiedCandidates: tiedFromCollision,
        warnings,
        ambiguityReason: p.ambiguityReason ?? "RECEIPT_CANDIDATE_COLLISION",
        collisionDetected: true,
      },
    };
  });
}
