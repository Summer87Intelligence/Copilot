import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { manualCashMovementCreateBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  manualCashMovementCreate,
  manualCashMovementList,
} from "@/lib/treasury/services/manual-cash-movement-service";
import { nextResponseFromTreasuryCrud, treasuryCreatedResponse } from "@/lib/treasury/treasury-http";
import { parseManualCashListQuery } from "@/lib/treasury/treasury-list-query";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const filters = parseManualCashListQuery(request);
    const result = await manualCashMovementList(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      filters,
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
    const parsed = await parseAndValidateJsonBody(request, manualCashMovementCreateBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotTenantContext(
      request,
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await manualCashMovementCreate(
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
