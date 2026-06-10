import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadCashStatusAmountRows } from "@/lib/data/proto-analytics-read-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

/**
 * GET /api/copilot/cash-status-amounts
 * Filas `amount` de recibos y pagos con tenant obligatorio (misma política que insight-engine-dataset).
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", {
        phase: "require_copilot_tenant_cash_status_amounts",
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

    const { inflows, outflows } = await loadCashStatusAmountRows(
      supabaseForData,
      tenantCompanyId
    );

    return NextResponse.json({
      ok: true as const,
      data: { inflows, outflows },
    });
  } catch (e) {
    log.error("copilot_cash_status_amounts_failed", e, {
      route: "GET /api/copilot/cash-status-amounts",
    });
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
