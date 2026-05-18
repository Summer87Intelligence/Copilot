import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as aiBriefingGet } from "@/app/api/copilot/decision-engine/ai-briefing/route";
import { GET as aiAnomaliesGet } from "@/app/api/copilot/decision-engine/ai-anomalies/route";
import { GET as aiOperatorInsightsGet } from "@/app/api/copilot/decision-engine/ai-operator-insights/route";
import { GET as aiRiskSummaryGet } from "@/app/api/copilot/decision-engine/ai-risk-summary/route";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  buildRiskSummaryForCustomer,
  generateOperationalIntelligence,
} from "@/lib/decision-engine/ai/ai-intelligence-orchestrator";

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

vi.mock("@/lib/data/decision-ai-briefing-repository", () => ({
  readAIBriefingSnapshot: vi.fn().mockResolvedValue({
    expires_at: new Date(Date.now() + 1_800_000).toISOString(),
  }),
}));

vi.mock("@/lib/decision-engine/ai/ai-intelligence-orchestrator", () => ({
  AI_BRIEFING_TYPE: "operational_intelligence_v1",
  generateOperationalIntelligence: vi.fn(),
  buildRiskSummaryForCustomer: vi.fn(),
}));

const mockAuth = vi.mocked(requireCopilotTenantContext);
const mockGenerate = vi.mocked(generateOperationalIntelligence);
const mockRisk = vi.mocked(buildRiskSummaryForCustomer);

const TENANT = "tenant-1";
const mockSupabase = {} as never;

const sampleIntelligence = {
  generated_at: "2026-05-18T12:00:00.000Z",
  briefing: {
    summary: "Hoy hay 3 riesgos operacionales críticos.",
    key_points: ["punto 1"],
    operational_priorities: [],
    emerging_risks: [],
    workload_warnings: [],
  },
  anomalies: [{ id: "a1", kind: "sla_spike" as const, severity: "high" as const, title: "SLA", description: "x", customer_id: null }],
  operator_insights: [],
  metrics: {
    anomalies_detected: 1,
    critical_insights: 1,
    workload_alerts: 0,
    generation_ms: 20,
  },
  source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
  cached: true,
  expires_at: new Date(Date.now() + 1_800_000).toISOString(),
};

describe("GET /api/copilot/decision-engine/ai-briefing", () => {
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
    mockGenerate.mockResolvedValue(sampleIntelligence);
  });

  it("rechaza sin auth tenant", async () => {
    mockAuth.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const res = await aiBriefingGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-briefing")
    );
    expect(res.status).toBe(401);
  });

  it("devuelve inteligencia operacional", async () => {
    const res = await aiBriefingGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-briefing")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.intelligence.briefing.summary).toContain("riesgos");
    expect(mockGenerate).toHaveBeenCalledWith(mockSupabase, TENANT, { force: false }, expect.anything());
  });

  it("force=true recalcula", async () => {
    await aiBriefingGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-briefing?force=true")
    );
    expect(mockGenerate).toHaveBeenCalledWith(mockSupabase, TENANT, { force: true }, expect.anything());
  });
});

describe("GET /api/copilot/decision-engine/ai-anomalies", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        supabase: mockSupabase,
        tenantCompanyId: TENANT,
        appUser: null,
        authUser: { id: "auth-1" } as never,
      },
    } as never);
    mockGenerate.mockResolvedValue(sampleIntelligence);
  });

  it("devuelve anomalías", async () => {
    const res = await aiAnomaliesGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-anomalies")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.anomalies).toHaveLength(1);
  });
});

describe("GET /api/copilot/decision-engine/ai-operator-insights", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: { supabase: mockSupabase, tenantCompanyId: TENANT, appUser: null, authUser: {} as never },
    } as never);
    mockGenerate.mockResolvedValue(sampleIntelligence);
  });

  it("devuelve insights", async () => {
    const res = await aiOperatorInsightsGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-operator-insights")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.operator_insights).toEqual([]);
  });
});

describe("GET /api/copilot/decision-engine/ai-risk-summary", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: { supabase: mockSupabase, tenantCompanyId: TENANT, appUser: null, authUser: {} as never },
    } as never);
  });

  it("requiere customer_id", async () => {
    const res = await aiRiskSummaryGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-risk-summary")
    );
    expect(res.status).toBe(400);
  });

  it("devuelve narrativa de riesgo", async () => {
    mockRisk.mockResolvedValue({
      customer_id: "c1",
      customer_name: "Test",
      narrative: {
        narrative: "Cliente con deterioro.",
        top_risk_factors: ["SLA"],
        urgency_reason: "Urgente",
        recommended_focus: "Llamar",
      },
      priority: {
        explanation: "Priorizado por SLA.",
        contributing_factors: ["SLA"],
        expected_outcome: "Recuperar",
      },
      task: null,
    });
    const res = await aiRiskSummaryGet(
      new NextRequest("http://localhost/api/copilot/decision-engine/ai-risk-summary?customer_id=c1")
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.narrative.narrative).toContain("deterioro");
    expect(mockRisk).toHaveBeenCalledWith(mockSupabase, TENANT, "c1");
  });
});
