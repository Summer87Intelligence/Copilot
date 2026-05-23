import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { markAllNotificationsRead } from "@/lib/copilot-notifications/notification-service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const ok = await markAllNotificationsRead(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
