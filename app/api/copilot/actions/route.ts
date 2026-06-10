import { NextRequest, NextResponse } from "next/server";

import type {
  ActionListItem,
  ActionOutcomeSummary,
  ActionPayloadJson,
} from "@/lib/ai/action-types";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  selectActionsOrdered,
  selectInitiativeCompanyNamesByIds,
  selectOutcomesByActionIds,
} from "@/lib/data/engine-repository";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

function mapOutcomeRow(row: Record<string, unknown>): ActionOutcomeSummary {
  const rev = row.revenue_amount;
  return {
    id: String(row.id),
    outcome_type: String(row.outcome_type),
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

function mapRow(
  row: Record<string, unknown>,
  companyByInitiative: Map<string, string | null>,
  outcomeByActionId: Map<string, ActionOutcomeSummary>
): ActionListItem {
  const initiativeId = String(row.initiative_id);
  const id = String(row.id);
  const updatedRaw = row.updated_at ?? row.created_at;
  return {
    id,
    decision_id: String(row.decision_id),
    initiative_id: initiativeId,
    action_type: String(row.action_type),
    channel: String(row.channel),
    execution_status: String(row.execution_status),
    action_payload: (row.action_payload ?? {
      suggested_message: "",
    }) as ActionPayloadJson,
    created_at: String(row.created_at),
    assignee_name:
      row.assignee_name != null && String(row.assignee_name).trim() !== ""
        ? String(row.assignee_name)
        : null,
    expected_result:
      row.expected_result != null && String(row.expected_result).trim() !== ""
        ? String(row.expected_result)
        : null,
    before_note:
      row.before_note != null && String(row.before_note).trim() !== ""
        ? String(row.before_note)
        : null,
    updated_at: String(updatedRaw),
    outcome: outcomeByActionId.get(id) ?? null,
    company_name: companyByInitiative.get(initiativeId) ?? null,
  };
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "acciones");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      200,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 80 : 80)
    );

    const { data: rows, error } = await selectActionsOrdered(auth.ctx.supabase, limit);

    if (error) {
      log.error("copilot_engine_query_failed", error, {
        operation: "selectActionsOrdered",
        limit,
      });
      return copilotInternalErrorResponse({ actions: [] as ActionListItem[] });
    }

    const list = rows ?? [];
    const actionIds = list.map((r) => String(r.id));
    const outcomeByActionId = new Map<string, ActionOutcomeSummary>();
    if (actionIds.length > 0) {
      const { data: outcomeRows, error: ocErr } = await selectOutcomesByActionIds(
        auth.ctx.supabase,
        actionIds
      );
      if (ocErr) {
        log.error("copilot_engine_query_failed", ocErr, {
          operation: "selectOutcomesByActionIds",
        });
      } else {
        for (const r of outcomeRows ?? []) {
          const aid = String((r as Record<string, unknown>).action_id);
          outcomeByActionId.set(aid, mapOutcomeRow(r as Record<string, unknown>));
        }
      }
    }

    const initiativeIds = [
      ...new Set(list.map((r) => String(r.initiative_id))),
    ];

    const companyByInitiative = new Map<string, string | null>();
    if (initiativeIds.length > 0) {
      const { data: inits, error: initErr } =
        await selectInitiativeCompanyNamesByIds(auth.ctx.supabase, initiativeIds);

      if (initErr) {
        log.error("copilot_engine_query_failed", initErr, {
          operation: "selectInitiativeCompanyNamesByIds",
        });
      }

      if (!initErr && inits) {
        for (const i of inits) {
          companyByInitiative.set(
            String(i.id),
            i.company_name != null ? String(i.company_name) : null
          );
        }
      }
    }

    const actions: ActionListItem[] = list.map((r) =>
      mapRow(r as Record<string, unknown>, companyByInitiative, outcomeByActionId)
    );

    return NextResponse.json({ actions });
  } catch (e) {
    log.error("copilot_request_unhandled", e, { route: "GET /api/copilot/actions" });
    return copilotInternalErrorResponse({ actions: [] as ActionListItem[] });
  }
}
