import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { treasuryAlertsOnly } from "@/lib/treasury/services/treasury-intelligence-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";
import { parseTreasuryIntelligenceQuery } from "@/lib/treasury/treasury-list-query";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const query = parseTreasuryIntelligenceQuery(request);
    const result = await treasuryAlertsOnly(auth.ctx.supabase, auth.ctx.tenantCompanyId, {
      asOfDate: query.asOfDate,
      horizonDays: query.horizonDays,
    });
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
