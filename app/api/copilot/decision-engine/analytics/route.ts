/**
 * GET /api/copilot/decision-engine/analytics
 * Snapshot completo de analytics operacional (Phase 4B). Cache-first; ?force=true recalcula.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { readOperationalAnalyticsSnapshot } from "@/lib/data/decision-operational-analytics-repository";
import { getOperationalAnalytics } from "@/lib/decision-engine/operational-analytics-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const t0 = Date.now();

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const forceRefresh = request.nextUrl.searchParams.get("force") === "true";
    const result = await getOperationalAnalytics(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      { force: forceRefresh }
    );

    const snapshot = await readOperationalAnalyticsSnapshot(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId
    );

    log.info("de_analytics_served", {
      cached: result.cached,
      generation_ms: result.generation_ms,
      active_cases: result.analytics.global.active_cases,
      elapsed_ms: Date.now() - t0,
    });

    return NextResponse.json({
      ok: true as const,
      analytics: result.analytics,
      cached: result.cached,
      stale: false,
      generated_at: result.analytics.generated_at,
      expires_at: snapshot?.expires_at ?? null,
      generation_ms: result.generation_ms,
    });
  } catch (error) {
    log.error("de_analytics_unhandled", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
