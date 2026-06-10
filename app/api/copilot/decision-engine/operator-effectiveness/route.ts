/**
 * GET /api/copilot/decision-engine/operator-effectiveness
 * Phase 5D — Operator Effectiveness snapshot.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import { readOperationalAnalyticsSnapshot } from "@/lib/data/decision-operational-analytics-repository";
import { readLearningOutcomes } from "@/lib/data/decision-learning-repository";
import { computeOperatorEffectiveness } from "@/lib/decision-engine/learning/operator-effectiveness-engine";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;

    const [bundle, analyticsRow, existingOutcomes] = await Promise.all([
      loadDecisionEngineBundle(supabase, tenantCompanyId).catch(() => null),
      readOperationalAnalyticsSnapshot(supabase, tenantCompanyId).catch(() => null),
      readLearningOutcomes(supabase, tenantCompanyId).catch(() => []),
    ]);

    if (!bundle) {
      return NextResponse.json(
        { ok: false as const, code: "NO_BUNDLE", message: "Sin datos del motor." },
        { status: 503 }
      );
    }

    const snapshot = computeOperatorEffectiveness({
      bundle,
      analytics:        analyticsRow?.payload ?? null,
      automationRuns:   [],
      automationActions: [],
      predictive:       null,
      existingOutcomes,
      loadedAt:         new Date().toISOString(),
    });

    log.info("operator_effectiveness_computed", {
      data_source:      snapshot.data_source,
      operators_count:  snapshot.by_operator.length,
    });

    return NextResponse.json({ ok: true as const, data: snapshot });
  } catch (error) {
    log.error("operator_effectiveness_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
