import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { protoCompanyCreateBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoCreateCompany } from "@/lib/copilot-proto-crud-service";

export async function POST(request: NextRequest) {
  try {
    const pv = await parseAndValidateJsonBody(
      request,
      protoCompanyCreateBodySchema
    );
    if (!pv.ok) return pv.response;

    const body = pv.data;
    const auth = await requireCopilotTenantContext(
      request,
      body as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await protoCreateCompany(
      auth.ctx.supabase,
      body,
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
