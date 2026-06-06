import { NextRequest, NextResponse } from "next/server";

import { assembleCopilotLlmBriefing } from "@/lib/ai/briefing/assemble-copilot-llm-briefing";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

/**
 * GET /api/copilot/llm-briefing
 * AI-01 — Briefing estructurado para LLM (datos internos, tenant-safe, sin DTOs de proveedor).
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const operatorLabel = auth.ctx.appUser.full_name?.trim() || "Usuario";
    const operatorRole = auth.ctx.appUser.role?.trim() || "member";

    const briefing = await assembleCopilotLlmBriefing(auth.ctx.supabase, {
      tenantCompanyId: auth.ctx.tenantCompanyId,
      operatorLabel,
      operatorRole,
    });

    log.info("copilot_llm_briefing_served", {
      coverage: briefing.coverage,
      sources: briefing.trace.sources.length,
      signals: briefing.signals.length,
      missing: briefing.missingData.length,
    });

    return NextResponse.json({ briefing });
  } catch (e) {
    log.error("copilot_llm_briefing_failed", e, { route: "GET /api/copilot/llm-briefing" });
    return copilotInternalErrorResponse({});
  }
}
