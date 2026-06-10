/**
 * GET /api/copilot/decision-engine/predictive
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { readPredictiveSnapshot } from "@/lib/data/decision-predictive-snapshot-repository";
import {
  generatePredictiveSnapshot,
  PREDICTIVE_SNAPSHOT_TYPE,
} from "@/lib/decision-engine/predictive/predictive-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const force = request.nextUrl.searchParams.get("force") === "true";
    const predictive = await generatePredictiveSnapshot(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      { force },
      log
    );
    const snapshot = await readPredictiveSnapshot(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      PREDICTIVE_SNAPSHOT_TYPE
    );

    return NextResponse.json({
      ok: true as const,
      predictive,
      cached: predictive.cached,
      generated_at: predictive.generated_at,
      expires_at: snapshot?.expires_at ?? predictive.expires_at,
    });
  } catch (error) {
    log.error("predictive_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
