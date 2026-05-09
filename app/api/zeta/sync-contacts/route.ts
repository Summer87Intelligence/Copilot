import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { syncZetaContactsIncremental } from "@/lib/integrations/zeta/zeta-contacts-pipeline";

/**
 * POST /api/zeta/sync-contacts
 * Ejecuta sync paginado Zeta → proto_contacts con trazabilidad en zeta_sync_*.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth.response;

  const tenantId = auth.ctx.tenantCompanyId?.trim();
  if (!tenantId) {
    return NextResponse.json(
      {
        success: false,
        synced: 0,
        errors: 1,
        duration_ms: 0,
        message: "Falta tenant en el contexto de sesión.",
      },
      { status: 403 }
    );
  }

  const requestId = globalThis.crypto?.randomUUID?.() ?? `sync-contacts-${Date.now()}`;
  const routeStarted = Date.now();

  console.info("[sync-contacts] start", { requestId, tenantId });

  try {
    const outcome = await syncZetaContactsIncremental({
      supabase: auth.ctx.supabase,
      workspaceCompanyId: tenantId,
      ctx: { requestId, tenantId },
    });

    const duration = Date.now() - routeStarted;
    console.info("[sync-contacts] outcome", {
      requestId,
      tenantId,
      success: outcome.success,
      synced: outcome.synced,
      errors: outcome.errors,
      duration_ms: duration,
      message: outcome.message ?? null,
    });

    const status = outcome.success ? 200 : outcome.errors > 0 ? 502 : 500;

    return NextResponse.json(
      {
        success: outcome.success,
        synced: outcome.synced,
        errors: outcome.errors,
        duration_ms: outcome.duration_ms,
        message: outcome.message ?? null,
      },
      { status }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[sync-contacts] unhandled exception", {
      requestId,
      tenantId,
      error: msg,
      stack,
    });
    return NextResponse.json(
      {
        success: false,
        synced: 0,
        errors: 1,
        duration_ms: Date.now() - routeStarted,
        message: `Error interno: ${msg}`,
      },
      { status: 500 }
    );
  }
}
