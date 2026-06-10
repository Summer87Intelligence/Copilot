import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { treasuryCashPositionGet } from "@/lib/treasury/services/treasury-cash-opening-balance-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const result = await treasuryCashPositionGet(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId
    );
    if (!result.ok) {
      console.error("[cash-position] treasuryCashPositionGet failed:", result);
    }
    return nextResponseFromTreasuryCrud(result);
  } catch (err) {
    console.error("[cash-position] unexpected error:", err);
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
