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
  applyHistoricalAuditPolicy,
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

type HistoricalErrorCode =
  | "HISTORICAL_PERSIST_NOT_ALLOWED"
  | "HISTORICAL_SCOPE_REQUIRES_IDS"
  | "HISTORICAL_PERSIST_REQUIRES_INCLUDE"
  | "HISTORICAL_PERSIST_REQUIRES_PERSIST";

/** Guardas del modo histórico (audit-only por defecto; persistencia histórica tras flag). */
export class ShadowHistoricalError extends Error {
  readonly code: HistoricalErrorCode;
  constructor(code: HistoricalErrorCode, message: string) {
    super(message);
    this.name = "ShadowHistoricalError";
    this.code = code;
  }
}

/**
 * Valida las precondiciones del modo histórico ANTES de cargar o escribir nada.
 *
 * - `persistHistoricalForReview=true` (persistencia histórica) exige
 *   `includeHistoricalForShadow=true`, `persist=true` + `dryRun=false` e IDs explícitos.
 * - `includeHistoricalForShadow=true` sin ese flag es **dry-run only**:
 *   `persist=true` → HISTORICAL_PERSIST_NOT_ALLOWED.
 * - Ambos exigen IDs explícitos (nunca escaneo automático / limit sin IDs).
 */
export function assertHistoricalShadowPreconditions(options: ShadowRunOptions): void {
  const hist = options.includeHistoricalForShadow === true;
  const persistHist = options.persistHistoricalForReview === true;
  const hasExplicitIds = Boolean(options.movementId || options.movementIds?.length);

  if (persistHist) {
    if (!hist) {
      throw new ShadowHistoricalError(
        "HISTORICAL_PERSIST_REQUIRES_INCLUDE",
        "HISTORICAL_PERSIST_REQUIRES_INCLUDE: persistHistoricalForReview requires includeHistoricalForShadow=true."
      );
    }
    if (options.persist !== true || options.dryRun !== false) {
      throw new ShadowHistoricalError(
        "HISTORICAL_PERSIST_REQUIRES_PERSIST",
        "HISTORICAL_PERSIST_REQUIRES_PERSIST: persistHistoricalForReview requires persist=true and dryRun=false."
      );
    }
    if (!hasExplicitIds) {
      throw new ShadowHistoricalError(
        "HISTORICAL_SCOPE_REQUIRES_IDS",
        "HISTORICAL_SCOPE_REQUIRES_IDS: historical persist requires explicit movementId/movementIds."
      );
    }
    return;
  }

  if (!hist) return;
  if (options.persist === true) {
    throw new ShadowHistoricalError(
      "HISTORICAL_PERSIST_NOT_ALLOWED",
      "HISTORICAL_PERSIST_NOT_ALLOWED: includeHistoricalForShadow is dry-run only unless persistHistoricalForReview=true."
    );
  }
  if (!hasExplicitIds) {
    throw new ShadowHistoricalError(
      "HISTORICAL_SCOPE_REQUIRES_IDS",
      "HISTORICAL_SCOPE_REQUIRES_IDS: historical shadow requires explicit movementId/movementIds; " +
        "automatic scan / limit-without-ids is not allowed."
    );
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
  // Guardas del modo histórico: fallar antes de cargar o escribir.
  assertHistoricalShadowPreconditions(options);

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
  const includeHistoricalForShadow = options.includeHistoricalForShadow === true;

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
      includeHistoricalForShadow,
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
    if (eligibility.auditOnly && eligibility.auditReason === "HISTORICAL_SHADOW_AUDIT") {
      proposals.push(applyHistoricalAuditPolicy(proposal));
    } else if (eligibility.auditOnly) {
      proposals.push(applyMatchedAuditPolicy(proposal));
    } else {
      proposals.push({ ...proposal, suggestionScope: "operational" });
    }
  }

  // Colisión de recibos antes de exponer / persistir (puro, sin DB).
  const finalProposals = applyReceiptCollisionPolicy(proposals);

  const persistHistoricalForReview = options.persistHistoricalForReview === true;

  if (writesEnabled) {
    for (const proposal of finalProposals) {
      const scope = proposal.suggestionScope ?? "operational";

      if (persistHistoricalForReview) {
        // Persistencia histórica: SOLO historical_review. Operativo (post-corte) y
        // matched se omiten (nunca post-corte, nunca matched).
        if (!(proposal.historicalAudit === true && scope === "historical_review")) {
          stats.skipped += 1;
          continue;
        }
      } else if (proposal.auditOnly === true) {
        // Modo normal: audit-only (matched o histórico) NUNCA persiste.
        stats.skipped += 1;
        continue;
      }

      // Idempotencia POR ÁMBITO: operativo e histórico nunca se sobrescriben mutuamente.
      const existingActive =
        activeSuggestions.find(
          (s) => s.bankMovementId === proposal.bankMovementId && s.suggestionScope === scope
        ) ?? null;
      const decision = decideShadowPersistAction({ proposal, existingActive });
      await applyShadowPersistDecision({
        proposal,
        decision,
        ports,
        stats,
      });
      if (decision.action === "supersede" || decision.action === "create") {
        const idx = activeSuggestions.findIndex(
          (s) => s.bankMovementId === proposal.bankMovementId && s.suggestionScope === scope
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
