/**
 * GET /api/copilot/decision-engine/sla-analytics
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { readOperationalAnalyticsSnapshot } from "@/lib/data/decision-operational-analytics-repository";
import { getOperationalAnalytics } from "@/lib/decision-engine/operational-analytics-orchestrator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
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

    return NextResponse.json({
      ok: true as const,
      sla: result.analytics.sla,
      global_sla_breaches: result.analytics.global.breached_sla_cases,
      cached: result.cached,
      generated_at: result.analytics.generated_at,
      expires_at: snapshot?.expires_at ?? null,
      generation_ms: result.generation_ms,
    });
  } catch (error) {
    log.error("de_sla_analytics_unhandled", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
