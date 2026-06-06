/**
 * GET /api/copilot/decision-engine/ai-anomalies
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { generateOperationalIntelligence } from "@/lib/decision-engine/ai/ai-intelligence-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

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
      anomalies: intelligence.anomalies,
      metrics: { anomalies_detected: intelligence.metrics.anomalies_detected },
      cached: intelligence.cached,
      generated_at: intelligence.generated_at,
    });
  } catch (error) {
    log.error("ai_anomalies_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
