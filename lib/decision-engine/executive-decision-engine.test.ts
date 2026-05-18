/**
 * Phase 5C — tests del Executive Decision Engine.
 */

import { describe, expect, it } from "vitest";
import {
  generateExecutiveBrief,
  type ExecutiveDecisionEngineInput,
} from "./executive-decision-engine";
import type { PortfolioScore, OperationalAnalyticsSnapshot } from "./de-types";
import type { PredictiveSnapshot } from "./predictive/predictive-types";
import type {
  AutomationRunRow,
  RankedClient,
} from "./de-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScore(overrides: Partial<PortfolioScore> = {}): PortfolioScore {
  return {
    score: 75,
    band: "atencion",
    band_label: "Requiere atención",
    effectiveness_score: 70,
    aging_score: 65,
    concentration_score: 80,
    total_pending_uyu: 500_000,
    total_pending_usd: 10_000,
    active_debtors_count: 15,
    effectiveness_pct: 0.7,
    over90_pct: 8,
    ...overrides,
  };
}

function makeAnalytics(overrides: Partial<OperationalAnalyticsSnapshot> = {}): OperationalAnalyticsSnapshot {
  return {
    generated_at: new Date().toISOString(),
    global: {
      active_cases: 10,
      unassigned_cases: 2,
      breached_sla_cases: 1,
      avg_time_to_first_action_hours: 4,
      avg_resolution_time_hours: 48,
      critical_open: 2,
      recovered_today: 1,
      followups_due_today: 3,
      operational_backlog: 5,
    },
    operators: [],
    sla: {
      compliance_pct: 90,
      breach_trend: [],
      operator_sla: [],
      breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 },
      breached_total: 1,
    },
    queue_signals: {
      sla_breached_count: 1,
      overloaded_operators_count: 0,
      followups_due_today: 3,
    },
    ...overrides,
  };
}

