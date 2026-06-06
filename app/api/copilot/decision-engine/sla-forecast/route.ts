/**
 * GET /api/copilot/decision-engine/sla-forecast
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { generatePredictiveSnapshot } from "@/lib/decision-engine/predictive/predictive-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const force = request.nextUrl.searchParams.get("force") === "true";
    const predictive = await generatePredictiveSnapshot(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      { force },
      log
    );

    log.info("sla_stress_forecast_generated", { count: predictive.sla_forecasts.length });

    return NextResponse.json({
      ok: true as const,
      sla_forecasts: predictive.sla_forecasts,
      cached: predictive.cached,
      generated_at: predictive.generated_at,
    });
  } catch (error) {
    log.error("sla_forecast_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
