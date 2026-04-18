import { NextRequest, NextResponse } from "next/server";

import { generateActionsFromDecisions } from "@/lib/ai/actionEngine";
import type { DecisionInputForAction } from "@/lib/ai/actionEngine";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  insertActions,
  selectActionDecisionIdsForDecisions,
  selectDecisionsForActionGeneration,
} from "@/lib/data/engine-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

const SCAN_LIMIT = 80;
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

    const { data: decisions, error: decError } =
      await selectDecisionsForActionGeneration(auth.ctx.supabase, SCAN_LIMIT);

    if (decError) {
      log.error("copilot_actions_generate_failed", decError, {
        operation: "selectDecisionsForActionGeneration",
      });
      return NextResponse.json(
        { error: decError.message, processed: 0, actionsCreated: 0 },
        { status: 500 }
      );
    }

    const decRows = (decisions ?? []) as DecisionInputForAction[];
    if (decRows.length === 0) {
      return NextResponse.json({ processed: 0, actionsCreated: 0 });
    }

    const decisionIds = decRows.map((d) => d.id);

    const { data: existingActions, error: actErr } =
      await selectActionDecisionIdsForDecisions(auth.ctx.supabase, decisionIds);

    if (actErr) {
      log.error("copilot_actions_generate_failed", actErr, {
        operation: "selectActionDecisionIdsForDecisions",
      });
      return NextResponse.json(
        { error: actErr.message, processed: 0, actionsCreated: 0 },
        { status: 500 }
      );
    }

    const hasAction = new Set(
      (existingActions ?? []).map((r) => r.decision_id as string)
    );

    const pending = decRows
      .filter((d) => !hasAction.has(d.id))
      .slice(0, BATCH_LIMIT);

    if (pending.length === 0) {
      return NextResponse.json({ processed: 0, actionsCreated: 0 });
    }

    const toInsert = generateActionsFromDecisions(pending);

    const { data: inserted, error: insertError } = await insertActions(
      auth.ctx.supabase,
      toInsert
    );

    if (insertError) {
      log.error("copilot_actions_generate_failed", insertError, {
        operation: "insertActions",
      });
      return NextResponse.json(
        { error: insertError.message, processed: 0, actionsCreated: 0 },
        { status: 500 }
      );
    }

    const created = inserted?.length ?? 0;

    log.info("copilot_actions_generated", {
      processed: pending.length,
      actions_created: created,
    });
    return NextResponse.json({
      processed: pending.length,
      actionsCreated: created,
    });
  } catch (e) {
    log.error("copilot_request_unhandled", e, {
      route: "POST /api/copilot/actions/generate",
    });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, processed: 0, actionsCreated: 0 },
      { status: 500 }
    );
  }
}
