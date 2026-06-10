/**
 * POST /api/copilot/decision-engine/unassign
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { unassignOperationalOwnerForTenant } from "@/lib/decision-engine/decision-engine-ownership-service";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

type UnassignBody = {
  customer_id?: string;
};

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = (await request.json()) as UnassignBody;
    const customerId = body.customer_id?.trim();
    if (!customerId) {
      return NextResponse.json(
        { ok: false as const, code: "INVALID_BODY", message: "customer_id es obligatorio" },
        { status: 400 }
      );
    }

    const state = await unassignOperationalOwnerForTenant(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      customerId
    );

    return NextResponse.json({ ok: true as const, state });
  } catch (error) {
    log.error("de_unassign_owner_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
