import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { buildAutomationGovernanceResponse } from "@/lib/copilot-operational-governance";
import {
  getAllTrackedWorkspaces,
  getRebuildHealthSummary,
} from "@/lib/copilot-operational-telemetry";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

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

    const workspaceId = auth.ctx.tenantCompanyId;
    const rebuildSummary = getRebuildHealthSummary(workspaceId);
    const governance = buildAutomationGovernanceResponse(workspaceId);
    const trackedWorkspaces = getAllTrackedWorkspaces();

    const allDegraded = rebuildSummary.degradedCount > 0;
    const noRecentActivity = rebuildSummary.lastTimestamp === null;
    const overallStatus = allDegraded ? "degraded" : "ok";

    log.info("copilot_operational_health", {
      status: overallStatus,
      rebuild_count: rebuildSummary.rebuildCount,
      avg_duration_ms: rebuildSummary.avgDurationMs,
      degraded_count: rebuildSummary.degradedCount,
      workflow_count: rebuildSummary.lastWorkflowCount,
    });

    return NextResponse.json({
      ok: true as const,
      status: overallStatus,
      generatedAt: new Date().toISOString(),
      rebuild: {
        count: rebuildSummary.rebuildCount,
        avgDurationMs: rebuildSummary.avgDurationMs,
        lastDurationMs: rebuildSummary.lastDurationMs,
        degradedCount: rebuildSummary.degradedCount,
        lastWorkflowCount: rebuildSummary.lastWorkflowCount,
        lastAutomationCount: rebuildSummary.lastAutomationCount,
        lastTimestamp: rebuildSummary.lastTimestamp,
        noRecentActivity,
      },
      governance: {
        activeRuleCount: governance.rules.filter(
          (rule) => rule.runtime.enabled && rule.riskLevel !== "restricted"
        ).length,
        totalRuleCount: governance.rules.length,
        activeAutomationCount: governance.activeAutomations.length,
        recentAuditEventCount: governance.auditEvents.length,
        generatedAt: governance.generatedAt,
        health: governance.health,
      },
      cache: {
        trackedWorkspaceCount: trackedWorkspaces.length,
      },
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/operational-health",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", message },
      { status: 500 }
    );
  }
}
