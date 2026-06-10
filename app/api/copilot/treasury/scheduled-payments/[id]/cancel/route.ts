import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { scheduledPaymentCancelBodySchema } from "@/lib/api/schemas/treasury-scheduled-payment-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";
import { cancelScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id del pago." },
        { status: 400 }
      );
    }

    const parsed = await parseAndValidateJsonBody(request, scheduledPaymentCancelBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria",
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await cancelScheduledPayment(
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
