/**
 * POST /api/copilot/decision-engine/assign
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { assignOperationalOwnerForTenant } from "@/lib/decision-engine/decision-engine-ownership-service";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

type AssignBody = {
  customer_id?: string;
  assigned_user_id?: string;
  note?: string | null;
};

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = (await request.json()) as AssignBody;
    const customerId = body.customer_id?.trim();
    const assignedUserId = body.assigned_user_id?.trim();

    if (!customerId || !assignedUserId) {
      return NextResponse.json(
        { ok: false as const, code: "INVALID_BODY", message: "customer_id y assigned_user_id son obligatorios" },
        { status: 400 }
      );
    }

    const state = await assignOperationalOwnerForTenant(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      {
        customerId,
        assignedUserId,
        assignedBy: auth.ctx.appUser.id,
        note: body.note,
      }
    );

    return NextResponse.json({ ok: true as const, state });
  } catch (error) {
    log.error("de_assign_owner_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
