/**
 * GET /api/copilot/decision-engine/automation-runs
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { selectAutomationRuns } from "@/lib/data/decision-automation-repository";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const limit = Math.min(
      50,
      Number(request.nextUrl.searchParams.get("limit") ?? 20) || 20
    );
    const runs = await selectAutomationRuns(auth.ctx.supabase, auth.ctx.tenantCompanyId, limit);

    return NextResponse.json({ ok: true as const, runs });
  } catch (error) {
    log.error("de_automation_runs_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
