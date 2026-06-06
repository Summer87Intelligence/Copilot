/**
 * GET /api/copilot/decision-engine/ai-briefing
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { readAIBriefingSnapshot } from "@/lib/data/decision-ai-briefing-repository";
import {
  AI_BRIEFING_TYPE,
  generateOperationalIntelligence,
} from "@/lib/decision-engine/ai/ai-intelligence-orchestrator";
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
    const snapshot = await readAIBriefingSnapshot(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      AI_BRIEFING_TYPE
    );

    return NextResponse.json({
      ok: true as const,
      intelligence,
      cached: intelligence.cached,
      generated_at: intelligence.generated_at,
      expires_at: snapshot?.expires_at ?? intelligence.expires_at,
    });
  } catch (error) {
    log.error("ai_briefing_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
