/**
 * Servicio de propuestas shadow: ejecuta el motor puro sobre contexto cargado.
 */

import {
  matchBankMovement,
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
