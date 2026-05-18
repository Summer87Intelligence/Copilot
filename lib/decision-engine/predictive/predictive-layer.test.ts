import { describe, expect, it, vi } from "vitest";

import type { ClientOperationalSummary, OperationalTask } from "@/lib/decision-engine/de-types";
import { buildPortfolioDeteriorationForecasts } from "@/lib/decision-engine/predictive/portfolio-deterioration-forecast";
import { buildOperatorLoadForecasts } from "@/lib/decision-engine/predictive/operator-load-forecast";
import {
  computeRecoveryLikelihood,
  formatRecoveryLikelihoodLine,
} from "@/lib/decision-engine/predictive/recovery-likelihood-engine";
import { detectRecoveryOpportunities } from "@/lib/decision-engine/predictive/recovery-opportunity-detector";
import {
  buildPredictiveSnapshot,
  generatePredictiveSnapshot,
} from "@/lib/decision-engine/predictive/predictive-orchestrator";
import { buildSLAStressForecasts } from "@/lib/decision-engine/predictive/sla-stress-forecast";
import type { PredictiveContext, RecoveryLikelihoodInput } from "@/lib/decision-engine/predictive/predictive-types";
import {
  isPredictiveSnapshotFresh,
  isPredictiveSnapshotPayloadCurrent,
} from "@/lib/data/decision-predictive-snapshot-repository";

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: "t1",
    customer_id: "c1",
    company_name: "Trexys",
    section: "urgent_today",
    category: "call_today",
    priority: "high",
    impact: "high",
    source: "state_machine",
    title: "x",
    action_label: "Llamar",
    reason: "SLA",
    priority_score: 80,
    currency_code: "USD",
    pending_amount: 3000,
    oldest_days: 25,
    risk_level: "high",
    machine_state: "follow_up",
    breached_sla: false,
    group_key: null,
    group_label: null,
    due_at: null,
    ...overrides,
  };
}

function summary(overrides: Partial<ClientOperationalSummary> = {}): ClientOperationalSummary {
  return {
    customer_id: "c1",
    customer_name: "Trexys",
    highest_priority: "high",
    machine_state: "follow_up",
    risk_level: "high",
    primary_action: task(),
    secondary_actions: [],
    reasons: ["Contacto pendiente"],
    total_pending_amount: 3000,
    pending_currency_breakdown: { uyu: 0, usd: 3000 },
    concentration_percent: 20,
    expected_impact: { recovery_amount: 2500, risk_reduction: "medium", concentration_reduction: 2 },
    sla_breached: false,
    actionable_now: true,
    tasks_count: 1,
    generated_from: ["state_machine"],
    ...overrides,
  };
}

