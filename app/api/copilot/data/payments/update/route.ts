import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { protoPaymentUpdateBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoUpdatePayment } from "@/lib/copilot-proto-crud-service";

export async function PATCH(request: NextRequest) {
  try {
    const pv = await parseAndValidateJsonBody(
      request,
      protoPaymentUpdateBodySchema
    );
    if (!pv.ok) return pv.response;

    const { id, ...patch } = pv.data;
    const auth = await requireCopilotTenantContext(
      request,
      pv.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await protoUpdatePayment(auth.ctx.supabase, id, patch);
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
