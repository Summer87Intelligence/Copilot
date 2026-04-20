import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { runFinancialDatasetValidation } from "@/lib/copilot-financial-context-validation";
import { getFinancialSnapshot, type FinancialSnapshot } from "@/lib/copilot-financial-engine";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

/**
 * GET /api/copilot/rutas-hub
 * Snapshot financiero + cartera para el hub de rutas, con el mismo cliente/tenant que real-insights.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant_rutas_hub" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      log.warn("copilot_tenant_empty", { phase: "rutas_hub" });
      return NextResponse.json(
        {
          ok: false as const,
          code: "FORBIDDEN_TENANT",
          error: "Espacio de trabajo sin identificador válido.",
          snapshot: null,
          portfolio: null,
          computedAt: new Date().toISOString(),
        },
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

    const gate = await runFinancialDatasetValidation(supabaseForData, tenantCompanyId);

    let snapshot: FinancialSnapshot | null = null;
    let portfolio: ClientPortfolioLoad | null = null;
    try {
      [snapshot, portfolio] = await Promise.all([
        getFinancialSnapshot(supabaseForData, tenantCompanyId),
        getClientPortfolio(supabaseForData, tenantCompanyId),
      ]);
    } catch (e) {
      log.error("copilot_rutas_hub_compute_failed", e, {
        route: "GET /api/copilot/rutas-hub",
      });
    }

    const computedAt = new Date().toISOString();

    return NextResponse.json({
      ok: true as const,
      data: { snapshot, portfolio },
      snapshot,
      portfolio,
      validation_report: gate.validation_report,
      confidence: gate.confidence,
      coverage: gate.coverage,
      blocked_reasons: gate.blocked_reasons,
      recommendations_enabled: gate.recommendations_enabled,
      computedAt,
    });
  } catch (e) {
    log.error("copilot_rutas_hub_failed", e, { route: "GET /api/copilot/rutas-hub" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      {
        ok: false as const,
        code: "UNEXPECTED",
        error: message,
        snapshot: null,
        portfolio: null,
        computedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
