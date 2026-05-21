import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { scheduledPaymentUpdateBodySchema } from "@/lib/api/schemas/treasury-scheduled-payment-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";
import {
  deleteScheduledPayment,
  updateScheduledPayment,
} from "@/lib/treasury/treasury-scheduled-payments";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id del pago." },
        { status: 400 }
      );
    }

    const auth = await requireCopilotTenantContext(_request);
    if (!auth.ok) return auth.response;

    const result = await deleteScheduledPayment(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const parsed = await parseAndValidateJsonBody(request, scheduledPaymentUpdateBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotTenantContext(
      request,
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await updateScheduledPayment(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      parsed.data
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
