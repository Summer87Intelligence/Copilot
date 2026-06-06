import { NextRequest, NextResponse } from "next/server";

import type { OutcomeRow, OutcomeTypeValue } from "@/lib/ai/outcome-types";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { copilotOutcomePostBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  deleteOutcomeById,
  insertOutcome,
  selectActionIdAndInitiative,
  selectOutcomeIdByActionId,
  updateActionExecutionStatus,
} from "@/lib/data/engine-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

function categoryForOutcomeType(t: OutcomeTypeValue): string {
  switch (t) {
    case "no_response":
      return "negative";
    case "response":
      return "engagement";
    case "meeting":
      return "advancement";
    case "sale":
      return "revenue";
    default:
      return "other";
  }
}

function executionStatusForOutcome(t: OutcomeTypeValue): "executed" | "failed" {
  return t === "no_response" ? "failed" : "executed";
}

function mapOutcomeRow(row: Record<string, unknown>): OutcomeRow {
  const rev = row.revenue_amount;
  return {
    id: String(row.id),
    action_id: String(row.action_id),
    initiative_id: String(row.initiative_id),
    outcome_type: String(row.outcome_type),
    outcome_category: String(row.outcome_category),
    revenue_amount:
      rev === null || rev === undefined
        ? null
        : typeof rev === "number"
          ? rev
          : Number(rev),
    notes: row.notes != null ? String(row.notes) : null,
    after_note: row.after_note != null ? String(row.after_note) : null,
    created_at: String(row.created_at),
  };
}

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);

  const validated = await parseAndValidateJsonBody(
    request,
    copilotOutcomePostBodySchema
  );
  if (!validated.ok) {
    return validated.response;
  }
  const body = validated.data;

  try {
    const auth = await requireCopilotTenantContext(request, body);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const actionId = body.action_id;
    const initiativeId = body.initiative_id;
    const outcomeType = body.outcome_type;

    const { data: existing, error: exErr } = await selectOutcomeIdByActionId(
      auth.ctx.supabase,
      actionId
    );

    if (exErr) {
      log.error("copilot_engine_query_failed", exErr, {
        operation: "selectOutcomeIdByActionId",
      });
      return copilotInternalErrorResponse();
    }
    if (existing) {
      log.warn("copilot_outcome_conflict", { reason: "outcome_exists_for_action" });
      return NextResponse.json(
        { error: "Ya existe un resultado para esta acción." },
        { status: 409 }
      );
    }

    const { data: actionRow, error: actErr } = await selectActionIdAndInitiative(
      auth.ctx.supabase,
      actionId
    );

    if (actErr) {
      log.error("copilot_engine_query_failed", actErr, {
        operation: "selectActionIdAndInitiative",
      });
      return copilotInternalErrorResponse();
    }
    if (!actionRow) {
      log.warn("copilot_outcome_not_found", { reason: "action_not_found" });
      return NextResponse.json({ error: "Acción no encontrada." }, { status: 404 });
    }
    if (String(actionRow.initiative_id) !== initiativeId) {
      log.warn("copilot_outcome_validation_failed", {
        reason: "initiative_mismatch",
      });
      return NextResponse.json(
        { error: "initiative_id no coincide con la acción." },
        { status: 400 }
      );
    }

    let revenue: number | null = null;
    if (body.revenue_amount !== undefined && body.revenue_amount !== null) {
      const n = Number(body.revenue_amount);
      if (Number.isFinite(n)) {
        revenue = n;
      }
    }
    if (outcomeType === "sale" && revenue === null) {
      revenue = 0;
    }

    const notes =
      typeof body.notes === "string" && body.notes.trim() !== ""
        ? body.notes.trim()
        : null;

    const afterNote =
      typeof body.after_note === "string" && body.after_note.trim() !== ""
        ? body.after_note.trim()
        : null;

    const insertPayload = {
      action_id: actionId,
      initiative_id: initiativeId,
      outcome_type: outcomeType,
      outcome_category: categoryForOutcomeType(outcomeType),
      revenue_amount: revenue,
      notes,
      after_note: afterNote,
    };

    const { data: inserted, error: insErr } = await insertOutcome(
      auth.ctx.supabase,
      insertPayload
    );

    if (insErr) {
      if (
        insErr.code === "23505" ||
        insErr.message?.toLowerCase().includes("unique")
      ) {
        log.warn("copilot_outcome_conflict", { reason: "unique_violation" });
        return NextResponse.json(
          { error: "Ya existe un resultado para esta acción." },
          { status: 409 }
        );
      }
      log.error("copilot_outcome_insert_failed", insErr, {
        operation: "insertOutcome",
      });
      return copilotInternalErrorResponse();
    }

    const newStatus = executionStatusForOutcome(outcomeType);
    const insertedId = String((inserted as Record<string, unknown>).id);

    const { error: updErr } = await updateActionExecutionStatus(
      auth.ctx.supabase,
      actionId,
      newStatus
    );

    if (updErr) {
      await deleteOutcomeById(auth.ctx.supabase, insertedId);
      log.error("copilot_outcome_action_update_failed", updErr, {
        operation: "updateActionExecutionStatus",
        outcome_id: insertedId,
      });
      return copilotInternalErrorResponse();
    }

    const outcome = mapOutcomeRow(inserted as Record<string, unknown>);
    log.info("copilot_outcome_created", {
      outcome_id: outcome.id,
      outcome_type: outcome.outcome_type,
      action_id: actionId,
      initiative_id: initiativeId,
    });
    return NextResponse.json({ outcome });
  } catch (e) {
    log.error("copilot_request_unhandled", e, { route: "POST /api/copilot/outcomes" });
    return copilotInternalErrorResponse({});
  }
}
