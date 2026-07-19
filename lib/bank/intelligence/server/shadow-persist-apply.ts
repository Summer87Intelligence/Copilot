/**
 * Aplicación de decisiones de persistencia shadow (solo suggestions + events).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  insertShadowSuggestion,
  insertSuggestionEvent,
  supersedeShadowSuggestion,
  updateShadowSuggestion,
} from "@/lib/bank/intelligence/server/repositories";
import { decideShadowPersistAction } from "@/lib/bank/intelligence/server/shadow-persistence";
import type {
  ShadowPersistDecision,
  ShadowPersistStats,
  ShadowProposal,
  ShadowSuggestionRow,
} from "@/lib/bank/intelligence/server/types";

export type ShadowPersistPorts = {
  insertSuggestion: (
    proposal: ShadowProposal
  ) => Promise<ShadowSuggestionRow>;
  updateSuggestion: (
    suggestionId: string,
    proposal: ShadowProposal
  ) => Promise<ShadowSuggestionRow>;
  supersedeSuggestion: (suggestionId: string) => Promise<void>;
  insertEvent: (input: {
    eventType: "suggestion_created" | "suggestion_changed" | "suggestion_superseded";
    entityId: string;
    previousState?: string | null;
    newState?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

export function createSupabaseShadowPersistPorts(
  supabase: SupabaseClient,
  workspaceId: string,
  actorUserId?: string | null
): ShadowPersistPorts {
  return {
    async insertSuggestion(proposal) {
      return insertShadowSuggestion(supabase, proposal, "generated");
    },
    async updateSuggestion(suggestionId, proposal) {
      return updateShadowSuggestion(supabase, workspaceId, suggestionId, proposal);
    },
    async supersedeSuggestion(suggestionId) {
      return supersedeShadowSuggestion(supabase, workspaceId, suggestionId);
    },
    async insertEvent(input) {
      return insertSuggestionEvent(supabase, {
        workspaceId,
        eventType: input.eventType,
        entityId: input.entityId,
        previousState: input.previousState,
        newState: input.newState,
        reason: input.reason,
        actorUserId: actorUserId ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          // Nunca cuentas completas en metadata de eventos.
          maskedOnly: true,
        },
      });
    },
  };
}

export async function applyShadowPersistDecision(input: {
  proposal: ShadowProposal;
  decision: ShadowPersistDecision;
  ports: ShadowPersistPorts;
  stats: ShadowPersistStats;
}): Promise<void> {
  // Esta ruta NUNCA invoca confirm/reverse_bank_reconciliation_v1 ni escribe
  // links/allocations. Las guardas viven en repositories + tests.
  const { proposal, decision, ports, stats } = input;

  if (decision.action === "skip") {
    if (decision.reason === "INSUFFICIENT_EVIDENCE") {
      stats.insufficientEvidence += 1;
    } else {
      stats.skipped += 1;
    }
    return;
  }

  if (decision.action === "create") {
    const row = await ports.insertSuggestion(proposal);
    await ports.insertEvent({
      eventType: "suggestion_created",
      entityId: row.id,
      newState: row.status,
      reason: proposal.recommendedAction,
      metadata: {
        confidence: proposal.confidence,
        engineVersion: proposal.engineVersion,
        // Ámbito canónico en el evento: los consumidores NO deben tratar cualquier
        // suggestion_created como trabajo operativo; deben leer suggestionScope.
        suggestionScope: proposal.suggestionScope ?? "operational",
        auditOnly: proposal.auditOnly === true,
        historicalAudit: proposal.historicalAudit === true,
        movementFingerprint: proposal.movementFingerprint,
        payerFingerprint: proposal.payerFingerprint,
      },
    });
    stats.created += 1;
    return;
  }

  if (decision.action === "update") {
    const row = await ports.updateSuggestion(decision.existingId, proposal);
    await ports.insertEvent({
      eventType: "suggestion_changed",
      entityId: row.id,
      previousState: "generated",
      newState: row.status,
      reason: "minor_update",
      metadata: { confidence: proposal.confidence },
    });
    stats.updated += 1;
    return;
  }

  if (decision.action === "supersede") {
    await ports.supersedeSuggestion(decision.existingId);
    await ports.insertEvent({
      eventType: "suggestion_superseded",
      entityId: decision.existingId,
      previousState: decision.previousStatus,
      newState: "superseded",
      reason: "substantial_change",
    });
    const row = await ports.insertSuggestion(proposal);
    await ports.insertEvent({
      eventType: "suggestion_created",
      entityId: row.id,
      newState: row.status,
      reason: "after_supersede",
      metadata: {
        supersededId: decision.existingId,
        confidence: proposal.confidence,
      },
    });
    stats.superseded += 1;
    stats.created += 1;
  }
}

export function emptyPersistStats(): ShadowPersistStats {
  return {
    created: 0,
    updated: 0,
    superseded: 0,
    skipped: 0,
    insufficientEvidence: 0,
  };
}

export { decideShadowPersistAction };
