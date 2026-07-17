/**
 * Runner controlado de inteligencia bancaria shadow.
 *
 * Default: dryRun=true, persist=false.
 * Scope obligatorio: movementId | movementIds | limit explícito (≤25).
 * NUNCA recorre automáticamente todos los movimientos del workspace.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { RECONCILIATION_ENGINE_VERSION } from "@/lib/bank/intelligence/reconciliation-matching";
import { isShadowEligibleMovement } from "@/lib/bank/intelligence/server/eligibility";
import {
  loadMovementsForShadowScope,
  loadShadowContextForMovement,
} from "@/lib/bank/intelligence/server/loaders/shadow-context-loader";
import {
  listActiveSuggestionsForMovements,
  listMovementIdsWithActiveCanonicalLink,
} from "@/lib/bank/intelligence/server/repositories";
import {
  applyShadowPersistDecision,
  createSupabaseShadowPersistPorts,
  emptyPersistStats,
} from "@/lib/bank/intelligence/server/shadow-persist-apply";
import { decideShadowPersistAction } from "@/lib/bank/intelligence/server/shadow-persistence";
import {
  buildShadowProposalFromContext,
  filterContextToWorkspace,
  applyReceiptCollisionPolicy,
  applyMatchedAuditPolicy,
} from "@/lib/bank/intelligence/server/suggestion-service";
import type {
  ShadowPersistStats,
  ShadowProposal,
  ShadowRunOptions,
  ShadowRunResult,
  ShadowSkippedMovement,
} from "@/lib/bank/intelligence/server/types";
import {
  SHADOW_DEFAULT_LIMIT,
  SHADOW_MAX_LIMIT,
} from "@/lib/bank/intelligence/server/types";

export class ShadowScopeError extends Error {
  readonly code = "SHADOW_SCOPE_REQUIRED";
  constructor(message: string) {
    super(message);
    this.name = "ShadowScopeError";
  }
}

export type ResolvedShadowScope = {
  movementIds: string[] | null;
  limit: number;
};

/**
 * Resuelve el alcance del runner. Exige movementId, movementIds o limit explícito.
 */
export function resolveShadowScope(options: ShadowRunOptions): ResolvedShadowScope {
  const ws = String(options.workspaceId ?? "").trim();
  if (!ws) throw new ShadowScopeError("workspaceId is required");

  const ids: string[] = [];
  if (options.movementId) ids.push(String(options.movementId).trim());
  if (options.movementIds?.length) {
    for (const id of options.movementIds) {
      const t = String(id).trim();
      if (t) ids.push(t);
    }
  }
  const uniqueIds = [...new Set(ids.filter(Boolean))];

  const hasExplicitLimit = options.limit != null;
  if (uniqueIds.length === 0 && !hasExplicitLimit) {
    throw new ShadowScopeError(
      "SHADOW_SCOPE_REQUIRED: pass movementId, movementIds, or an explicit limit " +
        `(default would be unsafe; max ${SHADOW_MAX_LIMIT}). ` +
        "The runner will not scan all workspace movements."
    );
  }

  let limit = hasExplicitLimit
    ? Number(options.limit)
    : Math.min(uniqueIds.length || SHADOW_DEFAULT_LIMIT, SHADOW_MAX_LIMIT);

  if (!Number.isFinite(limit) || limit < 1) {
    throw new ShadowScopeError(`limit must be between 1 and ${SHADOW_MAX_LIMIT}`);
  }
  if (limit > SHADOW_MAX_LIMIT) {
    throw new ShadowScopeError(`limit exceeds SHADOW_MAX_LIMIT (${SHADOW_MAX_LIMIT})`);
  }

  if (uniqueIds.length > 0) {
    limit = Math.min(limit, uniqueIds.length, SHADOW_MAX_LIMIT);
    return { movementIds: uniqueIds.slice(0, limit), limit };
  }

  return { movementIds: null, limit };
}

export function resolveShadowMode(options: ShadowRunOptions): {
  mode: "dry-run" | "shadow-persist";
  writesEnabled: boolean;
} {
  const dryRun = options.dryRun !== false; // default true
  const persist = options.persist === true; // default false
  const writesEnabled = dryRun === false && persist === true;
  return {
    mode: writesEnabled ? "shadow-persist" : "dry-run",
    writesEnabled,
  };
}

