/**
 * GET /api/copilot/decision-engine/action-effectiveness
 * Phase 5D — Action Effectiveness snapshot (computed on-demand, no cache).
 * ?force=true re-fetches regardless.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import { readLearningOutcomes } from "@/lib/data/decision-learning-repository";
import { computeActionEffectiveness } from "@/lib/decision-engine/learning/action-effectiveness-engine";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;

    const [bundle, existingOutcomes] = await Promise.all([
      loadDecisionEngineBundle(supabase, tenantCompanyId).catch(() => null),
      readLearningOutcomes(supabase, tenantCompanyId).catch(() => []),
    ]);

    if (!bundle) {
      return NextResponse.json(
        { ok: false as const, code: "NO_BUNDLE", message: "Sin datos del motor." },
        { status: 503 }
      );
    }

    const snapshot = computeActionEffectiveness({
      bundle,
      analytics:        null,
      automationRuns:   [],
      automationActions: [],
      predictive:       null,
      existingOutcomes,
      loadedAt:         new Date().toISOString(),
    });

    log.info("action_effectiveness_computed", {
      data_source:   snapshot.data_source,
      actions_count: snapshot.by_action_type.length,
    });

    return NextResponse.json({ ok: true as const, data: snapshot });
  } catch (error) {
    log.error("action_effectiveness_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
