import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { getAllPipelineHealth } from "@/lib/data/zeta-pipeline-health";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

/**
 * GET /api/copilot/pipeline-health
 * Devuelve el resumen de salud de los 3 pipelines Zeta (saldos, vouchers, contactos).
 * Solo lectura — no modifica ningún estado.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "pipeline_health" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase =
      !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const data = await getAllPipelineHealth(supabase);
    return NextResponse.json({ ok: true as const, data });
  } catch (e) {
    log.error("pipeline_health_failed", e, {
      route: "GET /api/copilot/pipeline-health",
    });
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
