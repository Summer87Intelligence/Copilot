import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { buildOperationalIntelligence } from "@/lib/copilot-operational-intelligence";
import { listOperationalTimeline } from "@/lib/copilot-operational-events";
import { buildAutomationGovernanceResponse } from "@/lib/copilot-operational-governance";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { buildOperationalWorkflows } from "@/lib/copilot-operational-workflows";
import { OperationalEventRequestBuffer } from "@/lib/copilot-operational-events";
import { buildCopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot";
import { readCachedRutasSnapshot } from "@/lib/copilot-rutas-snapshot-cache";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export const dynamic = "force-dynamic";

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
    const workspaceId = auth.ctx.tenantCompanyId;

    const cachedSnapshot = readCachedRutasSnapshot(workspaceId);
    const [snapshot, actionsResult, operationalEvents] = await Promise.all([
      cachedSnapshot ?? buildCopilotRutasSnapshot(supabase, workspaceId, now),
      listOperationalActions(supabase, workspaceId, 120),
      listOperationalTimeline(supabase, workspaceId, 20),
    ]);

    const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
    const { response } = await buildOperationalWorkflows(
      supabase,
      { workspaceCompanyId: workspaceId, now, snapshot, actions },
      {
        eventBuffer: new OperationalEventRequestBuffer(),
        actor: {
          userId: auth.ctx.authUser.id,
          label: auth.ctx.appUser.full_name?.trim() || auth.ctx.appUser.email,
        },
      }
    );

    const governance = buildAutomationGovernanceResponse(workspaceId);

    const intelligence = buildOperationalIntelligence({
      now,
      workflows: response.workflows,
      operationalEvents,
      memorySignals: snapshot.memory,
      operationalAutomation: response.automation ?? null,
      governance,
      snapshotHealth: snapshot.health,
    });

    log.info("copilot_operational_intelligence_generated", {
      insight_count: intelligence.insights.length,
      health_status: intelligence.health.status,
      top_severity: intelligence.insights[0]?.severity ?? "none",
      has_top_pattern: Boolean(intelligence.topPattern),
    });

    return NextResponse.json({ ok: true as const, intelligence });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-intelligence",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", message },
      { status: 500 }
    );
  }
}
