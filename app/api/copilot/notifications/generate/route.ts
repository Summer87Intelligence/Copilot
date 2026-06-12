import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { generateOperationalNotificationsForWorkspace } from "@/lib/copilot-notifications/generate-operational-notifications";
import {
  recordGenerationRun,
  shouldThrottleGeneration,
} from "@/lib/copilot-notifications/generation-throttle";

/**
 * POST /api/copilot/notifications/generate
 *
 * Genera notificaciones operacionales para el tenant del solicitante.
 * Side-effect del sistema (no es una escritura del usuario), por eso solo
 * exige sesión válida del tenant — incluye roles read-only. Para multi-tenant
 * y read-only-only-tenants existe además el cron
 * `/api/cron/notifications-generate-all-tenants` que itera todos los workspaces.
 *
 * Idempotente: cada emit usa dedup_key. Throttle in-memory por instancia
 * para evitar disparos repetidos (no es boundary de seguridad).
 */
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
      // Cualquier usuario autenticado del tenant puede dispararlo (incluye read-only).
      // La generación es side-effect del sistema, no una escritura del usuario.
      const auth = await requireCopilotTenantContext(request);
      if (!auth.ok) return auth.response;
      tenantCompanyId = auth.ctx.tenantCompanyId;
    }

    // Best-effort in-memory throttle — cron bypasses this.
    // Prevents accidental spam from double-clicks or stuck retry loops within
    // a single warm serverless instance. Not a security boundary.
    if (!isCron && shouldThrottleGeneration(tenantCompanyId)) {
      return NextResponse.json({ ok: true, created: 0, skipped: 0, byType: {}, throttled: true, reason: "too_soon" });
    }

    const result = await generateOperationalNotificationsForWorkspace({
      workspaceCompanyId: tenantCompanyId,
    });

    if (!isCron) recordGenerationRun(tenantCompanyId);

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
