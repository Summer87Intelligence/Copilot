/**
 * POST /api/copilot/decision-engine/unassign
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { unassignOperationalOwnerForTenant } from "@/lib/decision-engine/decision-engine-ownership-service";

export const dynamic = "force-dynamic";

type UnassignBody = {
  customer_id?: string;
};

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
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
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
