/**
 * POST /api/copilot/decision-engine/run-automation
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { runOperationalAutomation } from "@/lib/decision-engine/operational-automation-runner";

export const dynamic = "force-dynamic";

type RunBody = {
  dry_run?: boolean;
  preview?: boolean;
  customer_ids?: string[];
  force?: boolean;
};

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    let body: RunBody = {};
    try {
      body = (await request.json()) as RunBody;
    } catch {
      /* empty body OK */
    }

    const result = await runOperationalAutomation(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      {
        dryRun: body.dry_run === true,
        preview: body.preview === true,
        customerIds: body.customer_ids,
        force: body.force === true,
        actorUserId: auth.ctx.appUser.id,
      },
      log
    );

    return NextResponse.json({
      ok: true as const,
      run: result.run,
      actions: result.actions,
      preview: result.preview,
      metrics: result.metrics,
    });
  } catch (error) {
    log.error("de_run_automation_failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    const status = message.includes("already in progress") ? 409 : 500;
    return NextResponse.json(
      { ok: false as const, code: status === 409 ? "CONFLICT" : "UNEXPECTED" },
      { status }
    );
  }
}
