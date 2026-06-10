/**
 * GET /api/copilot/decision-engine/forecast-calibration
 * Phase 5D — Forecast Calibration snapshot.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import { readPredictiveSnapshot } from "@/lib/data/decision-predictive-snapshot-repository";
import { computeForecastCalibration } from "@/lib/decision-engine/learning/forecast-calibration-engine";
import { PREDICTIVE_SNAPSHOT_TYPE } from "@/lib/decision-engine/predictive/predictive-orchestrator";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;

    const [bundle, predictiveRow] = await Promise.all([
      loadDecisionEngineBundle(supabase, tenantCompanyId).catch(() => null),
      readPredictiveSnapshot(supabase, tenantCompanyId, PREDICTIVE_SNAPSHOT_TYPE).catch(() => null),
    ]);

    if (!bundle) {
      return NextResponse.json(
        { ok: false as const, code: "NO_BUNDLE", message: "Sin datos del motor." },
        { status: 503 }
      );
    }

    const snapshot = computeForecastCalibration({
      bundle,
      analytics:        null,
      automationRuns:   [],
      automationActions: [],
      predictive:       predictiveRow?.payload ?? null,
      existingOutcomes: [],
      loadedAt:         new Date().toISOString(),
    });

    log.info("forecast_calibration_computed", {
      calibration_score: snapshot.calibration_score,
      data_source:       snapshot.data_source,
      segments:          snapshot.all_segments.length,
    });

    return NextResponse.json({ ok: true as const, data: snapshot });
  } catch (error) {
    log.error("forecast_calibration_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
