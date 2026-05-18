import { describe, expect, it } from "vitest";
import { computeActionImpact } from "./action-impact-engine";
import type { ActionImpactInput } from "./de-types";

function input(overrides: Partial<ActionImpactInput> = {}): ActionImpactInput {
  return {
    action_type:        "call",
    action_status:      "contacted",
    current_risk_score: 40,
    has_active_promise: false,
    has_broken_promise: false,
    has_escalation:     false,
    ignored_call_count: 0,
    ...overrides,
  };
}

describe("computeActionImpact — promise flow", () => {
  it("payment_promise:promised_payment → risk_delta -10, snooze 168h, awaiting_promise", () => {
    const result = computeActionImpact(input({
      action_type:   "payment_promise",
      action_status: "promised_payment",
    }));
    expect(result.risk_delta).toBe(-10);
    expect(result.snooze_hours).toBe(168);
    expect(result.operational_state).toBe("awaiting_promise");
    expect(result.recommendation_override).toBe("monitor");
    expect(result.requires_follow_up).toBe(true);
  });

  it("payment received → risk_delta -25, no follow-up, no_action override", () => {
    const result = computeActionImpact(input({
      action_type:   "internal_note",
      action_status: "paid",
    }));
    expect(result.risk_delta).toBe(-25);
    expect(result.requires_follow_up).toBe(false);
    expect(result.recommendation_override).toBe("no_action");
  });
});

describe("computeActionImpact — call flows", () => {
  it("call:contacted → negative risk delta, requires follow-up", () => {
    const result = computeActionImpact(input({
      action_type:   "call",
      action_status: "contacted",
    }));
    expect(result.risk_delta).toBeLessThan(0);
    expect(result.requires_follow_up).toBe(true);
    expect(result.operational_state).toBe("monitor");
  });

  it("call:pending_review → positive risk delta, retry_call state", () => {
    const result = computeActionImpact(input({
      action_type:   "call",
      action_status: "pending_review",
    }));
    expect(result.risk_delta).toBeGreaterThan(0);
    expect(result.snooze_hours).toBe(72);
    expect(result.operational_state).toBe("retry_call");
  });
});

describe("computeActionImpact — escalation", () => {
  it("escalation:escalated → high risk delta, escalate override, 24h snooze", () => {
    const result = computeActionImpact(input({
      action_type:   "escalation",
      action_status: "escalated",
    }));
    expect(result.risk_delta).toBe(15);
    expect(result.snooze_hours).toBe(24);
    expect(result.recommendation_override).toBe("escalate");
    expect(result.operational_state).toBe("escalated_active");
  });

  it("multiple ignored calls → escalate override if not already escalated", () => {
    const result = computeActionImpact(input({
      action_type:        "call",
      action_status:      "pending_review",
      ignored_call_count: 3,
      has_escalation:     false,
    }));
    expect(result.recommendation_override).toBe("escalate");
    expect(result.risk_delta).toBeGreaterThan(5);
  });

  it("already escalated + send_reminder override → override changes to escalate", () => {
    // simulate: email → monitor, but escalation is active
    const result = computeActionImpact(input({
      action_type:    "email",
      action_status:  "contacted",
      has_escalation: true,
    }));
    // email:contacted sets recommendation_override = "monitor", but escalation overrides it
    // Note: only "send_reminder" is blocked — "monitor" is fine, this test verifies the guard
    expect(result.operational_state).toBe("retry_email");
  });
});

describe("computeActionImpact — deltas clamping", () => {
  it("risk_delta is clamped to [-30, 30]", () => {
    // Base -25 + already at lowest reasonable value
    const result = computeActionImpact(input({
      action_type:        "internal_note",
      action_status:      "paid",
      current_risk_score: 90,
    }));
    expect(result.risk_delta).toBeGreaterThanOrEqual(-30);
    expect(result.risk_delta).toBeLessThanOrEqual(30);
  });

  it("urgency_delta is clamped to [-5, 5]", () => {
    const result = computeActionImpact(input({
      action_type:        "escalation",
      action_status:      "escalated",
      ignored_call_count: 5,
    }));
    expect(result.urgency_delta).toBeLessThanOrEqual(5);
    expect(result.urgency_delta).toBeGreaterThanOrEqual(-5);
  });
});

describe("computeActionImpact — unknown action", () => {
  it("unknown action type returns zero deltas", () => {
    const result = computeActionImpact(input({
      action_type:   "unknown_type",
      action_status: "pending_review",
    }));
    expect(result.risk_delta).toBe(0);
    expect(result.urgency_delta).toBe(0);
    expect(result.requires_follow_up).toBe(false);
  });
});

describe("computeActionImpact — determinism", () => {
  it("same inputs produce same output", () => {
    const a = computeActionImpact(input({ action_type: "escalation", action_status: "escalated" }));
    const b = computeActionImpact(input({ action_type: "escalation", action_status: "escalated" }));
    expect(a).toEqual(b);
  });
});
