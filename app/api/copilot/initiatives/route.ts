import { NextRequest, NextResponse } from "next/server";

import type { InitiativeRow } from "@/lib/ai/initiative-types";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { selectInitiativesOrdered } from "@/lib/data/engine-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      200,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 50 : 50)
    );

    const { data, error } = await selectInitiativesOrdered(auth.ctx.supabase, limit);

    if (error) {
      log.error("copilot_engine_query_failed", error, {
        operation: "selectInitiativesOrdered",
        limit,
      });
      return copilotInternalErrorResponse({ initiatives: [] as InitiativeRow[] });
    }

    return NextResponse.json({
      initiatives: (data ?? []) as InitiativeRow[],
    });
  } catch (e) {
    log.error("copilot_request_unhandled", e, { route: "GET /api/copilot/initiatives" });
    return copilotInternalErrorResponse({ initiatives: [] as InitiativeRow[] });
  }
}
