import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadPredictiveFinancialAlertsDatasetRows } from "@/lib/data/proto-analytics-read-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

/**
 * GET /api/copilot/predictive-financial-dataset
 * Lecturas paralelas para alertas predictivas (tenant-scoped).
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "finanzas");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", {
        phase: "require_copilot_tenant_predictive_financial_dataset",
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
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const data = await loadPredictiveFinancialAlertsDatasetRows(
      supabase,
      tenantCompanyId
    );
    return NextResponse.json({ ok: true as const, data });
  } catch (e) {
    log.error("copilot_predictive_financial_dataset_failed", e, {
      route: "GET /api/copilot/predictive-financial-dataset",
    });
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
