import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { plannedCashObligationUpcoming } from "@/lib/treasury/services/planned-cash-obligation-service";
import { todayYmdUtc } from "@/lib/treasury/treasury-db-helpers";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";
import { parseUpcomingObligationQuery } from "@/lib/treasury/treasury-list-query";
import { loadInactiveRecurringTemplateIds } from "@/lib/treasury/treasury-scheduled-payments";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const query = parseUpcomingObligationQuery(request);
    const inactiveRecurringTemplateIds = await loadInactiveRecurringTemplateIds(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId
    );
    const result = await plannedCashObligationUpcoming(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      query.withinDays,
      query.asOfDate ?? todayYmdUtc(),
      query.limit,
      inactiveRecurringTemplateIds
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