function makeInput(overrides: Partial<ExecutiveDecisionEngineInput> = {}): ExecutiveDecisionEngineInput {
  return {
    portfolio_score: makeScore(),
    analytics: makeAnalytics(),
    predictive: null,
    ranked_clients: [],
    automation_runs: [],
    automation_actions: [],
    pipeline_signals: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic shape
// ---------------------------------------------------------------------------

describe("generateExecutiveBrief — shape", () => {
  it("produces a valid ExecutiveDecisionBrief", () => {
    const result = generateExecutiveBrief(makeInput());
    expect(result.generated_at).toBeTruthy();
    expect(result.executive_summary).toBeTruthy();
    expect(Array.isArray(result.top_decisions)).toBe(true);
    expect(Array.isArray(result.today_priorities)).toBe(true);
    expect(Array.isArray(result.source_signals)).toBe(true);
    expect(typeof result.confidence_pct).toBe("number");
    expect(result.confidence_pct).toBeGreaterThan(0);
    expect(result.confidence_pct).toBeLessThanOrEqual(100);
  });

  it("uses provided now for generated_at", () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const result = generateExecutiveBrief(makeInput({ now }));
    expect(result.generated_at).toBe("2026-05-18T10:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Rule: stale data guard
// ---------------------------------------------------------------------------

describe("rule — stale data guard", () => {
  it("adds critical decision when portfolio_score is null", () => {
    const result = generateExecutiveBrief(makeInput({ portfolio_score: null }));
    const d = result.top_decisions.find((d) => d.id === "stale_data_guard");
    expect(d).toBeDefined();
    expect(d!.urgency).toBe("critical");
    expect(d!.action_type).toBe("review_pipeline");
  });

  it("adds critical decision when analytics is null", () => {
    const result = generateExecutiveBrief(makeInput({ analytics: null }));
    const d = result.top_decisions.find((d) => d.id === "stale_data_guard");
    expect(d).toBeDefined();
    expect(d!.urgency).toBe("critical");
  });

  it("does NOT add stale guard when both signals are present", () => {
    const result = generateExecutiveBrief(makeInput());
    const d = result.top_decisions.find((d) => d.id === "stale_data_guard");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: portfolio score low
// ---------------------------------------------------------------------------

describe("rule — portfolio score low", () => {
  it("adds high urgency decision when score is 55", () => {
    const result = generateExecutiveBrief(makeInput({ portfolio_score: makeScore({ score: 55 }) }));
    const d = result.top_decisions.find((d) => d.id === "portfolio_score_low");
    expect(d).toBeDefined();
    expect(d!.urgency).toBe("high");
  });

  it("adds critical urgency when score is 35", () => {
    const result = generateExecutiveBrief(makeInput({ portfolio_score: makeScore({ score: 35 }) }));
    const d = result.top_decisions.find((d) => d.id === "portfolio_score_low");
    expect(d!.urgency).toBe("critical");
  });

  it("does NOT add decision when score is 70", () => {
    const result = generateExecutiveBrief(makeInput({ portfolio_score: makeScore({ score: 70 }) }));
    const d = result.top_decisions.find((d) => d.id === "portfolio_score_low");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: SLA compliance
// ---------------------------------------------------------------------------

describe("rule — SLA compliance", () => {
  it("adds high urgency decision when compliance is 80", () => {
    const analytics = makeAnalytics({ sla: { compliance_pct: 80, breach_trend: [], operator_sla: [], breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 }, breached_total: 5 } });
    const result = generateExecutiveBrief(makeInput({ analytics }));
    const d = result.top_decisions.find((d) => d.id === "sla_compliance_low");
    expect(d).toBeDefined();
    expect(d!.urgency).toBe("high");
  });

  it("adds critical urgency when compliance is 65", () => {
    const analytics = makeAnalytics({ sla: { compliance_pct: 65, breach_trend: [], operator_sla: [], breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 }, breached_total: 8 } });
    const result = generateExecutiveBrief(makeInput({ analytics }));
    const d = result.top_decisions.find((d) => d.id === "sla_compliance_low");
    expect(d!.urgency).toBe("critical");
  });

  it("does NOT add decision when compliance is 90", () => {
    const result = generateExecutiveBrief(makeInput());
    const d = result.top_decisions.find((d) => d.id === "sla_compliance_low");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: overloaded operators
// ---------------------------------------------------------------------------

describe("rule — overloaded operators", () => {
  it("adds decision when overloaded_operators_count > 0", () => {
    const analytics = makeAnalytics({
      queue_signals: { sla_breached_count: 0, overloaded_operators_count: 2, followups_due_today: 0 },
    });
    const result = generateExecutiveBrief(makeInput({ analytics }));
    const d = result.top_decisions.find((d) => d.id === "operators_overloaded");
    expect(d).toBeDefined();
    expect(d!.action_type).toBe("rebalance_workload");
  });

  it("does NOT add decision when no overloaded operators", () => {
    const result = generateExecutiveBrief(makeInput());
    const d = result.top_decisions.find((d) => d.id === "operators_overloaded");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: high concentration
// ---------------------------------------------------------------------------

describe("rule — high concentration", () => {
  it("adds decision for critical client with >40% concentration", () => {
    const client: Partial<RankedClient> = {
      company_id: "c1",
      company_name: "AcquaCorp",
      concentration_pct: 52,
      pending_amount: 150_000,
      currency_code: "USD",
      oldest_days: 95,
      dominant_bucket: "90+" as const,
      risk_assessment: { score: 80, level: "critical", aging_component: 0, concentration_component: 0, behavior_component: 0, contact_component: 0 },
      instruction: "escalar",
      instruction_label: "Escalar",
      reason: "Test",
      evidence: [],
      collection_status: null,
      last_action_date: null,
      has_active_promise: false,
      promise_date: null,
      promise_amount: null,
      promise_currency: null,
      invoice_count: 5,
      score: 80,
      recommendation: { action: "escalate", channel: null, urgency: "critical", rationale: [], confidence: 0.9, next_suggested_at: null },
      follow_up_result: { next_follow_up_at: null, sla_status: "critical", pending_action: "Escalar", snoozed_until: null, follow_up_reason: "Test", operational_state: "escalated_active" },
    };
    const result = generateExecutiveBrief(makeInput({ ranked_clients: [client as RankedClient] }));
    const d = result.top_decisions.find((d) => d.id === "concentration_critical");
    expect(d).toBeDefined();
    expect(d!.urgency).toBe("critical");
    expect(d!.linked_customer_id).toBe("c1");
  });

  it("does NOT trigger for <40% concentration", () => {
    const client: Partial<RankedClient> = {
      company_id: "c2",
      company_name: "Otro",
      concentration_pct: 30,
      pending_amount: 50_000,
      currency_code: "USD",
      oldest_days: 90,
      dominant_bucket: "90+",
      risk_assessment: { score: 80, level: "critical", aging_component: 0, concentration_component: 0, behavior_component: 0, contact_component: 0 },
      instruction: "escalar",
      instruction_label: "Escalar",
      reason: "Test",
      evidence: [],
      collection_status: null,
      last_action_date: null,
      has_active_promise: false,
      promise_date: null,
      promise_amount: null,
      promise_currency: null,
      invoice_count: 3,
      score: 75,
      recommendation: { action: "escalate", channel: null, urgency: "critical", rationale: [], confidence: 0.9, next_suggested_at: null },
      follow_up_result: { next_follow_up_at: null, sla_status: "critical", pending_action: "Escalar", snoozed_until: null, follow_up_reason: "Test", operational_state: "escalated_active" },
    };
    const result = generateExecutiveBrief(makeInput({ ranked_clients: [client as RankedClient] }));
    const d = result.top_decisions.find((d) => d.id === "concentration_critical");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Top decisions ordering
// ---------------------------------------------------------------------------

describe("top decisions ordering", () => {
  it("critical decisions come before high", () => {
    // Score low (high) + stale guard (critical via null analytics)
    const input = makeInput({
      portfolio_score: makeScore({ score: 50 }),
      analytics: null,
    });
    const result = generateExecutiveBrief(input);
    const decisions = result.top_decisions;
    expect(decisions.length).toBeGreaterThan(1);
    // First must be critical or equal urgency
    const firstUrgency = decisions[0]!.urgency;
    expect(firstUrgency === "critical" || firstUrgency === "high").toBe(true);
    // No critical after high
    let sawHigh = false;
    for (const d of decisions) {
      if (d.urgency === "high") sawHigh = true;
      if (sawHigh && d.urgency === "critical") {
        expect.fail("Critical decision found after high");
      }
    }
  });

  it("ranks decisions sequentially starting at 1", () => {
    const result = generateExecutiveBrief(makeInput({
      portfolio_score: makeScore({ score: 45 }),
      analytics: makeAnalytics({ sla: { compliance_pct: 70, breach_trend: [], operator_sla: [], breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 }, breached_total: 3 } }),
    }));
    result.top_decisions.forEach((d, i) => {
      expect(d.rank).toBe(i + 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Fallback without predictive snapshot
// ---------------------------------------------------------------------------

describe("fallback without predictive snapshot", () => {
  it("produces a valid brief when predictive is null", () => {
    const result = generateExecutiveBrief(makeInput({ predictive: null }));
    expect(result.top_decisions).toBeDefined();
    expect(result.source_signals).not.toContain("predictive_snapshot");
    expect(result.confidence_pct).toBeLessThan(100);
  });

  it("skips forecast rule when predictive is null", () => {
    const result = generateExecutiveBrief(makeInput({ predictive: null }));
    const d = result.top_decisions.find((d) => d.id === "forecast_deterioration");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Automation dedupe rule
// ---------------------------------------------------------------------------

describe("rule — automation dedupe high", () => {
  it("adds decision when last run has >=5 deduped actions", () => {
    const run: Partial<AutomationRunRow> = {
      id: "r1",
      workspace_company_id: "w1",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      rules_evaluated: 7,
      actions_generated: 7,
      actions_executed: 2,
      actions_deduped: 5,
      dry_run: false,
      status: "completed",
      error_message: null,
    };
    const result = generateExecutiveBrief(makeInput({ automation_runs: [run as AutomationRunRow] }));
    const d = result.top_decisions.find((d) => d.id === "automation_dedupe_high");
    expect(d).toBeDefined();
    expect(d!.action_type).toBe("review_pipeline");
  });

  it("does NOT add decision when deduped < 5", () => {
    const run: Partial<AutomationRunRow> = {
      id: "r2",
      workspace_company_id: "w1",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      rules_evaluated: 3,
      actions_generated: 3,
      actions_executed: 3,
      actions_deduped: 0,
      dry_run: false,
      status: "completed",
      error_message: null,
    };
    const result = generateExecutiveBrief(makeInput({ automation_runs: [run as AutomationRunRow] }));
    const d = result.top_decisions.find((d) => d.id === "automation_dedupe_high");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Pipeline signals
// ---------------------------------------------------------------------------

describe("rule — pipelines unhealthy", () => {
  it("adds decision when a pipeline is not ok", () => {
    const result = generateExecutiveBrief(makeInput({
      pipeline_signals: [{ name: "zeta_saldos", ok: false, stale: false }],
    }));
    const d = result.top_decisions.find((d) => d.id === "pipelines_unhealthy");
    expect(d).toBeDefined();
    expect(d!.urgency).toBe("high");
  });

  it("adds decision when a pipeline is stale", () => {
    const result = generateExecutiveBrief(makeInput({
      pipeline_signals: [{ name: "zeta_vouchers", ok: true, stale: true }],
    }));
    const d = result.top_decisions.find((d) => d.id === "pipelines_unhealthy");
    expect(d).toBeDefined();
  });

  it("does NOT add decision when all pipelines are ok and fresh", () => {
    const result = generateExecutiveBrief(makeInput({
      pipeline_signals: [{ name: "zeta_saldos", ok: true, stale: false }],
    }));
    const d = result.top_decisions.find((d) => d.id === "pipelines_unhealthy");
    expect(d).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe("confidence_pct", () => {
  it("is 100 when all signals are present and healthy", () => {
    const result = generateExecutiveBrief(makeInput({
      pipeline_signals: [{ name: "a", ok: true, stale: false }],
      predictive: {
        generated_at: new Date().toISOString(),
        recovery_likelihoods: [],
        portfolio_forecasts: [],
        sla_forecasts: [],
        operator_load_forecasts: [],
        recovery_opportunities: [],
        executive_prediction_summary: "",
        metrics: { predicted_critical_cases: 0, projected_sla_breaches_7d: 0, recovery_opportunities_count: 0, avg_recovery_likelihood_pct: 75, generation_ms: 100 },
        source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
      },
    }));
    expect(result.confidence_pct).toBe(100);
  });

  it("decreases when portfolio_score is null", () => {
    const full = generateExecutiveBrief(makeInput());
    const partial = generateExecutiveBrief(makeInput({ portfolio_score: null }));
    expect(partial.confidence_pct).toBeLessThan(full.confidence_pct);
  });

  it("never goes below 20", () => {
    const result = generateExecutiveBrief(makeInput({
      portfolio_score: null,
      analytics: null,
      predictive: null,
      pipeline_signals: [{ name: "a", ok: false, stale: true }],
    }));
    expect(result.confidence_pct).toBeGreaterThanOrEqual(20);
  });
});
