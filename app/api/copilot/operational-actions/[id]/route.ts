import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { operationalActionPatchBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { patchOperationalAction } from "@/lib/copilot-operational-actions-service";
import { invalidateOperationalRuntime } from "@/lib/copilot-operational-runtime";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

type RouteContext = { params: Promise<{ id: string }> };

function actorFromContext(ctx: {
  authUser: { id: string };
  appUser: { full_name: string; email: string };
}) {
  return {
    id: ctx.authUser.id,
    label: ctx.appUser.full_name?.trim() || ctx.appUser.email,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  let log = copilotRequestLogger(request);
  const { id } = await context.params;
  const validated = await parseAndValidateJsonBody(
    request,
    operationalActionPatchBodySchema
  );
  if (!validated.ok) return validated.response;

  try {
    const auth = await requireCopilotModuleWriteAccess(request, "acciones", validated.data);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = validated.data;
    const result = await patchOperationalAction(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      {
        operationalStatus: body.operational_status,
        assignedTo: body.assigned_to,
        ownerId: body.owner_id,
        dueAt: body.due_at,
        resolutionNotes: body.resolution_notes,
        summary: body.summary,
      },
      actorFromContext(auth.ctx)
    );

    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 500;
      if (status === 500) {
        return copilotInternalErrorResponse();
      }
      return NextResponse.json({ error: result.message }, { status });
    }

    invalidateOperationalRuntime({
      workspaceCompanyId: auth.ctx.tenantCompanyId,
      snapshot: true,
      timeline: true,
      reason: "action_patch",
    });

    return NextResponse.json({ action: result.data, message: result.message });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "PATCH /api/copilot/operational-actions/[id]",
    });
    return copilotInternalErrorResponse({});
  }
}
