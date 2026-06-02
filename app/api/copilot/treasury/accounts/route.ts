import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { treasuryAccountCreateBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotTenantContext, requireCopilotWriteContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  treasuryAccountCreate,
  treasuryAccountList,
} from "@/lib/treasury/services/treasury-account-service";
import { nextResponseFromTreasuryCrud, treasuryCreatedResponse } from "@/lib/treasury/treasury-http";
import { parseTreasuryAccountListQuery } from "@/lib/treasury/treasury-list-query";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const filters = parseTreasuryAccountListQuery(request);
    const result = await treasuryAccountList(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      {
        currencyCode: filters.currencyCode,
        status: filters.status,
      },
      filters.limit
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseAndValidateJsonBody(request, treasuryAccountCreateBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotWriteContext(
      request,
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await treasuryAccountCreate(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      parsed.data
    );
    return treasuryCreatedResponse(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
