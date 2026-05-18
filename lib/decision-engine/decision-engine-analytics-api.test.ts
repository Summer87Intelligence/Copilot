import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as analyticsGet } from "@/app/api/copilot/decision-engine/analytics/route";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { getOperationalAnalytics } from "@/lib/decision-engine/operational-analytics-orchestrator";

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: vi.fn(),
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

vi.mock("@/lib/data/decision-operational-analytics-repository", () => ({
  readOperationalAnalyticsSnapshot: vi.fn().mockResolvedValue({
    expires_at: new Date(Date.now() + 900_000).toISOString(),
  }),
}));

vi.mock("@/lib/decision-engine/operational-analytics-orchestrator", () => ({
  getOperationalAnalytics: vi.fn(),
}));

const mockAuth = vi.mocked(requireCopilotTenantContext);
const mockGet = vi.mocked(getOperationalAnalytics);

const TENANT = "tenant-1";
const mockSupabase = {} as never;

const sampleAnalytics = {
  generated_at: "2026-05-18T12:00:00.000Z",
  global: {
    active_cases: 5,
    unassigned_cases: 1,
    breached_sla_cases: 2,
    avg_time_to_first_action_hours: 4,
    avg_resolution_time_hours: 24,
    critical_open: 3,
    recovered_today: 1,
    followups_due_today: 4,
    operational_backlog: 9,
  },
  operators: [],
  sla: {
    compliance_pct: 60,
    breach_trend: [],
    operator_sla: [],
    breached_aging_buckets: { "<24h": 1, "1-3d": 1, "3-7d": 0, "+7d": 0 },
    breached_total: 2,
  },
  queue_signals: {
    sla_breached_count: 2,
    overloaded_operators_count: 1,
    followups_due_today: 4,
  },
};

describe("GET /api/copilot/decision-engine/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
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
    });
    mockGet.mockResolvedValue({
      analytics: sampleAnalytics,
      cached: true,
      generation_ms: 12,
    });
  });

  it("rechaza sin auth tenant", async () => {
    mockAuth.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const res = await analyticsGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/analytics")
    );
    expect(res.status).toBe(401);
  });

  it("devuelve snapshot analytics", async () => {
    const res = await analyticsGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/analytics")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.analytics.global.active_cases).toBe(5);
    expect(mockGet).toHaveBeenCalledWith(mockSupabase, TENANT, { force: false });
  });

  it("force=true recalcula", async () => {
    await analyticsGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/analytics?force=true")
    );
    expect(mockGet).toHaveBeenCalledWith(mockSupabase, TENANT, { force: true });
  });
});
