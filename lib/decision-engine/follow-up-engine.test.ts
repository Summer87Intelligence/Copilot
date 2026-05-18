import { describe, expect, it } from "vitest";
import { computeFollowUp } from "./follow-up-engine";
import type { FollowUpInput } from "./de-types";

const NOW = new Date("2026-05-18T12:00:00Z");

function input(overrides: Partial<FollowUpInput> = {}): FollowUpInput {
  return {
    last_action_type:   null,
    last_action_date:   null,
    last_action_status: null,
    promise_date:       null,
    has_active_promise: false,
    has_broken_promise: false,
    has_escalation:     false,
    oldest_days:        0,
    risk_score:         20,
    days_since_contact: null,
    ...overrides,
  };
}

describe("computeFollowUp — Rule 1: active promise", () => {
  it("returns awaiting_promise with follow_up = promise_date + 1 day", () => {
    const result = computeFollowUp(input({
      has_active_promise: true,
      promise_date: "2026-05-20",
    }), NOW);
    expect(result.operational_state).toBe("awaiting_promise");
    expect(result.next_follow_up_at).toBe("2026-05-21");
    expect(result.snoozed_until).toBe("2026-05-20");
  });

  it("follows the promise even when risk is high", () => {
    const result = computeFollowUp(input({
      has_active_promise: true,
      promise_date: "2026-05-19",
      risk_score: 80,
    }), NOW);
    expect(result.operational_state).toBe("awaiting_promise");
  });
});

describe("computeFollowUp — Rule 2: escalation", () => {
  it("returns escalated_active with critical SLA and 24h follow-up", () => {
    const result = computeFollowUp(input({ has_escalation: true }), NOW);
    expect(result.operational_state).toBe("escalated_active");
    expect(result.sla_status).toBe("critical");
    expect(result.next_follow_up_at).toBe("2026-05-19");
  });
});

describe("computeFollowUp — Rule 3: broken promise", () => {
  it("returns overdue_no_contact immediately", () => {
    const result = computeFollowUp(input({ has_broken_promise: true }), NOW);
    expect(result.operational_state).toBe("overdue_no_contact");
    expect(result.sla_status).toBe("overdue");
    expect(result.next_follow_up_at).toBe("2026-05-18");
  });
});

describe("computeFollowUp — Rule 4: call no answer", () => {
  it("returns retry_call 72h after last call", () => {
    const result = computeFollowUp(input({
      last_action_type:   "call",
      last_action_date:   "2026-05-17T00:00:00Z",
      last_action_status: "pending_review",
      oldest_days:        30,
    }), NOW);
    expect(result.operational_state).toBe("retry_call");
    expect(result.next_follow_up_at).toBe("2026-05-20");
    expect(result.snoozed_until).toBe("2026-05-20");
  });

  it("ignores call rule when status is contacted", () => {
    const result = computeFollowUp(input({
      last_action_type:   "call",
      last_action_date:   "2026-05-17T00:00:00Z",
      last_action_status: "contacted",
      oldest_days:        30,
      days_since_contact: 1,
    }), NOW);
    expect(result.operational_state).not.toBe("retry_call");
  });
});

describe("computeFollowUp — Rule 5: email/whatsapp sent", () => {
  it("email → retry_email in 96h", () => {
    const result = computeFollowUp(input({
      last_action_type: "email",
      last_action_date: "2026-05-15T00:00:00Z",
      oldest_days: 20,
      days_since_contact: 3,
    }), NOW);
    expect(result.operational_state).toBe("retry_email");
    expect(result.next_follow_up_at).toBe("2026-05-19");
  });

  it("whatsapp → retry_call in 96h", () => {
    const result = computeFollowUp(input({
      last_action_type: "whatsapp",
      last_action_date: "2026-05-15T00:00:00Z",
      oldest_days: 20,
      days_since_contact: 3,
    }), NOW);
    expect(result.operational_state).toBe("retry_call");
  });
});

describe("computeFollowUp — Rule 6: no contact > 14 days", () => {
  it("no_contact when never contacted and debt is overdue", () => {
    const result = computeFollowUp(input({
      oldest_days: 45,
      days_since_contact: null,
    }), NOW);
    expect(result.sla_status).toBe("no_contact");
    expect(result.operational_state).toBe("overdue_no_contact");
  });

  it("overdue when last contact > 14 days ago", () => {
    const result = computeFollowUp(input({
      oldest_days: 45,
      days_since_contact: 20,
    }), NOW);
    expect(result.sla_status).toBe("overdue");
    expect(result.operational_state).toBe("overdue_no_contact");
  });

  it("does NOT trigger when oldest_days = 0", () => {
    const result = computeFollowUp(input({
      oldest_days: 0,
      days_since_contact: null,
    }), NOW);
    expect(result.operational_state).not.toBe("overdue_no_contact");
  });
});

describe("computeFollowUp — Rule 7-9: risk-based fallback", () => {
  it("critical risk → 24h follow-up", () => {
    const result = computeFollowUp(input({
      risk_score: 80,
      days_since_contact: 5,
      oldest_days: 10,
    }), NOW);
    expect(result.operational_state).toBe("monitor");
    expect(result.next_follow_up_at).toBe("2026-05-19");
  });

  it("high risk → 72h follow-up", () => {
    const result = computeFollowUp(input({
      risk_score: 55,
      days_since_contact: 5,
      oldest_days: 10,
    }), NOW);
    expect(result.operational_state).toBe("monitor");
    expect(result.next_follow_up_at).toBe("2026-05-21");
  });

  it("low risk → 7 day follow-up, status ok", () => {
    const result = computeFollowUp(input({
      risk_score: 10,
      days_since_contact: 2,
      oldest_days: 0,
    }), NOW);
    expect(result.sla_status).toBe("ok");
    expect(result.operational_state).toBe("monitor");
    expect(result.next_follow_up_at).toBe("2026-05-25");
  });
});

describe("computeFollowUp — determinism", () => {
  it("same inputs always produce same output", () => {
    const a = computeFollowUp(input({ has_broken_promise: true }), NOW);
    const b = computeFollowUp(input({ has_broken_promise: true }), NOW);
    expect(a).toEqual(b);
  });
});
