/**
 * POST /api/copilot/decision-engine/detect-outcomes
 * Phase 5D — Detect and optionally persist learning outcomes.
 * Body: { dry_run?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import type { DEFollowUpRow } from "@/lib/decision-engine/de-types";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import {
  insertLearningOutcomes,
  readLearningOutcomes,
} from "@/lib/data/decision-learning-repository";
import { detectOutcomes } from "@/lib/decision-engine/learning/outcome-detection-engine";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleWriteAccess(request, "acciones");
    if (!auth.ok) return auth.response;
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;

    const body = await request.json().catch(() => ({})) as { dry_run?: boolean };
    const dryRun = body.dry_run === true;

    // 1. Load data
    const [bundle, existingOutcomes] = await Promise.all([
      loadDecisionEngineBundle(supabase, tenantCompanyId),
      readLearningOutcomes(supabase, tenantCompanyId).catch(() => []),
    ]);

    // 2. Detect
    const result = detectOutcomes({
      recentReceipts:   bundle.recentReceipts,
      recentActions:    bundle.recentActions,
      operationalStates: bundle.operationalStates,
      completedFollowUps: bundle.pendingFollowUps.filter((f: DEFollowUpRow) => f.status === "completed"),
      existingOutcomes,
      workspaceCompanyId: tenantCompanyId,
      nowIso:            new Date().toISOString(),
    });

    // 3. Persist (unless dry_run)
    let insertedCount = 0;
    let duplicatesCount = 0;
    if (!dryRun && result.detected.length > 0) {
      const insertResult = await insertLearningOutcomes(
        supabase,
        tenantCompanyId,
        result.detected
      );
      insertedCount   = insertResult.inserted;
      duplicatesCount = insertResult.duplicates;
    }

    log.info("detect_outcomes_completed", {
      detected:           result.detected.length,
      inserted:           insertedCount,
      duplicates:         duplicatesCount,
      skipped_in_run:     result.skipped_duplicate_count,
      sources_evaluated:  result.sources_evaluated,
      dry_run:            dryRun,
    });

    return NextResponse.json({
      ok:                 true as const,
      detected:           result.detected,
      detected_count:     result.detected.length,
      inserted_count:     insertedCount,
      duplicate_count:    duplicatesCount,
      sources_evaluated:  result.sources_evaluated,
      dry_run:            dryRun,
    });
  } catch (error) {
    log.error("detect_outcomes_route_failed", error);
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