export type BankShadowRunnerDeps = {
  supabase: SupabaseClient;
  /** Opcional: ports de escritura inyectables (tests). */
  persistPorts?: ReturnType<typeof createSupabaseShadowPersistPorts>;
};

/**
 * Ejecuta el motor shadow sobre un alcance controlado.
 * No llama RPCs financieras. No escribe links/allocations/tablas financieras.
 */
export async function runBankShadowIntelligence(
  deps: BankShadowRunnerDeps,
  options: ShadowRunOptions
): Promise<ShadowRunResult> {
  const scope = resolveShadowScope(options);
  const { mode, writesEnabled } = resolveShadowMode(options);

  const rows = await loadMovementsForShadowScope(deps.supabase, options.workspaceId, {
    movementIds: scope.movementIds ?? undefined,
    limit: scope.limit,
  });

  const proposals: ShadowProposal[] = [];
  const skippedMovements: ShadowSkippedMovement[] = [];
  const stats: ShadowPersistStats = emptyPersistStats();

  const movementIds = rows.map((r) => r.id);
  const activeSuggestions = writesEnabled
    ? await listActiveSuggestionsForMovements(
        deps.supabase,
        options.workspaceId,
        movementIds,
        RECONCILIATION_ENGINE_VERSION
      )
    : [];

  // Política de elegibilidad única (matched/ignored/reversed/outflow/link/corte/workspace).
  const activeLinkSet = await listMovementIdsWithActiveCanonicalLink(
    deps.supabase,
    options.workspaceId,
    movementIds
  );
  const includeMatchedForAudit = options.includeMatchedForAudit === true;

  const ports =
    deps.persistPorts ??
    createSupabaseShadowPersistPorts(
      deps.supabase,
      options.workspaceId,
      options.actorUserId ?? null
    );

  for (const row of rows) {
    const eligibility = isShadowEligibleMovement({
      movement: {
        id: row.id,
        workspaceId: row.workspace_id,
        status: row.status,
        direction: row.direction,
        movementDate: row.movement_date,
      },
      workspaceId: options.workspaceId,
      hasActiveCanonicalLink: activeLinkSet.has(row.id),
      includeMatchedForAudit,
    });

    if (!eligibility.eligible) {
      skippedMovements.push({ movementId: row.id, reason: eligibility.skipReason });
      continue;
    }

    const loaded = await loadShadowContextForMovement(
      deps.supabase,
      options.workspaceId,
      row
    );
    if ("skip" in loaded) {
      skippedMovements.push({ movementId: row.id, reason: loaded.reason });
      continue;
    }

    const ctx = filterContextToWorkspace(loaded, options.workspaceId);
    const proposal = buildShadowProposalFromContext(ctx);
    proposals.push(eligibility.auditOnly ? applyMatchedAuditPolicy(proposal) : proposal);
  }

  // Colisión de recibos antes de exponer / persistir (puro, sin DB).
  const finalProposals = applyReceiptCollisionPolicy(proposals);

  if (writesEnabled) {
    for (const proposal of finalProposals) {
      // Audit-only (matched) NUNCA persiste, aun con persist=true.
      if (proposal.auditOnly === true) {
        stats.skipped += 1;
        continue;
      }
      const existingActive =
        activeSuggestions.find((s) => s.bankMovementId === proposal.bankMovementId) ?? null;
      const decision = decideShadowPersistAction({ proposal, existingActive });
      await applyShadowPersistDecision({
        proposal,
        decision,
        ports,
        stats,
      });
      if (decision.action === "supersede" || decision.action === "create") {
        const idx = activeSuggestions.findIndex(
          (s) => s.bankMovementId === proposal.bankMovementId
        );
        if (idx >= 0) activeSuggestions.splice(idx, 1);
      }
    }
  }

  return {
    mode,
    workspaceId: options.workspaceId,
    engineVersion: RECONCILIATION_ENGINE_VERSION,
    proposals: finalProposals,
    persisted: stats,
    skippedMovements,
    writesEnabled,
  };
}
