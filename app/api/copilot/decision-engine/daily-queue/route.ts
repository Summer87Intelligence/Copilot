/**
 * GET /api/copilot/decision-engine/daily-queue
 *
 * Cola operacional priorizada (Phase 2B/2C).
 * Cache-first en decision_daily_queue_snapshots; ?force=true recalcula.
 * Phase 3C: hydration_by_customer con estado DB real (no en snapshot).
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  isDailyQueueSnapshotFresh,
  readDailyQueueSnapshot,
} from "@/lib/data/decision-daily-queue-repository";
import { loadDailyQueueHydration } from "@/lib/decision-engine/daily-queue-hydration";
import { recalculateDailyOperationsQueue } from "@/lib/decision-engine/daily-queue-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

function isQueuePayloadCurrent(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.generated_at === "string" &&
    p.sections != null &&
    typeof p.sections === "object" &&
    p.stats != null &&
    typeof p.stats === "object"
  );
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const t0 = Date.now();

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("de_daily_queue_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;
    const forceRefresh = request.nextUrl.searchParams.get("force") === "true";

    if (!forceRefresh) {
      const cached = await readDailyQueueSnapshot(supabase, tenantCompanyId);
      if (cached && isDailyQueueSnapshotFresh(cached) && isQueuePayloadCurrent(cached.payload)) {
        const hydration_by_customer = await loadDailyQueueHydration(
          supabase,
          tenantCompanyId,
          cached.payload
        );
        log.info("de_daily_queue_cache_hit", {
          generated_at: cached.generated_at,
          expires_at: cached.expires_at,
          total_tasks: cached.payload.stats.total_tasks,
          hydrated_clients: Object.keys(hydration_by_customer).length,
        });
        return NextResponse.json({
          ok: true as const,
          queue: cached.payload,
          hydration_by_customer,
          cached: true,
          stale: false,
          generated_at: cached.generated_at,
          expires_at: cached.expires_at,
          generation_ms: cached.generation_ms ?? 0,
        });
      }

      if (cached && !isDailyQueueSnapshotFresh(cached) && isQueuePayloadCurrent(cached.payload)) {
        log.info("de_daily_queue_stale_cache", { expires_at: cached.expires_at });
      }
    }

    const result = await recalculateDailyOperationsQueue(supabase, tenantCompanyId, {
      force: true,
      persist: true,
    });

    const snapshot = await readDailyQueueSnapshot(supabase, tenantCompanyId);
    const hydration_by_customer = await loadDailyQueueHydration(
      supabase,
      tenantCompanyId,
      result.queue
    );

    log.info("de_daily_queue_generated", {
      total_tasks: result.queue.stats.total_tasks,
      urgent: result.queue.stats.urgent_count,
      generation_ms: result.generation_ms,
      cached: result.cached,
      hydrated_clients: Object.keys(hydration_by_customer).length,
    });

    return NextResponse.json({
      ok: true as const,
      queue: result.queue,
      hydration_by_customer,
      cached: result.cached,
      stale: false,
      generated_at: result.queue.generated_at,
      expires_at: snapshot?.expires_at ?? null,
      generation_ms: result.generation_ms,
    });
  } catch (error) {
    log.error("de_daily_queue_unhandled", error, {
      route: "GET /api/copilot/decision-engine/daily-queue",
      elapsed_ms: Date.now() - t0,
    });
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
