import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { buildCopilotIntelligenceBundle } from "@/lib/copilot-intelligence-bundle";
import { listOperationalTimeline } from "@/lib/copilot-operational-events";
import { OperationalEventRequestBuffer } from "@/lib/copilot-operational-events";
import { buildAutomationGovernanceResponse } from "@/lib/copilot-operational-governance";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { buildOperationalWorkflows } from "@/lib/copilot-operational-workflows";
import { buildCopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot";
import { readCachedRutasSnapshot } from "@/lib/copilot-rutas-snapshot-cache";
import { getRebuildHealthSummary } from "@/lib/copilot-operational-telemetry";
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
    const actor = {
      userId: auth.ctx.authUser.id,
      label: auth.ctx.appUser.full_name?.trim() || auth.ctx.appUser.email,
    };
    const timingMs: Record<string, number> = {};
    const warnings: string[] = [];

    // ── Stage 1: snapshot (use cache when available) ────────────────────────
    const cachedSnapshot = readCachedRutasSnapshot(workspaceId);
    const t0 = Date.now();
    const [snapshot, actionsResult, events] = await Promise.all([
      cachedSnapshot ?? buildCopilotRutasSnapshot(supabase, workspaceId, now),
      listOperationalActions(supabase, workspaceId, 120),
      listOperationalTimeline(supabase, workspaceId, 20),
    ]);
    timingMs.snapshot = cachedSnapshot ? 0 : Date.now() - t0;
    timingMs.actions = actionsResult.ok ? 0 : 0; // captured in parallel above
    timingMs.events = 0;

    if (!cachedSnapshot) {
      timingMs.snapshot = Date.now() - t0;
    }

    if (snapshot.health.status === "degraded" || snapshot.health.status === "error") {
      warnings.push(`Snapshot ${snapshot.health.status}: datos parciales.`);
    }

    const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
    if (!actionsResult.ok) {
      warnings.push("No se pudieron cargar las acciones operacionales.");
    }

    // ── Stage 2: workflows — exactly ONE call ───────────────────────────────
    const t1 = Date.now();
    let workflowsResult: Awaited<ReturnType<typeof buildOperationalWorkflows>>;
    try {
      workflowsResult = await buildOperationalWorkflows(
        supabase,
        { workspaceCompanyId: workspaceId, now, snapshot, actions },
        {
          eventBuffer: new OperationalEventRequestBuffer(),
          actor,
        }
      );
    } catch (workflowErr) {
      const msg = workflowErr instanceof Error ? workflowErr.message : "Error desconocido";
      warnings.push(`Workflows: ${msg}`);
      workflowsResult = {
        response: {
          workflows: [],
          generatedAt: now.toISOString(),
          hasSuppressedWorkflows: false,
          health: { status: "degraded", warnings: [{ source: "bundle", code: "WORKFLOW_ERR", message: msg }] },
        },
        stats: { generated: 0, deduped: 0, blocked: 0, completed: 0, active: 0, overdue: 0 },
        created: [],
        hasSuppressedWorkflows: false,
      };
    }
    timingMs.workflows = Date.now() - t1;

    const { response } = workflowsResult;
    if (response.health.status !== "ok") {
      warnings.push(`Workflow runtime: ${response.health.status}.`);
    }

    // ── Stage 3: governance (in-memory, no DB) ──────────────────────────────
    const governance = buildAutomationGovernanceResponse(workspaceId);

    // ── Stage 4: rebuild health summary ─────────────────────────────────────
    const rebuildSummary = getRebuildHealthSummary(workspaceId);

    // ── Stage 5: assemble bundle (pure, CPU only) ────────────────────────────
    const bundle = buildCopilotIntelligenceBundle({
      now,
      snapshot,
      workflows: response.workflows,
      operationalAutomation: response.automation ?? null,
      events,
      governance,
      health: { snapshot: snapshot.health, rebuild: rebuildSummary },
      currentUser: { id: actor.userId, label: actor.label },
      timingMs,
      warnings,
    });

    // ── Dev observability ────────────────────────────────────────────────────
    const logPayload = {
      workflow_count: bundle.workflows.length,
      event_count: bundle.events.length,
      command_center_items: bundle.commandCenter.items.length,
      timing_ms: bundle.timingMs,
      warning_count: bundle.warnings.length,
      snapshot_from_cache: Boolean(cachedSnapshot),
    };

    if ((bundle.timingMs.total ?? 0) > 1500) {
      log.warn("copilot_intelligence_bundle_slow", logPayload);
    } else {
      log.info("copilot_intelligence_bundle_generated", logPayload);
    }

    return NextResponse.json({ ok: true as const, data: bundle });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/intelligence-bundle",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", message },
      { status: 500 }
    );
  }
}
