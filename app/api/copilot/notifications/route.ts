import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { listNotifications } from "@/lib/copilot-notifications/notification-service";

export const dynamic = "force-dynamic";

/** PostgREST / Postgres codes for errors that should return empty results, not 500. */
function isGracefulEmptyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  // Table / relation not found
  if (e.code === "PGRST106" || e.code === "42P01") return true;
  // Function not found (e.g. missing RLS helper)
  if (e.code === "42883") return true;
  // Permission denied / RLS violation
  if (e.code === "42501" || e.code === "PGRST301" || e.code === "PGRST302") return true;
  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    if (msg.includes("does not exist") || msg.includes("permission denied")) return true;
  }
  return false;
}

const EMPTY_RESULT = { ok: true, notifications: [], unreadCount: 0 } as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "hoy");
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
    if (isGracefulEmptyError(err)) {
      if (process.env.NODE_ENV !== "production") {
        const e = err as Record<string, unknown>;
        console.warn(`[notifications] DB error (${e.code ?? "unknown"}) — returning empty: ${e.message ?? err}`);
      }
      return NextResponse.json(EMPTY_RESULT);
    }
    console.error("[notifications] unexpected GET error:", err);
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
