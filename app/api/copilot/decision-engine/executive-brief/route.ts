/**
 * GET /api/copilot/decision-engine/executive-brief
 * Phase 5C — Executive Decision Brief.
 * Cache-first TTL 15 min. ?force=true fuerza recálculo.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  isExecutiveBriefingFresh,
  isExecutiveBriefingPayloadCurrent,
  readExecutiveBriefing,
  upsertExecutiveBriefing,
} from "@/lib/data/decision-executive-briefing-repository";
import { readBriefingSnapshot } from "@/lib/data/decision-snapshot-repository";
import { readOperationalAnalyticsSnapshot } from "@/lib/data/decision-operational-analytics-repository";
import { readPredictiveSnapshot } from "@/lib/data/decision-predictive-snapshot-repository";
import { selectAutomationActions, selectAutomationRuns } from "@/lib/data/decision-automation-repository";
import { generateExecutiveBrief } from "@/lib/decision-engine/executive-decision-engine";
import { PREDICTIVE_SNAPSHOT_TYPE } from "@/lib/decision-engine/predictive/predictive-orchestrator";
import type { PipelineSignal } from "@/lib/decision-engine/executive-decision-engine";
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
      const cached = await readExecutiveBriefing(supabase, tenantCompanyId);
      if (
        cached &&
        isExecutiveBriefingFresh(cached) &&
        isExecutiveBriefingPayloadCurrent(cached.payload)
      ) {
        log.info("executive_brief_cache_hit", { generated_at: cached.generated_at });
        return NextResponse.json({
          ok: true as const,
          brief: cached.payload,
          cached: true,
          generated_at: cached.generated_at,
          expires_at: cached.expires_at,
        });
      }
    }

    // 2. Load snapshots in parallel (all optional — safe fallbacks)
    const [briefingRow, analyticsRow, predictiveRow, automationRuns, automationActions] =
      await Promise.all([
        readBriefingSnapshot(supabase, tenantCompanyId).catch(() => null),
        readOperationalAnalyticsSnapshot(supabase, tenantCompanyId).catch(() => null),
        readPredictiveSnapshot(supabase, tenantCompanyId, PREDICTIVE_SNAPSHOT_TYPE).catch(() => null),
        selectAutomationRuns(supabase, tenantCompanyId, 3).catch(() => []),
        selectAutomationActions(supabase, tenantCompanyId, { limit: 20 }).catch(() => []),
      ]);

    const briefing = briefingRow?.payload ?? null;
    const analytics = analyticsRow?.payload ?? null;
    const predictive = predictiveRow?.payload ?? null;

    const ranked_clients = briefing
      ? [...(briefing.urgent ?? []), ...(briefing.important ?? [])]
      : [];

    // 3. Derive pipeline signals from automation health proxy
    const pipeline_signals: PipelineSignal[] = [];
    if (automationRuns[0]) {
      const latestRun = automationRuns[0];
      const isOk = latestRun.status === "completed";
      const lastRunAt = latestRun.completed_at ?? latestRun.started_at;
      const staleThresholdMs = 6 * 60 * 60 * 1000; // 6h
      const isStale = lastRunAt
        ? Date.now() - new Date(lastRunAt).getTime() > staleThresholdMs
        : true;
      pipeline_signals.push({
        name: "automation_engine",
        ok: isOk,
        stale: isStale,
      });
    }

    // 4. Generate brief
    const brief = generateExecutiveBrief({
      portfolio_score: briefing?.portfolio_score ?? null,
      analytics,
      predictive,
      ranked_clients,
      automation_runs: automationRuns,
      automation_actions: automationActions,
      pipeline_signals,
    });

    const generationMs = Date.now() - t0;

    // 5. Persist (fire-and-forget)
    upsertExecutiveBriefing(supabase, tenantCompanyId, brief, {
      briefing_generated_at: briefingRow?.generated_at ?? null,
      analytics_generated_at: analyticsRow?.generated_at ?? null,
      predictive_generated_at: predictiveRow?.generated_at ?? null,
    }).catch((err) => {
      log.warn("executive_brief_persist_error", { message: String(err) });
    });

    log.info("executive_brief_generated", {
      decisions_count: brief.top_decisions.length,
      confidence_pct: brief.confidence_pct,
      generation_ms: generationMs,
    });

    return NextResponse.json({
      ok: true as const,
      brief,
      cached: false,
      generated_at: brief.generated_at,
      expires_at: null,
    });
  } catch (error) {
    log.error("executive_brief_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
