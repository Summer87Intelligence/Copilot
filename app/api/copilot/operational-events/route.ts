import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  listOperationalTimeline,
  listOperationalTimelineForEntity,
} from "@/lib/copilot-operational-events";
import type { OperationalEntityType } from "@/lib/copilot-operational-events-types";
import { summarizeAutomationFromTimeline } from "@/lib/copilot-operational-automation-rules";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

function parseLimit(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get("limit");
  const parsed = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(parsed, 50);
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "hoy");
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

    const limit = parseLimit(request);
    const entityType = request.nextUrl.searchParams.get("entityType");
    const entityId = request.nextUrl.searchParams.get("entityId");

    const events =
      entityType && entityId
        ? await listOperationalTimelineForEntity(
            supabase,
            auth.ctx.tenantCompanyId,
            entityType as OperationalEntityType,
            entityId,
            limit
          )
        : await listOperationalTimeline(supabase, auth.ctx.tenantCompanyId, limit);

    return NextResponse.json({
      ok: true as const,
      events,
      computedAt: new Date().toISOString(),
      automationMetadata: summarizeAutomationFromTimeline(events),
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-events",
    });
    return copilotInternalErrorResponse({
      ok: false as const,
      code: "UNEXPECTED",
      events: [],
      computedAt: new Date().toISOString(),
    });
  }
}
