import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { listOperationalActionEvents } from "@/lib/copilot-operational-actions-service";
import { mapOperationalActionEventRow } from "@/lib/data/operational-actions-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  let log = copilotRequestLogger(request);
  const { id } = await context.params;

  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      100,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 40 : 40)
    );

    const result = await listOperationalActionEvents(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      limit
    );
    if (!result.ok) {
      return copilotInternalErrorResponse({ events: [] });
    }

    const events = (result.data ?? []).map((row) =>
      mapOperationalActionEventRow(row as Record<string, unknown>)
    );
    return NextResponse.json({ events });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-actions/[id]/events",
    });
    return copilotInternalErrorResponse({ events: [] });
  }
}
