import { NextRequest, NextResponse } from "next/server";

import type { InitiativeRow } from "@/lib/ai/initiative-types";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { selectInitiativesOrdered } from "@/lib/data/engine-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

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
      200,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 50 : 50)
    );

    const { data, error } = await selectInitiativesOrdered(auth.ctx.supabase, limit);

    if (error) {
      log.error("copilot_engine_query_failed", error, {
        operation: "selectInitiativesOrdered",
        limit,
      });
      return NextResponse.json(
        { error: error.message, initiatives: [] as InitiativeRow[] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      initiatives: (data ?? []) as InitiativeRow[],
    });
  } catch (e) {
    log.error("copilot_request_unhandled", e, { route: "GET /api/copilot/initiatives" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, initiatives: [] as InitiativeRow[] },
      { status: 500 }
    );
  }
}
