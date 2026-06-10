import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { recurringObligationTemplateUpdateBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  cancelRecurringPayment,
  deleteRecurringPayment,
  getRecurringPaymentById,
  mapRecurringTemplateUpdateBodyToInput,
  pauseRecurringPayment,
  updateRecurringPayment,
} from "@/lib/treasury/treasury-recurring-payments";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const result = await getRecurringPaymentById(
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
    const parsed = await parseAndValidateJsonBody(
      request,
      recurringObligationTemplateUpdateBodySchema
    );
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria",
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const action = (parsed.data as { action?: string }).action;
    if (action === "pause") {
      const result = await pauseRecurringPayment(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        id
      );
      return nextResponseFromTreasuryCrud(result);
    }
    if (action === "cancel") {
      const result = await cancelRecurringPayment(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        id
      );
      return nextResponseFromTreasuryCrud(result);
    }

    const result = await updateRecurringPayment(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      mapRecurringTemplateUpdateBodyToInput(parsed.data)
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const cancelPending =
      request.nextUrl.searchParams.get("cancel_pending_obligations") === "true" ||
      request.nextUrl.searchParams.get("cancel_pending_obligations") === "1";

    const result = await deleteRecurringPayment(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      { cancelPendingObligations: cancelPending }
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
