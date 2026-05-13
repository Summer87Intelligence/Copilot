import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { manualCashMovementArchive } from "@/lib/treasury/services/manual-cash-movement-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id del movimiento." },
        { status: 400 }
      );
    }

    const result = await manualCashMovementArchive(
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
