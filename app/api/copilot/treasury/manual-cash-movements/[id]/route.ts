import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { manualCashMovementUpdateBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  manualCashMovementDelete,
  manualCashMovementUpdate,
} from "@/lib/treasury/services/manual-cash-movement-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id del movimiento." },
        { status: 400 }
      );
    }

    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const result = await manualCashMovementDelete(
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id del movimiento." },
        { status: 400 }
      );
    }

    const parsed = await parseAndValidateJsonBody(request, manualCashMovementUpdateBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotTenantContext(
      request,
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await manualCashMovementUpdate(
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
