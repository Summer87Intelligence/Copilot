/**
 * GET /api/copilot/decision-engine/portfolio-forecast
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { generatePredictiveSnapshot } from "@/lib/decision-engine/predictive/predictive-orchestrator";

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

    log.info("portfolio_forecast_generated", { horizons: predictive.portfolio_forecasts.length });

    return NextResponse.json({
      ok: true as const,
      portfolio_forecasts: predictive.portfolio_forecasts,
      executive_prediction_summary: predictive.executive_prediction_summary,
      cached: predictive.cached,
      generated_at: predictive.generated_at,
    });
  } catch (error) {
    log.error("portfolio_forecast_route_failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
