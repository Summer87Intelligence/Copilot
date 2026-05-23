import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { listNotifications } from "@/lib/copilot-notifications/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
    const unreadOnly = url.searchParams.get("unread_only") === "true";

    const result = await listNotifications(auth.ctx.supabase, auth.ctx.tenantCompanyId, {
      limit,
      unreadOnly,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
