import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadInsightEngineProtoRows } from "@/lib/data/proto-analytics-read-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

/**
 * GET /api/copilot/insight-engine-dataset
 * Lotes acotados para el motor de insights: tenant obligatorio y cliente acorde a sesión (JWT o service role).
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", {
        phase: "require_copilot_tenant_insight_engine_dataset",
      });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabaseForData =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const batch = await loadInsightEngineProtoRows(supabaseForData, tenantCompanyId);

    return NextResponse.json({
      ok: true as const,
      data: {
        invoices: batch.invoices,
        payments: batch.payments,
        companies: batch.companies,
      },
    });
  } catch (e) {
    log.error("copilot_insight_engine_dataset_failed", e, {
      route: "GET /api/copilot/insight-engine-dataset",
    });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", error: message },
      { status: 500 }
    );
  }
}
