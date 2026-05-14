import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  applyWorkflowMutation,
  buildOperationalWorkflows,
} from "@/lib/copilot-operational-workflows";
import type { WorkflowMutationInput } from "@/lib/copilot-operational-workflows-types";
import {
  OperationalEventRequestBuffer,
  recordWorkflowPatchEvents,
} from "@/lib/copilot-operational-events";
import { invalidateOperationalRuntime } from "@/lib/copilot-operational-runtime";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { buildCopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  getOperationalWorkflowById,
  mapOperationalWorkflowRow,
  updateOperationalWorkflowById,
} from "@/lib/data/operational-workflows-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

type RouteContext = { params: Promise<{ id: string }> };

function parseMutation(body: unknown): WorkflowMutationInput | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const action = value.action;
  if (typeof action !== "string") return null;
  if (
    action !== "complete_step" &&
    action !== "block" &&
    action !== "unblock" &&
    action !== "cancel" &&
    action !== "assign" &&
    action !== "block_step"
  ) {
    return null;
  }
  return {
    action,
    stepId: typeof value.stepId === "string" ? value.stepId : undefined,
    assignedTo:
      value.assigned_to === null || typeof value.assigned_to === "string"
        ? value.assigned_to
        : undefined,
    assignedUserId:
      value.assigned_user_id === null || typeof value.assigned_user_id === "string"
        ? value.assigned_user_id
        : undefined,
    ownerLabel:
      value.owner_label === null || typeof value.owner_label === "string"
        ? value.owner_label
        : undefined,
    blockedReason:
      value.blocked_reason === null || typeof value.blocked_reason === "string"
        ? value.blocked_reason
        : undefined,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  let log = copilotRequestLogger(request);
  const { id } = await context.params;
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = parseMutation(await request.json());
    if (!body) {
      return NextResponse.json(
        { ok: false as const, code: "VALIDATION", message: "Mutación inválida." },
        { status: 400 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const existingResult = await getOperationalWorkflowById(
      supabase,
      auth.ctx.tenantCompanyId,
      id
    );
    if (existingResult.error) {
      return NextResponse.json(
        { ok: false as const, code: "DB_ERROR", message: existingResult.error.message },
        { status: 500 }
      );
    }
    if (!existingResult.data) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", message: "Workflow no encontrado." },
        { status: 404 }
      );
    }

    const now = new Date();
    const existing = mapOperationalWorkflowRow(existingResult.data as Record<string, unknown>);
    const updated = applyWorkflowMutation(existing, body, now);
    const updateResult = await updateOperationalWorkflowById(
      supabase,
      auth.ctx.tenantCompanyId,
      id,
      updated
    );
    if (updateResult.error) {
      return NextResponse.json(
        { ok: false as const, code: "DB_ERROR", message: updateResult.error.message },
        { status: 500 }
      );
    }

    const persisted = updateResult.data
      ? mapOperationalWorkflowRow(updateResult.data as Record<string, unknown>)
      : updated;
    const eventBuffer = new OperationalEventRequestBuffer();
    await recordWorkflowPatchEvents(
      supabase,
      existing,
      persisted,
      body,
      {
        userId: auth.ctx.authUser.id,
        label: auth.ctx.appUser.full_name?.trim() || auth.ctx.appUser.email,
      },
      eventBuffer
    );

    invalidateOperationalRuntime({
      workspaceCompanyId: auth.ctx.tenantCompanyId,
      snapshot: true,
      workflows: true,
      timeline: true,
      reason: `workflow_${body.action}`,
    });

    const [snapshot, actionsResult] = await Promise.all([
      buildCopilotRutasSnapshot(supabase, auth.ctx.tenantCompanyId, now),
      listOperationalActions(supabase, auth.ctx.tenantCompanyId, 120),
    ]);
    const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
    const { response } = await buildOperationalWorkflows(
      supabase,
      {
        workspaceCompanyId: auth.ctx.tenantCompanyId,
        now,
        snapshot,
        actions,
      },
      { eventBuffer }
    );
    const workflow = response.workflows.find((row) => row.id === id) ?? persisted;

    return NextResponse.json({ ok: true as const, workflow, workflows: response.workflows });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "PATCH /api/copilot/operational-workflows/[id]",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", message },
      { status: 500 }
    );
  }
}
