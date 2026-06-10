import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { markAllNotificationsRead } from "@/lib/copilot-notifications/notification-service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "hoy");
    if (!auth.ok) return auth.response;

    const ok = await markAllNotificationsRead(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    return NextResponse.json({ ok });
  } catch (err: unknown) {
    const e = err as Record<string, unknown> | null;
    if (e && (e.code === "PGRST106" || e.code === "42P01")) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
