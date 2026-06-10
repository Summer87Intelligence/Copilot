import { NextRequest, NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/parse-json-body";
import { scheduledPaymentMarkPaidBodySchema } from "@/lib/api/schemas/treasury-scheduled-payment-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotInvalidPayloadResponse } from "@/lib/api/copilot-request-errors";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";
import { markScheduledPaymentAsPaid } from "@/lib/treasury/treasury-scheduled-payments";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    let body: { amount_final?: number; register_cash_movement?: boolean } = {};
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const raw = await parseJsonBody(request);
      if (!raw.ok) return raw.response;
      const parsed = scheduledPaymentMarkPaidBodySchema.safeParse(raw.value ?? {});
      if (!parsed.success) return copilotInvalidPayloadResponse(parsed.error);
      body = parsed.data;
    }

    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria", body as Record<string, unknown>);
    if (!auth.ok) return auth.response;

    const result = await markScheduledPaymentAsPaid(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      body
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
