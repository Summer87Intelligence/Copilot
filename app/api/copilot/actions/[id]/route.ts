import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { copilotActionPatchBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { updateActionLoopFields } from "@/lib/data/engine-repository";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/copilot/actions/:id
 * LOOP-01 — actualizar seguimiento (responsable, resultado esperado, nota “antes”).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  let log = copilotRequestLogger(request);
  const { id: actionId } = await context.params;

  const validated = await parseAndValidateJsonBody(
    request,
    copilotActionPatchBodySchema
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

    const patch: {
      assignee_name?: string | null;
      expected_result?: string | null;
      before_note?: string | null;
    } = {};
    if (body.assignee_name !== undefined) patch.assignee_name = body.assignee_name;
    if (body.expected_result !== undefined) patch.expected_result = body.expected_result;
    if (body.before_note !== undefined) patch.before_note = body.before_note;

    const { data: updatedRow, error } = await updateActionLoopFields(
      auth.ctx.supabase,
      actionId,
      patch
    );

    if (error) {
      log.error("copilot_action_loop_patch_failed", error, {
        operation: "updateActionLoopFields",
        action_id: actionId,
      });
      return copilotInternalErrorResponse();
    }
    if (!updatedRow) {
      log.warn("copilot_action_loop_not_found", { action_id: actionId });
      return NextResponse.json(
        { error: "Acción no encontrada o sin acceso." },
        { status: 404 }
      );
    }

    log.info("copilot_action_loop_updated", {
      action_id: actionId,
      fields: Object.keys(patch),
    });
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    log.error("copilot_request_unhandled", e, {
      route: "PATCH /api/copilot/actions/[id]",
    });
    return copilotInternalErrorResponse({});
  }
}
