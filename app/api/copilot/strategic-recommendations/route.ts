import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { buildStrategicRecommendationsForWorkspace } from "@/lib/copilot-strategic-recommendations";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "agentes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const payload = await buildStrategicRecommendationsForWorkspace(
      supabase,
      auth.ctx.tenantCompanyId
    );
    return NextResponse.json(payload);
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/strategic-recommendations",
    });
    return copilotInternalErrorResponse({ recommendations: [],
        generatedAt: new Date().toISOString(),
      });
  }
}
