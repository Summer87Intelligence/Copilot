/**
 * Phase 5D — Tests for Strategic Learning Layer engines.
 */

import { describe, expect, it } from "vitest";
import { detectOutcomes } from "./outcome-detection-engine";
import { computeActionEffectiveness } from "./action-effectiveness-engine";
import { computeOperatorEffectiveness } from "./operator-effectiveness-engine";
import { computeAutomationEffectiveness } from "./automation-effectiveness-engine";
import { computeForecastCalibration } from "./forecast-calibration-engine";
import { generateStrategyRecommendations } from "./strategy-recommendation-engine";
import { generateStrategicLearningSnapshot } from "./strategic-learning-orchestrator";
import type {
  StrategicLearningContext,
  ActionEffectivenessSnapshot,
  OperatorEffectivenessSnapshot,
  AutomationEffectivenessSnapshot,
  ForecastCalibrationSnapshot,
} from "./learning-types";
import type {
  DECollectionAction,
  DEOperationalStateRow,
  DERecentReceipt,
  DecisionEngineDataBundle,
  OperationalAnalyticsSnapshot,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2024-06-15T12:00:00.000Z";

function makeBundle(
  overrides: Partial<DecisionEngineDataBundle> = {}
): DecisionEngineDataBundle {
  return {
    pendingInvoices:   [],
    recentInvoices:    [],
    recentReceipts:    [],
    companies:         [],
    recentActions:     [],
    operationalStates: [],
    pendingFollowUps:  [],
    loadedAt:          NOW,
    ...overrides,
  };
}

function makeReceipt(
  companyId: string,
  amount: number,
  date: string
): DERecentReceipt {
  return {
    id:            `receipt-${companyId}-${date}`,
    company_id:    companyId,
    currency_code: "UYU",
    amount,
    receipt_date:  date,
  };
}

function makeAction(
  id: string,
  companyId: string,
  actionType: string,
  promiseDate: string | null = null,
  contactDate: string | null = null
): DECollectionAction {
  return {
    id,
    company_id:      companyId,
    action_type:     actionType,
    status:          "completed",
    priority:        "medium",
    notes:           null,
    promise_date:    promiseDate,
    promise_amount:  promiseDate ? 1000 : null,
    promise_currency: promiseDate ? "UYU" : null,
    contact_date:    contactDate,
    created_at:      "2024-06-01T10:00:00.000Z",
  };
}

function makeOperationalState(
  customerId: string,
  machineState: DEOperationalStateRow["machine_state"],
  assignedUserId: string | null = null
): DEOperationalStateRow {
  return {
    customer_id:          customerId,
    current_risk:         "medium",
    machine_state:        machineState,
    legacy_follow_up_state: "monitor",
    previous_state:       null,
    transitioned_at:      "2024-06-10T09:00:00.000Z",
    transition_reason:    null,
    breached_sla:         false,
    next_follow_up_at:    null,
    last_contact_at:      null,
    active_promise:       false,
    escalated:            false,
    updated_at:           NOW,
    assigned_user_id:     assignedUserId,
    assigned_at:          assignedUserId ? NOW : null,
    assigned_by:          null,
    assignment_note:      null,
  };
}

function makeContext(
  overrides: Partial<StrategicLearningContext> = {}
): StrategicLearningContext {
  return {
    bundle:           makeBundle(),
    analytics:        null,
    automationRuns:   [],
    automationActions: [],
    predictive:       null,
    existingOutcomes: [],
    loadedAt:         NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Outcome Detection Engine
// ---------------------------------------------------------------------------

describe("detectOutcomes", () => {
  it("detects payment_received from receipts with known company_id", () => {
    const receipts = [makeReceipt("company-1", 5000, "2024-06-14")];
    const result = detectOutcomes({
      recentReceipts:    receipts,
      recentActions:     [],
      operationalStates: [],
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.detected).toHaveLength(1);
    expect(result.detected[0]!.outcome_type).toBe("payment_received");
    expect(result.detected[0]!.customer_id).toBe("company-1");
    expect(result.detected[0]!.outcome_amount).toBe(5000);
  });

  it("ignores receipts with null company_id", () => {
    const receipts = [{ id: "r1", company_id: null, currency_code: "UYU", amount: 100, receipt_date: NOW }];
    const result = detectOutcomes({
      recentReceipts:    receipts as DERecentReceipt[],
      recentActions:     [],
      operationalStates: [],
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.detected).toHaveLength(0);
  });

  it("detects recovered outcome from machine_state=recovered", () => {
    const states = [makeOperationalState("c1", "recovered")];
    const result = detectOutcomes({
      recentReceipts:    [],
      recentActions:     [],
      operationalStates: states,
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.detected).toHaveLength(1);
    expect(result.detected[0]!.outcome_type).toBe("recovered");
    expect(result.detected[0]!.customer_id).toBe("c1");
    expect(result.detected[0]!.source_type).toBe("follow_up");
  });

  it("detects escalated outcome from machine_state=escalated", () => {
    const states = [makeOperationalState("c2", "escalated")];
    const result = detectOutcomes({
      recentReceipts:    [],
      recentActions:     [],
      operationalStates: states,
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.detected[0]!.outcome_type).toBe("escalated");
  });

  it("detects escalated for legal_review state", () => {
    const states = [makeOperationalState("c3", "legal_review")];
    const result = detectOutcomes({
      recentReceipts:    [],
      recentActions:     [],
      operationalStates: states,
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.detected[0]!.outcome_type).toBe("escalated");
  });

  it("detects promise_kept when receipt follows action with promise_date", () => {
    const action = makeAction("a1", "c1", "llamar_hoy", "2024-06-10", null);
    const receipt = makeReceipt("c1", 2000, "2024-06-11"); // within 7d of promise
    const result = detectOutcomes({
      recentReceipts:    [receipt],
      recentActions:     [action],
      operationalStates: [],
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    const promiseKept = result.detected.filter((o) => o.outcome_type === "promise_kept");
    expect(promiseKept).toHaveLength(1);
    expect(promiseKept[0]!.customer_id).toBe("c1");
  });

  it("detects promise_broken when promise date passed >3 days ago with no receipt", () => {
    const action = makeAction("a2", "c2", "llamar_hoy", "2024-06-05", null); // 10d before NOW
    const result = detectOutcomes({
      recentReceipts:    [],
      recentActions:     [action],
      operationalStates: [],
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    const broken = result.detected.filter((o) => o.outcome_type === "promise_broken");
    expect(broken).toHaveLength(1);
  });

  it("skips outcomes already in existingOutcomes", () => {
    const receipt = makeReceipt("c1", 5000, "2024-06-14");
    const existingOutcome = {
      id:                   "eo1",
      workspace_company_id: "ws-1",
      customer_id:          "c1",
      source_type:          "manual_action" as const,
      source_id:            receipt.id,
      outcome_type:         "payment_received" as const,
      outcome_amount:       5000,
      currency_code:        "UYU",
      observed_at:          receipt.receipt_date,
      metadata:             {},
      created_at:           NOW,
    };
    const result = detectOutcomes({
      recentReceipts:    [receipt],
      recentActions:     [],
      operationalStates: [],
      completedFollowUps: [],
      existingOutcomes:  [existingOutcome],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.detected).toHaveLength(0);
  });

  it("returns sources_evaluated count", () => {
    const result = detectOutcomes({
      recentReceipts:    [makeReceipt("c1", 100, NOW)],
      recentActions:     [makeAction("a1", "c1", "llamar_hoy")],
      operationalStates: [makeOperationalState("c1", "monitoring")],
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    expect(result.sources_evaluated).toBeGreaterThan(0);
  });

  it("deduplicates within the same run", () => {
    // Action with promise + receipt should yield promise_kept, not also payment_received for same entity
    // (They're different source_ids so both are valid — dedupe prevents same key twice)
    const action = makeAction("a1", "c1", "llamar_hoy", "2024-06-10");
    const receipt = makeReceipt("c1", 2000, "2024-06-11");
    const result = detectOutcomes({
      recentReceipts:    [receipt],
      recentActions:     [action],
      operationalStates: [],
      completedFollowUps: [],
      existingOutcomes:  [],
      workspaceCompanyId: "ws-1",
      nowIso:            NOW,
    });
    const keys = result.detected.map((o) => o.dedupe_key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});

// ---------------------------------------------------------------------------
// Action Effectiveness Engine
// ---------------------------------------------------------------------------

describe("computeActionEffectiveness", () => {
  it("returns insufficient when no actions", () => {
    const snapshot = computeActionEffectiveness(makeContext());
    expect(snapshot.data_source).toBe("insufficient");
    expect(snapshot.by_action_type).toHaveLength(0);
  });

  it("returns proxy when ≥5 actions and no formal outcomes", () => {
    const actions = Array.from({ length: 6 }, (_, i) =>
      makeAction(`a${i}`, `c${i}`, "llamar_hoy")
    );
    const ctx = makeContext({ bundle: makeBundle({ recentActions: actions }) });
    const snapshot = computeActionEffectiveness(ctx);
    expect(snapshot.data_source).toBe("proxy");
    expect(snapshot.by_action_type.length).toBeGreaterThan(0);
  });

  it("computes payment_within_7d_count correctly", () => {
    const action = makeAction("a1", "c1", "llamar_hoy", null, "2024-06-08");
    const receipt = makeReceipt("c1", 1000, "2024-06-12"); // 4 days after contact
    const actions = [action, makeAction("a2", "c2", "llamar_hoy"), makeAction("a3", "c3", "llamar_hoy"), makeAction("a4", "c4", "llamar_hoy"), makeAction("a5", "c5", "llamar_hoy")];
    const receipts = [receipt];
    const ctx = makeContext({
      bundle: makeBundle({ recentActions: actions, recentReceipts: receipts }),
    });
    const snapshot = computeActionEffectiveness(ctx);
    const row = snapshot.by_action_type.find((r) => r.action_type === "llamar_hoy");
    expect(row).toBeDefined();
    expect(row!.payment_within_7d_count).toBe(1);
  });

  it("uses formal outcomes when ≥10 exist", () => {
    const outcomes = Array.from({ length: 12 }, (_, i) => ({
      id:                   `o${i}`,
      workspace_company_id: "ws-1",
      customer_id:          `c${i}`,
      source_type:          "manual_action" as const,
      source_id:            `a${i}`,
      outcome_type:         "payment_received" as const,
      outcome_amount:       1000,
      currency_code:        "UYU",
      observed_at:          NOW,
      metadata:             {},
      created_at:           NOW,
    }));
    const ctx = makeContext({ existingOutcomes: outcomes });
    const snapshot = computeActionEffectiveness(ctx);
    expect(snapshot.data_source).toBe("outcomes");
  });

  it("sorts by effectiveness_pct descending", () => {
    const actions = [
      ...Array.from({ length: 3 }, (_, i) => makeAction(`al${i}`, `cl${i}`, "llamar_hoy", null, "2024-06-01")),
      ...Array.from({ length: 3 }, (_, i) => makeAction(`ae${i}`, `ce${i}`, "escalar", null, "2024-06-01")),
    ];
    const receipts = [
      makeReceipt("cl0", 100, "2024-06-04"),
      makeReceipt("cl1", 100, "2024-06-04"),
      makeReceipt("cl2", 100, "2024-06-04"),
    ];
    const ctx = makeContext({
      bundle: makeBundle({ recentActions: actions, recentReceipts: receipts }),
    });
    const snapshot = computeActionEffectiveness(ctx);
    // llamar_hoy should be first (100% effectiveness)
    expect(snapshot.top_performing_action).toBe("llamar_hoy");
    expect(snapshot.by_action_type[0]!.effectiveness_pct).toBeGreaterThanOrEqual(
      snapshot.by_action_type[1]!.effectiveness_pct
    );
  });
});

// ---------------------------------------------------------------------------
// Operator Effectiveness Engine
// ---------------------------------------------------------------------------

describe("computeOperatorEffectiveness", () => {
  it("returns insufficient when no analytics", () => {
    const snapshot = computeOperatorEffectiveness(makeContext());
    expect(snapshot.data_source).toBe("insufficient");
    expect(snapshot.by_operator).toHaveLength(0);
  });

  it("groups states by assigned_user_id", () => {
    const states = [
      makeOperationalState("c1", "recovered", "user-1"),
      makeOperationalState("c2", "monitoring", "user-1"),
      makeOperationalState("c3", "recovered", "user-2"),
    ];
    const analytics: OperationalAnalyticsSnapshot = {
      generated_at: NOW,
      global: {
        active_cases: 3, unassigned_cases: 0, breached_sla_cases: 0,
        avg_time_to_first_action_hours: null, avg_resolution_time_hours: null,
        critical_open: 0, recovered_today: 1, followups_due_today: 0, operational_backlog: 0,
      },
      operators: [
        {
          user_id: "user-1", display_name: "Ana García",
          assigned_total: 2, active_critical: 0, sla_breaches: 0,
          completed_today: 1, avg_response_time_hours: 2, avg_resolution_time_hours: null,
          overload_score: 0, workload_band: "normal", workload_score: 10, critical_ratio: 0, overdue_ratio: 0,
        },
        {
          user_id: "user-2", display_name: "Carlos López",
          assigned_total: 1, active_critical: 0, sla_breaches: 0,
          completed_today: 0, avg_response_time_hours: null, avg_resolution_time_hours: null,
          overload_score: 0, workload_band: "normal", workload_score: 5, critical_ratio: 0, overdue_ratio: 0,
        },
      ],
      sla: {
        compliance_pct: 95, breach_trend: [], operator_sla: [], breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 }, breached_total: 0,
      },
      queue_signals: { sla_breached_count: 0, overloaded_operators_count: 0, followups_due_today: 0 },
    };
    const ctx = makeContext({
      bundle: makeBundle({ operationalStates: states }),
      analytics,
    });
    const snapshot = computeOperatorEffectiveness(ctx);
    expect(snapshot.by_operator).toHaveLength(2);
    const ana = snapshot.by_operator.find((o) => o.user_id === "user-1");
    expect(ana).toBeDefined();
    expect(ana!.recovered_cases).toBe(1);
    expect(ana!.total_cases_handled).toBe(2);
    expect(ana!.recovery_rate_pct).toBe(50);
  });

  it("sorts by recovery_rate_pct descending", () => {
    const states = [
      makeOperationalState("c1", "recovered", "user-1"),
      makeOperationalState("c2", "recovered", "user-1"),
      makeOperationalState("c3", "monitoring", "user-2"),
    ];
    const analytics: OperationalAnalyticsSnapshot = {
      generated_at: NOW,
      global: { active_cases: 3, unassigned_cases: 0, breached_sla_cases: 0, avg_time_to_first_action_hours: null, avg_resolution_time_hours: null, critical_open: 0, recovered_today: 0, followups_due_today: 0, operational_backlog: 0 },
      operators: [
        { user_id: "user-1", display_name: "User One", assigned_total: 2, active_critical: 0, sla_breaches: 0, completed_today: 0, avg_response_time_hours: null, avg_resolution_time_hours: null, overload_score: 0, workload_band: "normal", workload_score: 0, critical_ratio: 0, overdue_ratio: 0 },
        { user_id: "user-2", display_name: "User Two", assigned_total: 1, active_critical: 0, sla_breaches: 0, completed_today: 0, avg_response_time_hours: null, avg_resolution_time_hours: null, overload_score: 0, workload_band: "normal", workload_score: 0, critical_ratio: 0, overdue_ratio: 0 },
      ],
      sla: { compliance_pct: 100, breach_trend: [], operator_sla: [], breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 }, breached_total: 0 },
      queue_signals: { sla_breached_count: 0, overloaded_operators_count: 0, followups_due_today: 0 },
    };
    const ctx = makeContext({ bundle: makeBundle({ operationalStates: states }), analytics });
    const snapshot = computeOperatorEffectiveness(ctx);
    expect(snapshot.by_operator[0]!.recovery_rate_pct).toBeGreaterThanOrEqual(
      snapshot.by_operator[1]!.recovery_rate_pct
    );
    expect(snapshot.top_operator_id).toBe("user-1");
  });
});

// ---------------------------------------------------------------------------
// Automation Effectiveness Engine
// ---------------------------------------------------------------------------

describe("computeAutomationEffectiveness", () => {
  it("returns empty snapshot when no automation actions", () => {
    const snapshot = computeAutomationEffectiveness(makeContext());
    expect(snapshot.total_rules_evaluated).toBe(0);
    expect(snapshot.noisy_rules).toHaveLength(0);
    expect(snapshot.all_rules).toHaveLength(0);
  });

  it("computes dedupe_ratio correctly", () => {
    const actions = [
      { id: "aa1", automation_run_id: "run1", customer_id: "c1", rule_key: "sla_breach_48h", action_type: "create_follow_up" as const, action_payload: {}, executed: true, executed_at: NOW, execution_result: null, dedupe_key: "k1", created_at: NOW },
      { id: "aa2", automation_run_id: "run1", customer_id: "c2", rule_key: "sla_breach_48h", action_type: "create_follow_up" as const, action_payload: {}, executed: false, executed_at: null, execution_result: null, dedupe_key: "k2", created_at: NOW },
      { id: "aa3", automation_run_id: "run1", customer_id: "c3", rule_key: "sla_breach_48h", action_type: "create_follow_up" as const, action_payload: {}, executed: false, executed_at: null, execution_result: null, dedupe_key: "k3", created_at: NOW },
    ];
    const ctx = makeContext({ automationActions: actions });
    const snapshot = computeAutomationEffectiveness(ctx);
    const row = snapshot.all_rules.find((r) => r.rule_key === "sla_breach_48h");
    expect(row).toBeDefined();
    expect(row!.total_triggered).toBe(3);
    expect(row!.executed_count).toBe(1);
    expect(row!.deduped_count).toBe(2);
    expect(row!.dedupe_ratio).toBeCloseTo(0.67, 2);
  });

  it("assigns noise_level=critical when dedupe_ratio >= 0.6", () => {
    const actions = Array.from({ length: 10 }, (_, i) => ({
      id: `aa${i}`, automation_run_id: "run1", customer_id: `c${i}`, rule_key: "no_contact_14d",
      action_type: "create_follow_up" as const, action_payload: {}, executed: i < 2,
      executed_at: i < 2 ? NOW : null, execution_result: null, dedupe_key: `k${i}`, created_at: NOW,
    }));
    const ctx = makeContext({ automationActions: actions });
    const snapshot = computeAutomationEffectiveness(ctx);
    const row = snapshot.all_rules.find((r) => r.rule_key === "no_contact_14d");
    expect(row!.noise_level).toBe("critical");
    expect(snapshot.noisy_rules.length).toBeGreaterThan(0);
  });

  it("assigns noise_level=low when dedupe_ratio < 0.2", () => {
    const actions = Array.from({ length: 5 }, (_, i) => ({
      id: `aa${i}`, automation_run_id: "run1", customer_id: `c${i}`, rule_key: "critical_unowned_2h",
      action_type: "escalate_case" as const, action_payload: {}, executed: i < 5,
      executed_at: i < 5 ? NOW : null, execution_result: null, dedupe_key: `k${i}`, created_at: NOW,
    }));
    const ctx = makeContext({ automationActions: actions });
    const snapshot = computeAutomationEffectiveness(ctx);
    const row = snapshot.all_rules.find((r) => r.rule_key === "critical_unowned_2h");
    expect(row!.noise_level).toBe("low");
  });

  it("computes overall_dedupe_ratio across all rules", () => {
    const actions = [
      { id: "aa1", automation_run_id: "r1", customer_id: "c1", rule_key: "rule_a", action_type: "create_follow_up" as const, action_payload: {}, executed: true, executed_at: NOW, execution_result: null, dedupe_key: "k1", created_at: NOW },
      { id: "aa2", automation_run_id: "r1", customer_id: "c2", rule_key: "rule_a", action_type: "create_follow_up" as const, action_payload: {}, executed: false, executed_at: null, execution_result: null, dedupe_key: "k2", created_at: NOW },
    ];
    const ctx = makeContext({ automationActions: actions });
    const snapshot = computeAutomationEffectiveness(ctx);
    expect(snapshot.overall_dedupe_ratio).toBeCloseTo(0.5, 2);
  });
});

// ---------------------------------------------------------------------------
// Forecast Calibration Engine
// ---------------------------------------------------------------------------

describe("computeForecastCalibration", () => {
  it("returns insufficient when no predictive snapshot", () => {
    const snapshot = computeForecastCalibration(makeContext());
    expect(snapshot.data_source).toBe("insufficient");
    expect(snapshot.calibration_score).toBe(50);
  });

  it("returns score=50 neutral when no recovery likelihoods", () => {
    const ctx = makeContext({
      predictive: {
        generated_at: NOW, recovery_likelihoods: [], portfolio_forecasts: [], sla_forecasts: [],
        operator_load_forecasts: [], recovery_opportunities: [], executive_prediction_summary: "",
        metrics: { predicted_critical_cases: 0, projected_sla_breaches_7d: 0, recovery_opportunities_count: 0, avg_recovery_likelihood_pct: 0, generation_ms: 0 },
        source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
      },
    });
    const snapshot = computeForecastCalibration(ctx);
    expect(snapshot.calibration_score).toBe(50);
  });

  it("identifies overestimated segment when actual < predicted", () => {
    const likelihoods = Array.from({ length: 5 }, (_, i) => ({
      customer_id: `c${i}`, customer_name: `C${i}`,
      probability_pct: 75, band: "high" as const, confidence_pct: 80,
      main_drivers: [], negative_drivers: [], recommended_recovery_strategy: "", expected_recovery_window_days: "7-14",
    }));
    // No receipts → actual_pct = 0% vs predicted 75% → overestimated
    const ctx = makeContext({
      predictive: {
        generated_at: NOW, recovery_likelihoods: likelihoods, portfolio_forecasts: [],
        sla_forecasts: [], operator_load_forecasts: [], recovery_opportunities: [],
        executive_prediction_summary: "", metrics: { predicted_critical_cases: 0, projected_sla_breaches_7d: 0, recovery_opportunities_count: 0, avg_recovery_likelihood_pct: 75, generation_ms: 0 },
        source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
      },
    });
    const snapshot = computeForecastCalibration(ctx);
    expect(snapshot.overestimated_segments).toHaveLength(1);
    expect(snapshot.overestimated_segments[0]!.direction).toBe("overestimated");
  });

  it("identifies underestimated segment when actual > predicted", () => {
    const likelihoods = Array.from({ length: 5 }, (_, i) => ({
      customer_id: `c${i}`, customer_name: `C${i}`,
      probability_pct: 10, band: "very_low" as const, confidence_pct: 80,
      main_drivers: [], negative_drivers: [], recommended_recovery_strategy: "", expected_recovery_window_days: "30+",
    }));
    // All paid → actual_pct = 100% vs predicted 10% → underestimated
    const receipts = likelihoods.map((l) => makeReceipt(l.customer_id, 100, "2024-06-14"));
    const ctx = makeContext({
      bundle: makeBundle({ recentReceipts: receipts }),
      predictive: {
        generated_at: NOW, recovery_likelihoods: likelihoods, portfolio_forecasts: [],
        sla_forecasts: [], operator_load_forecasts: [], recovery_opportunities: [],
        executive_prediction_summary: "", metrics: { predicted_critical_cases: 0, projected_sla_breaches_7d: 0, recovery_opportunities_count: 0, avg_recovery_likelihood_pct: 10, generation_ms: 0 },
        source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
      },
    });
    const snapshot = computeForecastCalibration(ctx);
    expect(snapshot.underestimated_segments).toHaveLength(1);
    expect(snapshot.underestimated_segments[0]!.direction).toBe("underestimated");
  });

  it("calibration_score decreases with large deltas", () => {
    // 5 high-band customers, none paid → delta = -75pp → low score
    const likelihoods = Array.from({ length: 5 }, (_, i) => ({
      customer_id: `c${i}`, customer_name: `C${i}`, probability_pct: 80,
      band: "high" as const, confidence_pct: 80, main_drivers: [], negative_drivers: [],
      recommended_recovery_strategy: "", expected_recovery_window_days: "7-14",
    }));
    const ctx = makeContext({
      predictive: {
        generated_at: NOW, recovery_likelihoods: likelihoods, portfolio_forecasts: [],
        sla_forecasts: [], operator_load_forecasts: [], recovery_opportunities: [],
        executive_prediction_summary: "",
        metrics: { predicted_critical_cases: 0, projected_sla_breaches_7d: 0, recovery_opportunities_count: 0, avg_recovery_likelihood_pct: 80, generation_ms: 0 },
        source_snapshot_ids: { analytics_generated_at: null, queue_generated_at: null },
      },
    });
    const snapshot = computeForecastCalibration(ctx);
    expect(snapshot.calibration_score).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Strategy Recommendation Engine
// ---------------------------------------------------------------------------

describe("generateStrategyRecommendations", () => {
  function insufficientSnapshots() {
    const action: ActionEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 0,
      by_action_type: [], top_performing_action: null, worst_performing_action: null,
      insight: "", data_source: "insufficient",
    };
    const operator: OperatorEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 0,
      by_operator: [], top_operator_id: null, insight: "", data_source: "insufficient",
    };
    const automation: AutomationEffectivenessSnapshot = {
      generated_at: NOW, total_rules_evaluated: 0, noisy_rules: [], effective_rules: [],
      all_rules: [], overall_dedupe_ratio: 0, insight: "",
    };
    const calibration: ForecastCalibrationSnapshot = {
      generated_at: NOW, calibration_score: 50, overestimated_segments: [],
      underestimated_segments: [], all_segments: [], recommended_weight_adjustments: [],
      insight: "", data_source: "insufficient",
    };
    return { action, operator, automation, calibration };
  }

  it("returns empty array when all data sources insufficient", () => {
    const { action, operator, automation, calibration } = insufficientSnapshots();
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    expect(recs).toHaveLength(0);
  });

  it("generates top-action amplify recommendation when best action >50%", () => {
    const { operator, automation, calibration } = insufficientSnapshots();
    const action: ActionEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 10, data_source: "proxy",
      by_action_type: [
        { action_type: "llamar_hoy", action_label: "Llamar hoy", total_actions: 10, payment_within_7d_count: 7, promise_kept_count: 0, promise_broken_count: 0, no_response_count: 0, recovered_count: 7, avg_recovery_amount: 1000, avg_days_to_payment: 3, effectiveness_pct: 70, sample_size: 10 },
        { action_type: "escalar", action_label: "Escalar", total_actions: 5, payment_within_7d_count: 0, promise_kept_count: 0, promise_broken_count: 2, no_response_count: 3, recovered_count: 0, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 0, sample_size: 5 },
      ],
      top_performing_action: "llamar_hoy", worst_performing_action: "escalar",
      insight: "",
    };
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    const amplify = recs.find((r) => r.category === "action" && r.title.includes("Ampliar"));
    expect(amplify).toBeDefined();
    expect(amplify!.actionable).toBe(true);
  });

  it("generates worst-action reduce recommendation when worst <20%", () => {
    const { operator, automation, calibration } = insufficientSnapshots();
    const action: ActionEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 10, data_source: "proxy",
      by_action_type: [
        { action_type: "llamar_hoy", action_label: "Llamar hoy", total_actions: 5, payment_within_7d_count: 3, promise_kept_count: 0, promise_broken_count: 0, no_response_count: 0, recovered_count: 3, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 60, sample_size: 5 },
        { action_type: "escalar", action_label: "Escalar", total_actions: 5, payment_within_7d_count: 0, promise_kept_count: 0, promise_broken_count: 3, no_response_count: 5, recovered_count: 0, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 10, sample_size: 5 },
      ],
      top_performing_action: "llamar_hoy", worst_performing_action: "escalar",
      insight: "",
    };
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    const reduce = recs.find((r) => r.category === "action" && r.title.includes("Revisar"));
    expect(reduce).toBeDefined();
  });

  it("generates noisy automation recommendation when overall ratio >30%", () => {
    const { action, operator, calibration } = insufficientSnapshots();
    const automation: AutomationEffectivenessSnapshot = {
      generated_at: NOW, total_rules_evaluated: 2, overall_dedupe_ratio: 0.5,
      noisy_rules: [
        { rule_key: "sla_breach_48h", rule_label: "Incumplimiento SLA 48h", total_triggered: 10, deduped_count: 5, executed_count: 5, outcomes_positive: 0, dedupe_ratio: 0.5, noise_level: "high", recommendation: "Ajustar" },
      ],
      effective_rules: [], all_rules: [
        { rule_key: "sla_breach_48h", rule_label: "Incumplimiento SLA 48h", total_triggered: 10, deduped_count: 5, executed_count: 5, outcomes_positive: 0, dedupe_ratio: 0.5, noise_level: "high", recommendation: "Ajustar" },
      ],
      insight: "",
    };
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    const automRec = recs.find((r) => r.category === "automation");
    expect(automRec).toBeDefined();
  });

  it("generates low calibration recommendation when score < 70", () => {
    const { action, operator, automation } = insufficientSnapshots();
    const calibration: ForecastCalibrationSnapshot = {
      generated_at: NOW, calibration_score: 45, data_source: "partial",
      overestimated_segments: [{ segment: "Alta probabilidad", predicted_pct: 75, actual_pct: 10, delta_pct: -65, direction: "overestimated", sample_size: 5 }],
      underestimated_segments: [], all_segments: [{ segment: "Alta probabilidad", predicted_pct: 75, actual_pct: 10, delta_pct: -65, direction: "overestimated", sample_size: 5 }],
      recommended_weight_adjustments: ["Reducir peso de alta probabilidad"],
      insight: "",
    };
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    const fcRec = recs.find((r) => r.category === "forecast" && r.title.includes("Recalibrar"));
    expect(fcRec).toBeDefined();
  });

  it("returns max 7 recommendations", () => {
    const action: ActionEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 10, data_source: "proxy",
      by_action_type: [
        { action_type: "llamar_hoy", action_label: "Llamar hoy", total_actions: 10, payment_within_7d_count: 8, promise_kept_count: 0, promise_broken_count: 0, no_response_count: 0, recovered_count: 8, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 80, sample_size: 10 },
        { action_type: "escalar", action_label: "Escalar", total_actions: 10, payment_within_7d_count: 1, promise_kept_count: 0, promise_broken_count: 5, no_response_count: 9, recovered_count: 1, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 10, sample_size: 10 },
      ],
      top_performing_action: "llamar_hoy", worst_performing_action: "escalar", insight: "",
    };
    const operator: OperatorEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 10, data_source: "proxy",
      by_operator: [
        { user_id: "u1", display_name: "Ana", total_cases_handled: 10, recovered_cases: 8, recovery_rate_pct: 80, avg_response_hours: 1, sla_compliance_pct: 95, promise_kept_rate_pct: 70, sample_size: 10, insight: null },
        { user_id: "u2", display_name: "Carlos", total_cases_handled: 10, recovered_cases: 2, recovery_rate_pct: 20, avg_response_hours: 10, sla_compliance_pct: 55, promise_kept_rate_pct: 20, sample_size: 10, insight: "SLA bajo" },
      ],
      top_operator_id: "u1", insight: "",
    };
    const automation: AutomationEffectivenessSnapshot = {
      generated_at: NOW, total_rules_evaluated: 1, overall_dedupe_ratio: 0.6,
      noisy_rules: [{ rule_key: "rule_a", rule_label: "Regla A", total_triggered: 10, deduped_count: 6, executed_count: 4, outcomes_positive: 0, dedupe_ratio: 0.6, noise_level: "critical", recommendation: "Revisar" }],
      effective_rules: [], all_rules: [], insight: "",
    };
    const calibration: ForecastCalibrationSnapshot = {
      generated_at: NOW, calibration_score: 35, data_source: "full",
      overestimated_segments: [{ segment: "Alta probabilidad", predicted_pct: 75, actual_pct: 0, delta_pct: -75, direction: "overestimated", sample_size: 10 }],
      underestimated_segments: [], all_segments: [],
      recommended_weight_adjustments: ["Ajuste 1", "Ajuste 2"],
      insight: "",
    };
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    expect(recs.length).toBeLessThanOrEqual(7);
  });

  it("sorts recommendations by confidence (high first)", () => {
    const action: ActionEffectivenessSnapshot = {
      generated_at: NOW, total_outcomes_analyzed: 10, data_source: "proxy",
      by_action_type: [
        { action_type: "llamar_hoy", action_label: "Llamar hoy", total_actions: 10, payment_within_7d_count: 6, promise_kept_count: 0, promise_broken_count: 0, no_response_count: 0, recovered_count: 6, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 60, sample_size: 10 },
        { action_type: "escalar", action_label: "Escalar", total_actions: 5, payment_within_7d_count: 0, promise_kept_count: 0, promise_broken_count: 3, no_response_count: 5, recovered_count: 0, avg_recovery_amount: 0, avg_days_to_payment: null, effectiveness_pct: 0, sample_size: 5 },
      ],
      top_performing_action: "llamar_hoy", worst_performing_action: "escalar", insight: "",
    };
    const { operator, automation, calibration } = insufficientSnapshots();
    const recs = generateStrategyRecommendations({
      actionEffectiveness:     action,
      operatorEffectiveness:   operator,
      automationEffectiveness: automation,
      forecastCalibration:     calibration,
    });
    const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (let i = 0; i < recs.length - 1; i++) {
      expect(confOrder[recs[i]!.confidence]).toBeLessThanOrEqual(confOrder[recs[i + 1]!.confidence]);
    }
  });
});

// ---------------------------------------------------------------------------
// Strategic Learning Orchestrator (integration)
// ---------------------------------------------------------------------------

describe("generateStrategicLearningSnapshot", () => {
  it("returns a snapshot with all required fields", () => {
    const ctx = makeContext();
    const snapshot = generateStrategicLearningSnapshot(ctx);
    expect(snapshot.generated_at).toBeTruthy();
    expect(typeof snapshot.outcomes_total).toBe("number");
    expect(snapshot.action_effectiveness).toBeDefined();
    expect(snapshot.operator_effectiveness).toBeDefined();
    expect(snapshot.automation_effectiveness).toBeDefined();
    expect(snapshot.forecast_calibration).toBeDefined();
    expect(Array.isArray(snapshot.strategy_recommendations)).toBe(true);
    expect(snapshot.metrics.generation_ms).toBeGreaterThanOrEqual(0);
  });

  it("populates source_snapshot_ids from context", () => {
    const ctx = makeContext();
    const snapshot = generateStrategicLearningSnapshot(ctx);
    expect(snapshot.source_snapshot_ids.bundle_loaded_at).toBe(ctx.bundle.loadedAt);
    expect(snapshot.source_snapshot_ids.analytics_generated_at).toBeNull();
    expect(snapshot.source_snapshot_ids.predictive_generated_at).toBeNull();
  });

  it("counts positive outcomes from existingOutcomes", () => {
    const outcomes = [
      { id: "o1", workspace_company_id: "ws", customer_id: "c1", source_type: "manual_action" as const, source_id: "a1", outcome_type: "payment_received" as const, outcome_amount: null, currency_code: null, observed_at: NOW, metadata: {}, created_at: NOW },
      { id: "o2", workspace_company_id: "ws", customer_id: "c1", source_type: "manual_action" as const, source_id: "a2", outcome_type: "escalated" as const, outcome_amount: null, currency_code: null, observed_at: NOW, metadata: {}, created_at: NOW },
    ];
    const ctx = makeContext({ existingOutcomes: outcomes });
    const snapshot = generateStrategicLearningSnapshot(ctx);
    expect(snapshot.metrics.positive_outcomes).toBe(1); // only payment_received
    expect(snapshot.outcomes_total).toBe(2);
  });
});