function baseContext(overrides: Partial<PredictiveContext> = {}): PredictiveContext {
  return {
    analytics: {
      generated_at: "2026-05-18T12:00:00.000Z",
      global: {
        active_cases: 30,
        unassigned_cases: 4,
        breached_sla_cases: 6,
        avg_time_to_first_action_hours: 5,
        avg_resolution_time_hours: 40,
        critical_open: 8,
        recovered_today: 2,
        followups_due_today: 3,
        operational_backlog: 28,
      },
      operators: [
        {
          user_id: "op-1",
          display_name: "Martín",
          assigned_total: 10,
          active_critical: 6,
          sla_breaches: 3,
          completed_today: 1,
          avg_response_time_hours: 20,
          avg_resolution_time_hours: 60,
          overload_score: 80,
          workload_band: "overloaded",
          workload_score: 75,
          critical_ratio: 0.6,
          overdue_ratio: 0.15,
        },
      ],
      sla: {
        compliance_pct: 58,
        breach_trend: [],
        operator_sla: [],
        breached_aging_buckets: { "<24h": 1, "1-3d": 2, "3-7d": 2, "+7d": 1 },
        breached_total: 6,
      },
      queue_signals: { sla_breached_count: 6, overloaded_operators_count: 1, followups_due_today: 3 },
    },
    queue: null,
    ownership: {
      total_assigned: 20,
      overdue_assigned: 2,
      unassigned_critical: 2,
      high_workload: true,
      operators: [],
    },
    client_summaries: [summary()],
    hydration_by_customer: {
      c1: {
        customer_id: "c1",
        machine_state: "follow_up",
        previous_state: null,
        transitioned_at: null,
        transition_reason: null,
        breached_sla: false,
        next_follow_up_at: null,
        pending_follow_up_id: null,
        pending_follow_up_reason: null,
        last_action_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        last_action_type: "call",
        last_action_summary: "Llamada",
        timeline_preview: [],
        assigned_user_id: "op-1",
        assigned_at: null,
        assigned_by: null,
        assignment_note: null,
        assignee_display_name: "Martín",
      },
    },
    recent_actions_by_customer: new Map(),
    follow_ups_by_customer: new Map(),
    recent_receipts_by_customer: new Map(),
    loaded_at: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("recovery likelihood engine", () => {
  it("asigna alta probabilidad con aging corto y contacto reciente", () => {
    const input: RecoveryLikelihoodInput = {
      customer_id: "c1",
      customer_name: "Trexys",
      oldest_days: 20,
      pending_amount: 3000,
      currency_code: "USD",
      machine_state: "follow_up",
      breached_sla: false,
      last_action_at: new Date().toISOString(),
      last_contact_days: 5,
      has_active_promise: false,
      promise_overdue: false,
      is_unassigned: false,
      has_recent_partial_payment: false,
      category: "call_today",
      risk_level: "high",
      recent_payment_count_30d: 0,
    };
    const result = computeRecoveryLikelihood(input);
    expect(result.band).toBe("high");
    expect(result.probability_pct).toBeGreaterThanOrEqual(65);
    expect(formatRecoveryLikelihoodLine(result)).toMatch(/Recuperación estimada/);
  });

  it("baja probabilidad con +90d sin contacto", () => {
    const result = computeRecoveryLikelihood({
      customer_id: "c2",
      customer_name: "Moroso",
      oldest_days: 120,
      pending_amount: 10000,
      currency_code: "USD",
      machine_state: "escalated",
      breached_sla: true,
      last_action_at: null,
      last_contact_days: null,
      has_active_promise: false,
      promise_overdue: false,
      is_unassigned: true,
      has_recent_partial_payment: false,
      category: "stale_contact",
      risk_level: "critical",
      recent_payment_count_30d: 0,
    });
    expect(["low", "very_low"]).toContain(result.band);
    expect(result.negative_drivers.some((d) => /90|contacto/i.test(d))).toBe(true);
  });
});

describe("portfolio deterioration forecast", () => {
  it("genera 3 horizontes", () => {
    const forecasts = buildPortfolioDeteriorationForecasts(baseContext());
    expect(forecasts.map((f) => f.horizon_days)).toEqual([7, 14, 30]);
    expect(forecasts[2]!.deterioration_band).toBeTruthy();
  });
});

describe("SLA stress forecast", () => {
  it("proyecta estrés con SLA actuales", () => {
    const forecasts = buildSLAStressForecasts(baseContext());
    expect(forecasts.length).toBeGreaterThan(0);
    expect(forecasts[0]!.projected_sla_breaches).toBeGreaterThanOrEqual(0);
  });
});

describe("operator load forecast", () => {
  it("marca operador sobrecargado", () => {
    const forecasts = buildOperatorLoadForecasts(baseContext().analytics);
    expect(forecasts[0]!.display_name).toBe("Martín");
    expect(forecasts[0]!.overload_probability_pct).toBeGreaterThan(50);
  });
});

describe("recovery opportunities", () => {
  it("detecta quick win", () => {
    const ctx = baseContext({
      client_summaries: [
        summary({
          primary_action: task({ oldest_days: 20, priority: "high" }),
          total_pending_amount: 2000,
        }),
      ],
    });
    const opps = detectRecoveryOpportunities(ctx);
    expect(opps.some((o) => o.opportunity_type === "quick_win" || o.opportunity_type === "assigned_recent_contact")).toBe(
      true
    );
  });
});

describe("predictive orchestrator", () => {
  it("arma snapshot con métricas", () => {
    const snap = buildPredictiveSnapshot(baseContext(), 30);
    expect(snap.recovery_likelihoods.length).toBe(1);
    expect(snap.portfolio_forecasts.length).toBe(3);
    expect(snap.executive_prediction_summary).toMatch(/recuperación/i);
    expect(snap.metrics.generation_ms).toBe(30);
  });

  it("usa caché cuando snapshot vigente", async () => {
    const payload = buildPredictiveSnapshot(baseContext(), 5);
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
                  snapshot_type: "predictive_v1",
                  payload,
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
    const result = await generatePredictiveSnapshot(supabase as never, "t", { force: false });
    expect(result.cached).toBe(true);
  });
});

describe("predictive cache helpers", () => {
  it("valida freshness y shape", () => {
    const payload = buildPredictiveSnapshot(baseContext(), 1);
    expect(isPredictiveSnapshotPayloadCurrent(payload)).toBe(true);
    expect(
      isPredictiveSnapshotFresh({
        id: "1",
        workspace_company_id: "t",
        generated_at: payload.generated_at,
        snapshot_type: "predictive_v1",
        payload,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        generation_ms: 1,
      })
    ).toBe(true);
  });
});
