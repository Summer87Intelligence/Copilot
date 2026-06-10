import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { bankReconciliationIgnoreBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { bankReconciliationMovementMarkIgnored } from "@/lib/treasury/services/bank-reconciliation-movement-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id del movimiento bancario." },
        { status: 400 }
      );
    }

    const parsed = await parseAndValidateJsonBody(request, bankReconciliationIgnoreBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria",
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await bankReconciliationMovementMarkIgnored(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      parsed.data.notes
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
