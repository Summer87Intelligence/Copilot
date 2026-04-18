import { NextRequest, NextResponse } from "next/server";

import {
  generateDecisionsForInitiatives,
  type InitiativeForDecision,
} from "@/lib/ai/decisionEngine";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  insertDecisions,
  selectDecisionInitiativeIdsForInitiatives,
  selectInitiativesForDecisionBatch,
  updateInitiativesProcessingStage,
} from "@/lib/data/engine-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

const BATCH_LIMIT = 20;

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { data: candidates, error: fetchError } =
      await selectInitiativesForDecisionBatch(auth.ctx.supabase, BATCH_LIMIT);

    if (fetchError) {
      log.error("copilot_decisions_generate_failed", fetchError, {
        operation: "selectInitiativesForDecisionBatch",
      });
      return NextResponse.json(
        { error: fetchError.message, processed: 0, decisionsCreated: 0 },
        { status: 500 }
      );
    }

    const rows = (candidates ?? []) as InitiativeForDecision[];
    if (rows.length === 0) {
      return NextResponse.json({
        processed: 0,
        decisionsCreated: 0,
      });
    }

    const ids = rows.map((r) => r.id);

    const { data: existingDecisions, error: decErr } =
      await selectDecisionInitiativeIdsForInitiatives(auth.ctx.supabase, ids);

    if (decErr) {
      log.error("copilot_decisions_generate_failed", decErr, {
        operation: "selectDecisionInitiativeIdsForInitiatives",
      });
      return NextResponse.json(
        { error: decErr.message, processed: 0, decisionsCreated: 0 },
        { status: 500 }
      );
    }

    const hasDecision = new Set(
      (existingDecisions ?? []).map((d) => d.initiative_id as string)
    );

    const eligible = rows.filter((r) => !hasDecision.has(r.id));
    if (eligible.length === 0) {
      return NextResponse.json({
        processed: 0,
        decisionsCreated: 0,
      });
    }

    const payloads = generateDecisionsForInitiatives(eligible);

    const insertRows = payloads.map((p) => ({
      initiative_id: p.initiative_id,
      decision_type: p.decision_type,
      recommended_channel: p.recommended_channel,
      priority_rank: p.priority_rank,
      confidence_score: p.confidence_score,
      suggested_message: p.suggested_message,
    }));

    const { data: inserted, error: insertError } = await insertDecisions(
      auth.ctx.supabase,
      insertRows
    );

    if (insertError) {
      log.error("copilot_decisions_generate_failed", insertError, {
        operation: "insertDecisions",
      });
      return NextResponse.json(
        { error: insertError.message, processed: 0, decisionsCreated: 0 },
        { status: 500 }
      );
    }

    const created = inserted?.length ?? 0;
    const processedIds = eligible.map((e) => e.id);

    const { error: updateError } = await updateInitiativesProcessingStage(
      auth.ctx.supabase,
      processedIds,
      "decision_made"
    );

    if (updateError) {
      log.warn("copilot_decisions_generate_stage_update_failed", {
        decisions_created: created,
      });
      log.error("copilot_decisions_generate_failed", updateError, {
        operation: "updateInitiativesProcessingStage",
      });
      return NextResponse.json(
        {
          error: updateError.message,
          processed: 0,
          decisionsCreated: created,
          warning:
            "Decisiones insertadas pero no se pudo actualizar processing_stage.",
        },
        { status: 500 }
      );
    }

    log.info("copilot_decisions_generated", {
      processed: processedIds.length,
      decisions_created: created,
    });
    return NextResponse.json({
      processed: processedIds.length,
      decisionsCreated: created,
    });
  } catch (e) {
    log.error("copilot_request_unhandled", e, {
      route: "POST /api/copilot/decisions/generate",
    });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, processed: 0, decisionsCreated: 0 },
      { status: 500 }
    );
  }
}
