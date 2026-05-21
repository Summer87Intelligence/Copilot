import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { treasuryCashPositionGet } from "@/lib/treasury/services/treasury-cash-opening-balance-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const result = await treasuryCashPositionGet(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
