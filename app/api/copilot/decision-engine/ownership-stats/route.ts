/**
 * GET /api/copilot/decision-engine/ownership-stats
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { getOperationalOwnershipStatsForTenant } from "@/lib/decision-engine/decision-engine-ownership-service";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const stats = await getOperationalOwnershipStatsForTenant(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId
    );

    return NextResponse.json({ ok: true as const, stats });
  } catch (error) {
    log.error("de_ownership_stats_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
