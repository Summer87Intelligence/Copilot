/**
 * GET /api/copilot/decision-engine/recovery-likelihood?customer_id=
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  generatePredictiveSnapshot,
  getRecoveryLikelihoodForCustomer,
} from "@/lib/decision-engine/predictive/predictive-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const force = request.nextUrl.searchParams.get("force") === "true";
    const customerId = request.nextUrl.searchParams.get("customer_id")?.trim();

    if (force) {
      await generatePredictiveSnapshot(auth.ctx.supabase, auth.ctx.tenantCompanyId, { force: true }, log);
    }

    if (customerId) {
      const likelihood = await getRecoveryLikelihoodForCustomer(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        customerId
      );
      if (!likelihood) {
        return NextResponse.json(
          { ok: false as const, code: "NOT_FOUND", message: "Cliente no encontrado en snapshot predictivo" },
          { status: 404 }
        );
      }
      log.info("recovery_likelihood_computed", { customer_id: customerId });
      return NextResponse.json({ ok: true as const, likelihood });
    }

    const predictive = await generatePredictiveSnapshot(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      { force },
      log
    );

    return NextResponse.json({
      ok: true as const,
      recovery_likelihoods: predictive.recovery_likelihoods,
      cached: predictive.cached,
      generated_at: predictive.generated_at,
    });
  } catch (error) {
    log.error("recovery_likelihood_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
