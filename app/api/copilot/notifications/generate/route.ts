import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { generateOperationalNotificationsForWorkspace } from "@/lib/copilot-notifications/generate-operational-notifications";

export async function POST(request: NextRequest) {
  try {
    // Allow both user-authenticated requests and cron calls
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = request.headers.get("authorization") ?? "";
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    let tenantCompanyId: string;

    if (isCron) {
      const body = await request.json().catch(() => ({}));
      const id = typeof body.workspace_company_id === "string" ? body.workspace_company_id.trim() : "";
      if (!id) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION", message: "workspace_company_id requerido para llamadas de cron." },
          { status: 400 }
        );
      }
      tenantCompanyId = id;
    } else {
      const auth = await requireCopilotTenantContext(request);
      if (!auth.ok) return auth.response;
      tenantCompanyId = auth.ctx.tenantCompanyId;
    }

    const result = await generateOperationalNotificationsForWorkspace({
      workspaceCompanyId: tenantCompanyId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const e = err as Record<string, unknown> | null;
    if (e && (e.code === "PGRST106" || e.code === "42P01")) {
      return NextResponse.json({ ok: true, created: 0, skipped: 0, byType: {} });
    }
    console.error("[notifications/generate] unexpected error", err);
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
