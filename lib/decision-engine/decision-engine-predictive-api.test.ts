import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as predictiveGet } from "@/app/api/copilot/decision-engine/predictive/route";
import { GET as recoveryOpportunitiesGet } from "@/app/api/copilot/decision-engine/recovery-opportunities/route";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { generatePredictiveSnapshot } from "@/lib/decision-engine/predictive/predictive-orchestrator";

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

vi.mock("@/lib/data/decision-predictive-snapshot-repository", () => ({
  readPredictiveSnapshot: vi.fn().mockResolvedValue({
    expires_at: new Date(Date.now() + 1_800_000).toISOString(),
  }),
}));

vi.mock("@/lib/decision-engine/predictive/predictive-orchestrator", () => ({
  PREDICTIVE_SNAPSHOT_TYPE: "predictive_v1",
  generatePredictiveSnapshot: vi.fn(),
  getRecoveryLikelihoodForCustomer: vi.fn(),
}));

const mockAuth = vi.mocked(requireCopilotTenantContext);
const mockGenerate = vi.mocked(generatePredictiveSnapshot);

const TENANT = "tenant-1";
const mockSupabase = {} as never;

const samplePredictive = {
  generated_at: "2026-05-18T12:00:00.000Z",
  recovery_likelihoods: [],
  portfolio_forecasts: [{ horizon_days: 30, projected_risk_delta_pct: 12, deterioration_band: "watch" as const }],
  sla_forecasts: [{ horizon_days: 7, projected_sla_breaches: 4, stress_band: "elevated" as const }],
  operator_load_forecasts: [],
  recovery_opportunities: [{ customer_id: "c1", customer_name: "Trexys", opportunity_type: "quick_win" as const }],
  executive_prediction_summary: "Probabilidad media de recuperación: 52%.",
  metrics: {
    predicted_critical_cases: 10,
    projected_sla_breaches_7d: 4,
    recovery_opportunities_count: 1,
    avg_recovery_likelihood_pct: 52,
    generation_ms: 25,
  },
  source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
  cached: true,
  expires_at: new Date(Date.now() + 1_800_000).toISOString(),
};

describe("GET /api/copilot/decision-engine/predictive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        supabase: mockSupabase,
        tenantCompanyId: TENANT,
        appUser: null,
        authUser: { id: "auth-1" } as never,
      },
    } as never);
    mockGenerate.mockResolvedValue(samplePredictive as never);
  });

  it("rechaza sin auth tenant", async () => {
    mockAuth.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const res = await predictiveGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/predictive")
    );
    expect(res.status).toBe(401);
  });

  it("devuelve snapshot predictivo", async () => {
    const res = await predictiveGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/predictive")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.predictive.executive_prediction_summary).toContain("recuperación");
    expect(mockGenerate).toHaveBeenCalledWith(mockSupabase, TENANT, { force: false }, expect.anything());
  });

  it("force=true recalcula", async () => {
    await predictiveGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/predictive?force=true")
    );
    expect(mockGenerate).toHaveBeenCalledWith(mockSupabase, TENANT, { force: true }, expect.anything());
  });
});

describe("GET /api/copilot/decision-engine/recovery-opportunities", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: { supabase: mockSupabase, tenantCompanyId: TENANT, appUser: null, authUser: {} as never },
    } as never);
    mockGenerate.mockResolvedValue(samplePredictive as never);
  });

  it("devuelve oportunidades", async () => {
    const res = await recoveryOpportunitiesGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/recovery-opportunities")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.recovery_opportunities).toHaveLength(1);
  });
});
