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

  const outcome = await syncZetaContactsIncremental({
    supabase: auth.ctx.supabase,
    workspaceCompanyId: tenantId,
    ctx: {
      requestId,
      tenantId,
    },
  });

  const status = outcome.success ? 200 : outcome.errors > 0 ? 502 : 500;

  return NextResponse.json(
    {
      success: outcome.success,
      synced: outcome.synced,
      errors: outcome.errors,
      duration_ms: outcome.duration_ms,
    },
    { status }
  );
}
