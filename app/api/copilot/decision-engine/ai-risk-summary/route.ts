/**
 * GET /api/copilot/decision-engine/ai-risk-summary?customer_id=
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { buildRiskSummaryForCustomer } from "@/lib/decision-engine/ai/ai-intelligence-orchestrator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const customerId = request.nextUrl.searchParams.get("customer_id")?.trim();
    if (!customerId) {
      return NextResponse.json(
        { ok: false as const, code: "INVALID_QUERY", message: "customer_id es obligatorio" },
        { status: 400 }
      );
    }

    const summary = await buildRiskSummaryForCustomer(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      customerId
    );

    if (!summary) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", message: "Cliente no encontrado en cola operativa" },
        { status: 404 }
      );
    }

    log?.info("ai_priority_explained", { customer_id: customerId });

    return NextResponse.json({ ok: true as const, ...summary });
  } catch (error) {
    log.error("ai_risk_summary_route_failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false as const, code: "UNEXPECTED", message }, { status: 500 });
  }
}
