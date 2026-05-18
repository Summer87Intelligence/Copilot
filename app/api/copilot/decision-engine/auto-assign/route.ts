/**
 * POST /api/copilot/decision-engine/auto-assign
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { autoAssignOperationalOwnersForTenant } from "@/lib/decision-engine/decision-engine-ownership-service";

export const dynamic = "force-dynamic";

type AutoAssignBody = {
  customer_ids?: string[];
};

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    let customerIds: string[] | undefined;
    try {
      const body = (await request.json()) as AutoAssignBody;
      if (Array.isArray(body.customer_ids) && body.customer_ids.length > 0) {
        customerIds = body.customer_ids.map((id) => String(id).trim()).filter(Boolean);
      }
    } catch {
      /* empty body OK */
    }

    const result = await autoAssignOperationalOwnersForTenant(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      { customerIds, assignedBy: auth.ctx.appUser.id }
    );

    log.info("de_auto_assign_complete", {
      assigned_count: result.assigned.length,
    });

    return NextResponse.json({
      ok: true as const,
      assigned: result.assigned,
      decisions: result.decisions,
    });
  } catch (error) {
    log.error("de_auto_assign_failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
