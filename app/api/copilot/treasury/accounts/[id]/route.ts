import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { treasuryAccountUpdateBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { treasuryAccountUpdate } from "@/lib/treasury/services/treasury-account-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id de la cuenta." },
        { status: 400 }
      );
    }

    const parsed = await parseAndValidateJsonBody(request, treasuryAccountUpdateBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotTenantContext(
      request,
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await treasuryAccountUpdate(
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
