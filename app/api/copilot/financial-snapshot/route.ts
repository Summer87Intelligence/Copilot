import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { getFinancialSnapshotForApi } from "@/lib/copilot-financial-engine";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

/**
 * GET /api/copilot/financial-snapshot
 * Snapshot financiero tenant-scoped (sin Supabase directo en el browser).
 *
 * Transición v1: `data` incluye KPI legacy (deprecados) y el contrato canónico
 * (`metrics_schema_version`, `as_of_date`, `meta`, `realized`, `expected`, `projected`, `diagnostics`).
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant_financial_snapshot" });
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

    const data = await getFinancialSnapshotForApi(supabase, tenantCompanyId);
    return NextResponse.json({ ok: true as const, data });
  } catch (e) {
    log.error("copilot_financial_snapshot_failed", e, {
      route: "GET /api/copilot/financial-snapshot",
    });
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
