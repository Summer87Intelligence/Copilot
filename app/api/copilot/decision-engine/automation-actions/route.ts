/**
 * GET /api/copilot/decision-engine/automation-actions
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { selectAutomationActions } from "@/lib/data/decision-automation-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const runId = request.nextUrl.searchParams.get("run_id") ?? undefined;
    const limit = Math.min(
      100,
      Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50
    );

    const actions = await selectAutomationActions(auth.ctx.supabase, auth.ctx.tenantCompanyId, {
      runId,
      limit,
    });

    return NextResponse.json({ ok: true as const, actions });
  } catch (error) {
    log.error("de_automation_actions_failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
