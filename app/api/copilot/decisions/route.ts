import { NextRequest, NextResponse } from "next/server";

import type { DecisionRow } from "@/lib/ai/decision-types";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { selectDecisionsOrdered } from "@/lib/data/engine-repository";
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
      500,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 100 : 200)
    );

    const { data, error } = await selectDecisionsOrdered(auth.ctx.supabase, limit);

    if (error) {
      log.error("copilot_engine_query_failed", error, {
        operation: "selectDecisionsOrdered",
        limit,
      });
      return NextResponse.json(
        { error: error.message, decisions: [] as DecisionRow[] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      decisions: (data ?? []) as DecisionRow[],
    });
  } catch (e) {
    log.error("copilot_request_unhandled", e, { route: "GET /api/copilot/decisions" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, decisions: [] as DecisionRow[] },
      { status: 500 }
    );
  }
}
