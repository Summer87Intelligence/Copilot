import { describe, expect, it, vi } from "vitest";

import { detectOperationalAnomalies } from "@/lib/decision-engine/ai/ai-anomaly-detector";
import { buildOperationalBriefing } from "@/lib/decision-engine/ai/ai-operational-briefing";
import { buildOperatorInsights } from "@/lib/decision-engine/ai/ai-operator-insights";
import { explainPriority } from "@/lib/decision-engine/ai/ai-priority-explainer";
import {
  buildRiskNarrative,
  riskNarrativeInputFromSummary,
} from "@/lib/decision-engine/ai/ai-risk-narrative-engine";
import {
  buildOperationalIntelligencePayload,
  generateOperationalIntelligence,
} from "@/lib/decision-engine/ai/ai-intelligence-orchestrator";
import type { AIIntelligenceContext } from "@/lib/decision-engine/ai/ai-types";
import type { ClientOperationalSummary, OperationalTask } from "@/lib/decision-engine/de-types";
import {
  isAIBriefingPayloadCurrent,
  isAIBriefingSnapshotFresh,
} from "@/lib/data/decision-ai-briefing-repository";

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: "t1",
    customer_id: "c1",
    company_name: "Petrovic",
    section: "urgent_today",
    category: "stale_contact",
    priority: "critical",
    impact: "high",
    source: "state_machine",
    title: "x",
    action_label: "Contactar",
    reason: "Sin contacto",
    priority_score: 95,
    currency_code: "USD",
    pending_amount: 12000,
    oldest_days: 17,
    risk_level: "critical",
    machine_state: "escalated",
    breached_sla: true,
    group_key: null,
    group_label: null,
    due_at: null,
    ...overrides,
  };
}

function summary(overrides: Partial<ClientOperationalSummary> = {}): ClientOperationalSummary {
  return {
    customer_id: "c1",
    customer_name: "Petrovic",
    highest_priority: "critical",
    machine_state: "escalated",
    risk_level: "critical",
    primary_action: task(),
    secondary_actions: [],
    reasons: ["Sin contacto 17d", "SLA vencido"],
    total_pending_amount: 12000,
    pending_currency_breakdown: { uyu: 0, usd: 12000 },
    concentration_percent: 52,
    expected_impact: {
      recovery_amount: 8000,
      risk_reduction: "high",
      concentration_reduction: 10,
    },
    sla_breached: true,
    actionable_now: true,
    tasks_count: 2,
    generated_from: ["state_machine"],
    ...overrides,
  };
}

