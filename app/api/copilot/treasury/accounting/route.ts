import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { tmacList } from "@/lib/treasury/services/treasury-movement-accounting-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

/** GET /api/copilot/treasury/accounting?movement_ids=id1,id2,... */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const raw = request.nextUrl.searchParams.get("movement_ids");
    const movementIds = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const result = await tmacList(auth.ctx.supabase, auth.ctx.tenantCompanyId, movementIds);
    return nextResponseFromTreasuryCrud(result);
  } catch (err) {
    console.error("[treasury/accounting/GET]", err);
    return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
  }
}
