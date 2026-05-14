import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { buildOperationalFeedTimeline } from "@/lib/copilot-operational-feed";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      40,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 12 : 12)
    );

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const events = await buildOperationalFeedTimeline(
      supabase,
      auth.ctx.tenantCompanyId,
      limit
    );
    return NextResponse.json({
      events,
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-feed/timeline",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message, events: [] }, { status: 500 });
  }
}
