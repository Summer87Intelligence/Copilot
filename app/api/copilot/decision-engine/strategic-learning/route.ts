/**
 * GET /api/copilot/decision-engine/strategic-learning
 * Phase 5D — Strategic Learning Snapshot.
 * Cache-first TTL 60 min. ?force=true fuerza recálculo.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import { readOperationalAnalyticsSnapshot } from "@/lib/data/decision-operational-analytics-repository";
import { readPredictiveSnapshot } from "@/lib/data/decision-predictive-snapshot-repository";
import { selectAutomationActions, selectAutomationRuns } from "@/lib/data/decision-automation-repository";
import {
  isLearningSnapshotFresh,
  readLearningOutcomes,
  readLearningSnapshot,
  STRATEGIC_LEARNING_SNAPSHOT_TYPE,
  upsertLearningSnapshot,
} from "@/lib/data/decision-learning-repository";
import { generateStrategicLearningSnapshot } from "@/lib/decision-engine/learning/strategic-learning-orchestrator";
import { PREDICTIVE_SNAPSHOT_TYPE } from "@/lib/decision-engine/predictive/predictive-orchestrator";
import type { StrategicLearningBundle } from "@/lib/decision-engine/learning/learning-types";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const t0 = Date.now();

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;
    const force = request.nextUrl.searchParams.get("force") === "true";

    // 1. Cache check
    if (!force) {
      const cached = await readLearningSnapshot(supabase, tenantCompanyId, STRATEGIC_LEARNING_SNAPSHOT_TYPE);
      if (cached && isLearningSnapshotFresh(cached)) {
        log.info("strategic_learning_cache_hit", { generated_at: cached.generated_at });
        const bundle: StrategicLearningBundle = {
          ...cached.payload,
          cached:     true,
          expires_at: cached.expires_at,
        };
        return NextResponse.json({ ok: true as const, data: bundle, cached: true });
      }
    }

    // 2. Load all context in parallel
    const [bundle, analyticsRow, predictiveRow, automationRuns, automationActions, existingOutcomes] =
      await Promise.all([
        loadDecisionEngineBundle(supabase, tenantCompanyId).catch(() => null),
        readOperationalAnalyticsSnapshot(supabase, tenantCompanyId).catch(() => null),
        readPredictiveSnapshot(supabase, tenantCompanyId, PREDICTIVE_SNAPSHOT_TYPE).catch(() => null),
        selectAutomationRuns(supabase, tenantCompanyId, 10).catch(() => []),
        selectAutomationActions(supabase, tenantCompanyId, { limit: 500 }).catch(() => []),
        readLearningOutcomes(supabase, tenantCompanyId).catch(() => []),
      ]);

    if (!bundle) {
      return NextResponse.json(
        { ok: false as const, code: "NO_BUNDLE", message: "No se pudo cargar datos del motor." },
        { status: 503 }
      );
    }

    // 3. Build context
    const context = {
      bundle,
      analytics:        analyticsRow?.payload ?? null,
      automationRuns,
      automationActions,
      predictive:       predictiveRow?.payload ?? null,
      existingOutcomes,
      loadedAt:         new Date().toISOString(),
    };

    // 4. Generate snapshot
    const snapshot = generateStrategicLearningSnapshot(context);
    const generationMs = Date.now() - t0;

    // 5. Persist (fire-and-forget)
    upsertLearningSnapshot(supabase, tenantCompanyId, snapshot).catch((err) => {
      log.warn("strategic_learning_persist_error", { message: String(err) });
    });

    log.info("strategic_learning_generated", {
      outcomes_total:       snapshot.outcomes_total,
      recommendations:      snapshot.strategy_recommendations.length,
      calibration_score:    snapshot.forecast_calibration.calibration_score,
      generation_ms:        generationMs,
    });

    const resultBundle: StrategicLearningBundle = {
      ...snapshot,
      cached:     false,
      expires_at: null,
    };

    return NextResponse.json({ ok: true as const, data: resultBundle, cached: false });
  } catch (error) {
    log.error("strategic_learning_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
