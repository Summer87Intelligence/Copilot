/**
 * Decision Engine — Daily Queue Orchestrator (Phase 2B).
 * Carga datos, genera cola, persiste snapshot. Punto de entrada server-side.
 *
 * Llamar desde:
 * - persistencia de acciones operativas
 * - invalidación por SLA / estado
 * - (futuro) post-sync Zeta vía import explícito — sin modificar pipelines Zeta
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import {
  invalidateDailyQueueSnapshot,
  isDailyQueueSnapshotFresh,
  readDailyQueueSnapshot,
  upsertDailyQueueSnapshot,
} from "@/lib/data/decision-daily-queue-repository";
import { invalidateBriefingSnapshot } from "@/lib/data/decision-snapshot-repository";
import type { DailyOperationsQueue } from "@/lib/decision-engine/de-types";
import { buildDailyOperationsQueue } from "@/lib/decision-engine/daily-operations-queue";
import { rankClients } from "@/lib/decision-engine/client-priority-ranker";
import { computePortfolioScore } from "@/lib/decision-engine/portfolio-scorer";

export type RecalculateDailyQueueOptions = {
  force?: boolean;
  persist?: boolean;
};

export async function recalculateDailyOperationsQueue(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: RecalculateDailyQueueOptions = {}
): Promise<{ queue: DailyOperationsQueue; cached: boolean; generation_ms: number }> {
  const { force = false, persist = true } = options;
  const t0 = Date.now();

  if (!force) {
    const cached = await readDailyQueueSnapshot(supabase, tenantCompanyId);
    if (cached && isDailyQueueSnapshotFresh(cached)) {
      return {
        queue: cached.payload,
        cached: true,
        generation_ms: cached.generation_ms ?? 0,
      };
    }
  }

  const bundle = await loadDecisionEngineBundle(supabase, tenantCompanyId);
  const now = new Date(bundle.loadedAt);
  const portfolio_score = computePortfolioScore(
    bundle.pendingInvoices,
    bundle.recentInvoices,
    bundle.recentReceipts,
    now
  );
  const ranked = rankClients(
    bundle.pendingInvoices,
    bundle.companies,
    bundle.recentActions,
    now
  );

  const queue = buildDailyOperationsQueue({
    bundle,
    ranked,
    portfolio_score,
    now,
  });

  const generation_ms = Date.now() - t0;

  if (persist) {
    await upsertDailyQueueSnapshot(supabase, tenantCompanyId, queue, generation_ms);
  }

  return { queue, cached: false, generation_ms };
}

/** Invalida briefing + cola; útil antes de recálculo en background. */
export async function invalidateDecisionEngineCaches(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<void> {
  await Promise.all([
    invalidateBriefingSnapshot(supabase, tenantCompanyId),
    invalidateDailyQueueSnapshot(supabase, tenantCompanyId),
  ]);
}

/**
 * Tras acción operacional o cambio SLA: invalida caches y recalcula cola (non-blocking safe).
 */
export function scheduleDailyQueueRecalculation(
  supabase: SupabaseClient,
  tenantCompanyId: string
): void {
  void (async () => {
    try {
      await invalidateDecisionEngineCaches(supabase, tenantCompanyId);
      await recalculateDailyOperationsQueue(supabase, tenantCompanyId, {
        force: true,
        persist: true,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          source: "decision_engine",
          kind: "daily_queue_recalc_failed",
          workspace_id: tenantCompanyId,
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  })();
}
