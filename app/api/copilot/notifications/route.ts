import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { listNotifications } from "@/lib/copilot-notifications/notification-service";

export const dynamic = "force-dynamic";

/** PostgREST / Postgres codes for "relation does not exist" */
function isTableNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (e.code === "PGRST106" || e.code === "42P01") return true;
  if (typeof e.message === "string" && e.message.includes("does not exist")) return true;
  return false;
}

const EMPTY_RESULT = { ok: true, notifications: [], unreadCount: 0 } as const;

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
  } catch (err: unknown) {
    if (isTableNotFoundError(err)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[notifications] copilot_notifications table not found — apply migration notif-01");
      }
      return NextResponse.json(EMPTY_RESULT);
    }
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