function baseContext(overrides: Partial<AIIntelligenceContext> = {}): AIIntelligenceContext {
  return {
    analytics: {
      generated_at: "2026-05-18T12:00:00.000Z",
      global: {
        active_cases: 40,
        unassigned_cases: 5,
        breached_sla_cases: 8,
        avg_time_to_first_action_hours: 6,
        avg_resolution_time_hours: 48,
        critical_open: 10,
        recovered_today: 2,
        followups_due_today: 3,
        operational_backlog: 30,
      },
      operators: [
        {
          user_id: "op-1",
          display_name: "Martín",
          assigned_total: 12,
          active_critical: 7,
          sla_breaches: 4,
          completed_today: 1,
          avg_response_time_hours: 18,
          avg_resolution_time_hours: 72,
          overload_score: 85,
          workload_band: "overloaded",
          workload_score: 80,
          critical_ratio: 0.58,
          overdue_ratio: 0.2,
        },
        {
          user_id: "op-2",
          display_name: "Ana",
          assigned_total: 6,
          active_critical: 1,
          sla_breaches: 0,
          completed_today: 5,
          avg_response_time_hours: 4,
          avg_resolution_time_hours: 24,
          overload_score: 20,
          workload_band: "normal",
          workload_score: 25,
          critical_ratio: 0.16,
          overdue_ratio: 0,
        },
      ],
      sla: {
        compliance_pct: 55,
        breach_trend: [],
        operator_sla: [],
        breached_aging_buckets: { "<24h": 1, "1-3d": 2, "3-7d": 3, "+7d": 2 },
        breached_total: 8,
      },
      queue_signals: {
        sla_breached_count: 8,
        overloaded_operators_count: 1,
        followups_due_today: 3,
      },
    },
    queue: {
      generated_at: "2026-05-18T11:00:00.000Z",
      groups: [],
      stats: {
        total_tasks: 40,
        urgent_count: 10,
        sla_breach_count: 8,
        promises_due_today: 2,
        by_section: {
          urgent_today: 10,
          high_impact: 8,
          this_week: 12,
          monitoring: 8,
          automated: 2,
        },
        by_category: {},
      },
      sections: {
        urgent_today: [task()],
        high_impact: [],
        this_week: [],
        monitoring: [],
        automated: [],
      },
    },
    ownership: {
      total_assigned: 20,
      overdue_assigned: 2,
      unassigned_critical: 3,
      high_workload: true,
      operators: [],
    },
    automation_runs: [],
    automation_actions: [],
    client_summaries: [summary()],
    loaded_at: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("AI operational briefing", () => {
  it("genera summary y key points accionables", () => {
    const briefing = buildOperationalBriefing(baseContext());
    expect(briefing.summary).toMatch(/riesgo/i);
    expect(briefing.key_points.length).toBeGreaterThan(0);
    expect(briefing.operational_priorities.length).toBeGreaterThan(0);
    expect(
      briefing.workload_warnings.some((w) =>
        /SOBRECARGA|sobrecarga|carga crítica|Martín/i.test(w)
      )
    ).toBe(true);
  });
});

describe("AI risk narrative", () => {
  it("explica deterioro y concentración", () => {
    const input = riskNarrativeInputFromSummary(summary(), null);
    const narrative = buildRiskNarrative(input);
    expect(narrative.narrative).toMatch(/deterioro|riesgo/i);
    expect(narrative.top_risk_factors.length).toBeGreaterThan(0);
    expect(narrative.urgency_reason.length).toBeGreaterThan(10);
  });
});

describe("AI operator insights", () => {
  it("detecta operador sobrecargado", () => {
    const insights = buildOperatorInsights(baseContext().analytics);
    expect(insights.some((i) => i.display_name === "Martín" && i.kind === "overloaded")).toBe(true);
  });
});

describe("AI anomaly detector", () => {
  it("detecta backlog y SLA elevados", () => {
    const anomalies = detectOperationalAnomalies(baseContext());
    expect(anomalies.some((a) => a.kind === "backlog_spike")).toBe(true);
    expect(anomalies.some((a) => a.kind === "sla_spike")).toBe(true);
  });
});

describe("AI priority explainer", () => {
  it("explica prioridad por SLA y concentración", () => {
    const exp = explainPriority({ summary: summary() });
    expect(exp.explanation).toMatch(/SLA|concentración|contacto/i);
    expect(exp.contributing_factors.length).toBeGreaterThan(0);
    expect(exp.expected_outcome).toMatch(/recuperar|riesgo/i);
  });
});

describe("AI intelligence payload", () => {
  it("arma bundle con métricas", () => {
    const payload = buildOperationalIntelligencePayload(baseContext(), 42);
    expect(payload.briefing.summary).toBeTruthy();
    expect(payload.metrics.generation_ms).toBe(42);
    expect(payload.metrics.anomalies_detected).toBeGreaterThan(0);
  });
});

describe("AI briefing cache helpers", () => {
  it("valida freshness y shape", () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    expect(
      isAIBriefingSnapshotFresh({
        id: "1",
        workspace_company_id: "t",
        generated_at: new Date().toISOString(),
        briefing_type: "x",
        payload: buildOperationalIntelligencePayload(baseContext(), 1),
        source_snapshot_ids: {},
        expires_at: expires,
        generation_ms: 1,
      })
    ).toBe(true);

    const payload = buildOperationalIntelligencePayload(baseContext(), 1);
    expect(isAIBriefingPayloadCurrent(payload)).toBe(true);
    expect(isAIBriefingPayloadCurrent(null)).toBe(false);
  });
});

describe("generateOperationalIntelligence cache", () => {
  it("usa caché cuando snapshot vigente", async () => {
    const payload = buildOperationalIntelligencePayload(baseContext(), 5);
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "1",
                  workspace_company_id: "t",
                  generated_at: payload.generated_at,
                  briefing_type: "operational_intelligence_v1",
                  payload,
                  source_snapshot_ids: {},
                  expires_at: new Date(Date.now() + 1_800_000).toISOString(),
                  generation_ms: 5,
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const result = await generateOperationalIntelligence(supabase as never, "t", { force: false });
    expect(result.cached).toBe(true);
    expect(result.briefing.summary).toBe(payload.briefing.summary);
  });
});
