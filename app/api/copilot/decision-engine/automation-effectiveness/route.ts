/**
 * GET /api/copilot/decision-engine/automation-effectiveness
 * Phase 5D — Automation Effectiveness snapshot.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import { selectAutomationActions, selectAutomationRuns } from "@/lib/data/decision-automation-repository";
import { readLearningOutcomes } from "@/lib/data/decision-learning-repository";
import { computeAutomationEffectiveness } from "@/lib/decision-engine/learning/automation-effectiveness-engine";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;

    const [bundle, automationRuns, automationActions, existingOutcomes] = await Promise.all([
      loadDecisionEngineBundle(supabase, tenantCompanyId).catch(() => null),
      selectAutomationRuns(supabase, tenantCompanyId, 5).catch(() => []),
      selectAutomationActions(supabase, tenantCompanyId, { limit: 500 }).catch(() => []),
      readLearningOutcomes(supabase, tenantCompanyId).catch(() => []),
    ]);

    if (!bundle) {
      return NextResponse.json(
        { ok: false as const, code: "NO_BUNDLE", message: "Sin datos del motor." },
        { status: 503 }
      );
    }

    const snapshot = computeAutomationEffectiveness({
      bundle,
      analytics:        null,
      automationRuns,
      automationActions,
      predictive:       null,
      existingOutcomes,
      loadedAt:         new Date().toISOString(),
    });

    log.info("automation_effectiveness_computed", {
      total_rules:   snapshot.total_rules_evaluated,
      noisy_rules:   snapshot.noisy_rules.length,
      dedupe_ratio:  snapshot.overall_dedupe_ratio,
    });

    return NextResponse.json({ ok: true as const, data: snapshot });
  } catch (error) {
    log.error("automation_effectiveness_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
