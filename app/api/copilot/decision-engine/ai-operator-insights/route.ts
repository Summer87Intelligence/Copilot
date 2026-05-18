/**
 * GET /api/copilot/decision-engine/ai-operator-insights
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { generateOperationalIntelligence } from "@/lib/decision-engine/ai/ai-intelligence-orchestrator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const force = request.nextUrl.searchParams.get("force") === "true";
    const intelligence = await generateOperationalIntelligence(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      { force },
      log
    );

    return NextResponse.json({
      ok: true as const,
      operator_insights: intelligence.operator_insights,
      workload_warnings: intelligence.briefing.workload_warnings,
      cached: intelligence.cached,
      generated_at: intelligence.generated_at,
    });
  } catch (error) {
    log.error("ai_operator_insights_route_failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
