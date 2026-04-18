import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { computeCopilotRealInsights } from "@/lib/copilot-real-insights";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

/**
 * GET /api/copilot/real-insights
 * Insights calculados en vivo desde proto_companies, proto_invoices, proto_tax_obligations y snapshot financiero.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const insights = await computeCopilotRealInsights(auth.ctx.supabase);
    return NextResponse.json({
      insights,
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    log.error("copilot_real_insights_failed", e, { route: "GET /api/copilot/real-insights" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message, insights: [] }, { status: 500 });
  }
}
