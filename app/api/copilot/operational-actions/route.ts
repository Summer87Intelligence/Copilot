import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { operationalActionCreateBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  createOperationalAction,
  listOperationalActions,
  summarizeOperationalQueue,
  summarizeOperationalSla,
} from "@/lib/copilot-operational-actions-service";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

function actorFromContext(ctx: {
  authUser: { id: string };
  appUser: { full_name: string; email: string };
}) {
  return {
    id: ctx.authUser.id,
    label: ctx.appUser.full_name?.trim() || ctx.appUser.email,
  };
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
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

    const result = await listOperationalActions(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      limit
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, actions: [], summary: summarizeOperationalQueue([]), sla_summary: summarizeOperationalSla([]) },
        { status: result.code === "DATABASE" ? 500 : 400 }
      );
    }

    return NextResponse.json({
      actions: result.data,
      summary: summarizeOperationalQueue(result.data),
      sla_summary: summarizeOperationalSla(result.data),
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-actions",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: message, actions: [], summary: summarizeOperationalQueue([]), sla_summary: summarizeOperationalSla([]) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const validated = await parseAndValidateJsonBody(
    request,
    operationalActionCreateBodySchema
  );
  if (!validated.ok) return validated.response;

  try {
    const auth = await requireCopilotTenantContext(request, validated.data);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = validated.data;
    const result = await createOperationalAction(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      {
        origin: body.origin,
        actionType: body.action_type,
        priority: body.priority,
        title: body.title,
        summary: body.summary ?? null,
        relatedEntityType: body.related_entity_type ?? null,
        relatedEntityId: body.related_entity_id ?? null,
        context: body.context,
        metadata: body.metadata,
        dueAt: body.due_at ?? null,
        assignedTo: body.assigned_to ?? null,
        ownerId: body.owner_id ?? null,
      },
      actorFromContext(auth.ctx)
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json({ action: result.data, message: result.message });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "POST /api/copilot/operational-actions",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
