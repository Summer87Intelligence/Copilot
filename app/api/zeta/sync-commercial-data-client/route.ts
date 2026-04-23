import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { syncZetaCommercialDataClient } from "@/lib/integrations/zeta/zeta-commercial-data-client-pipeline";

/**
 * POST /api/zeta/sync-commercial-data-client
 * Enriquece `proto_companies.zeta_metadata.commercial_client_v1` desde Zeta (Query datos comerciales).
 */
export async function POST(request: NextRequest) {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth.response;

  const tenantId = auth.ctx.tenantCompanyId?.trim();
  if (!tenantId) {
    return NextResponse.json(
      {
        success: false,
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
        duration_ms: 0,
      },
      { status: 403 }
    );
  }

  const requestId = globalThis.crypto?.randomUUID?.() ?? `sync-commercial-${Date.now()}`;

  const outcome = await syncZetaCommercialDataClient({
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
      processed: outcome.processed,
      updated: outcome.updated,
      skipped: outcome.skipped,
      errors: outcome.errors,
      duration_ms: outcome.duration_ms,
    },
    { status }
  );
}
