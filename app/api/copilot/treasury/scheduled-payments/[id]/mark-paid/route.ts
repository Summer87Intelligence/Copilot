import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";
import { markScheduledPaymentAsPaid } from "@/lib/treasury/treasury-scheduled-payments";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const result = await markScheduledPaymentAsPaid(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
