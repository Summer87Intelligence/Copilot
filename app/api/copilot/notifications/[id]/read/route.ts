import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { markNotificationRead } from "@/lib/copilot-notifications/notification-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id de la notificación." },
        { status: 400 }
      );
    }

    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const ok = await markNotificationRead(auth.ctx.supabase, auth.ctx.tenantCompanyId, id);
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
