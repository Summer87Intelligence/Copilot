import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { buildOperationalWorkflows } from "@/lib/copilot-operational-workflows";
import { OperationalEventRequestBuffer } from "@/lib/copilot-operational-events";
import { invalidateOperationalRuntime } from "@/lib/copilot-operational-runtime";
import { buildCopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const now = new Date();
    const [snapshot, actionsResult] = await Promise.all([
      buildCopilotRutasSnapshot(supabase, auth.ctx.tenantCompanyId, now),
      listOperationalActions(supabase, auth.ctx.tenantCompanyId, 120),
    ]);
    const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
    const eventBuffer = new OperationalEventRequestBuffer();
    const { response } = await buildOperationalWorkflows(
      supabase,
      {
        workspaceCompanyId: auth.ctx.tenantCompanyId,
        now,
        snapshot,
        actions,
      },
      {
        eventBuffer,
        actor: {
          userId: auth.ctx.authUser.id,
          label: auth.ctx.appUser.full_name?.trim() || auth.ctx.appUser.email,
        },
      }
    );

    if (response.workflows.length > 0) {
      invalidateOperationalRuntime({
        workspaceCompanyId: auth.ctx.tenantCompanyId,
        snapshot: true,
        workflows: true,
        timeline: true,
        reason: "workflow_sync",
      });
    }

    return NextResponse.json({ ok: true as const, ...response });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-workflows",
    });
    return copilotInternalErrorResponse({
        ok: false as const,
        code: "UNEXPECTED",
        
        workflows: [],
        generatedAt: new Date().toISOString(),
        health: { status: "degraded", warnings: [{ source: "workflows", code: "UNEXPECTED" }] },
      });
  }
}
