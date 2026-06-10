import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { protoCompanyUpdateBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoUpdateCompany } from "@/lib/copilot-proto-crud-service";

export async function PATCH(request: NextRequest) {
  try {
    const pv = await parseAndValidateJsonBody(
      request,
      protoCompanyUpdateBodySchema
    );
    if (!pv.ok) return pv.response;

    const { id, ...patch } = pv.data;
    const auth = await requireCopilotModuleWriteAccess(request, "datos",
      pv.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await protoUpdateCompany(
      auth.ctx.supabase,
      id,
      patch,
      auth.ctx.tenantCompanyId
    );
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
