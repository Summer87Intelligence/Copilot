import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { getClientPortfolio, type ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

/**
 * GET /api/copilot/portfolio
 * Cartera comercial (proto_companies + facturas/recibos/contactos) con el mismo cliente/tenant
 * que rutas-hub: JWT + RLS o service role (PIN) con acotación por workspace.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant_portfolio" });
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

    const portfolio: ClientPortfolioLoad = await getClientPortfolio(
      supabaseForData,
      tenantCompanyId
    );

    return NextResponse.json({
      ok: true as const,
      portfolio,
    });
  } catch (e) {
    log.error("copilot_portfolio_failed", e, { route: "GET /api/copilot/portfolio" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", error: message },
      { status: 500 }
    );
  }
}
