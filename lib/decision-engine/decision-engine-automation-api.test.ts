import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/copilot/decision-engine/run-automation/route";
import { GET as runsGet } from "@/app/api/copilot/decision-engine/automation-runs/route";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { runOperationalAutomation } from "@/lib/decision-engine/operational-automation-runner";
import { selectAutomationRuns } from "@/lib/data/decision-automation-repository";

const authMocks = vi.hoisted(() => ({
  requireCopilotModuleAccess: vi.fn(),
  requireCopilotModuleWriteAccess: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleAccess: authMocks.requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess: authMocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/copilot-structured-logger", () => ({
  copilotRequestLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    withTenant: vi.fn(function (this: unknown) {
      return this;
    }),
  })),
}));

vi.mock("@/lib/decision-engine/operational-automation-runner", () => ({
  runOperationalAutomation: vi.fn(),
  AUTOMATION_ACTOR_ID: "system:operational-automation",
}));

vi.mock("@/lib/data/decision-automation-repository", () => ({
  selectAutomationRuns: vi.fn(),
}));

const mockAuth = authMocks.requireCopilotModuleAccess;
const mockWriteAuth = authMocks.requireCopilotModuleWriteAccess;
const mockRun = vi.mocked(runOperationalAutomation);
const mockRuns = vi.mocked(selectAutomationRuns);

const TENANT = "tenant-1";
const mockSupabase = {} as never;

describe("decision-engine automation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const authSuccess = {
      ok: true as const,
      ctx: {
        supabase: mockSupabase,
        tenantCompanyId: TENANT,
        appUser: {
          id: "op-1",
          company_id: TENANT,
          full_name: "Op",
          email: "o@t.com",
          role: "member",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        authUser: { id: "auth-1" } as never,
      },
    };
    mockAuth.mockResolvedValue(authSuccess);
    mockWriteAuth.mockResolvedValue(authSuccess);
  });

  it("POST run-automation tenant-safe dry_run", async () => {
    mockRun.mockResolvedValueOnce({
      run: {
        id: "run-1",
        workspace_company_id: TENANT,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        rules_evaluated: 7,
        actions_generated: 2,
        actions_executed: 0,
        actions_deduped: 1,
        dry_run: true,
        status: "completed",
        error_message: null,
      },
      actions: [],
      preview: [],
      metrics: {
        total_evaluated: 10,
        actions_generated: 2,
        actions_executed: 0,
        actions_deduped: 1,
        escalations_triggered: 0,
        follow_ups_created: 0,
      },
    });

    const req = new NextRequest("http://localhost/api/copilot/decision-engine/run-automation", {
      method: "POST",
      body: JSON.stringify({ dry_run: true }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRun).toHaveBeenCalledWith(
      mockSupabase,
      TENANT,
      expect.objectContaining({ dryRun: true, actorUserId: "op-1" }),
      expect.anything()
    );
  });

  it("GET automation-runs requiere auth", async () => {
    mockAuth.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const res = await runsGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/automation-runs")
    );
    expect(res.status).toBe(401);
  });

  it("GET automation-runs lista por tenant", async () => {
    mockRuns.mockResolvedValueOnce([]);
    const res = await runsGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/automation-runs")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRuns).toHaveBeenCalledWith(mockSupabase, TENANT, 20);
  });
});
