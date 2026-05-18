import { describe, expect, it } from "vitest";
import { generateActionRecommendation } from "./action-recommendation-engine";
import type { RecommendationInput, RiskAssessment } from "./de-types";

const NOW = new Date("2026-05-18T12:00:00Z");

function risk(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    score:                   25,
    level:                   "medium",
    aging_component:         25,
    concentration_component: 0,
    behavior_component:      0,
    contact_component:       0,
    ...overrides,
  };
}

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    risk_assessment:    risk(),
    oldest_days:        35,
    dominant_bucket:    "31-60",
    has_active_promise: false,
    has_broken_promise: false,
    has_escalation:     false,
    days_since_contact: null,
    instruction:        "recordatorio",
    ...overrides,
  };
}

describe("generateActionRecommendation", () => {
  it("Branch 1: active promise → monitor/low", () => {
    const rec = generateActionRecommendation(input({ has_active_promise: true }), NOW);
    expect(rec.action).toBe("monitor");
    expect(rec.urgency).toBe("low");
    expect(rec.channel).toBe("internal");
  });

  it("Branch 2: existing escalation → escalate/high", () => {
    const rec = generateActionRecommendation(input({ has_escalation: true }), NOW);
    expect(rec.action).toBe("escalate");
    expect(rec.urgency).toBe("high");
  });

  it("Branch 3: broken promise + critical risk → hold_credit/critical", () => {
    const rec = generateActionRecommendation(input({
      has_broken_promise: true,
      risk_assessment: risk({ level: "critical", score: 80 }),
    }), NOW);
    expect(rec.action).toBe("hold_credit");
    expect(rec.urgency).toBe("critical");
  });

  it("Branch 4: broken promise + 90+ days → escalate/critical", () => {
    const rec = generateActionRecommendation(input({
      has_broken_promise: true,
      oldest_days:        95,
      risk_assessment:    risk({ level: "high", score: 60 }),
    }), NOW);
    expect(rec.action).toBe("escalate");
    expect(rec.urgency).toBe("critical");
  });

  it("Branch 5: broken promise (not critical, not 90+) → escalate/high", () => {
    const rec = generateActionRecommendation(input({
      has_broken_promise: true,
      oldest_days:        50,
    }), NOW);
    expect(rec.action).toBe("escalate");
    expect(rec.urgency).toBe("high");
  });

  it("Branch 6: 90+ days, no contact → manual_call/critical", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:        95,
      dominant_bucket:    "90+",
      days_since_contact: null,
    }), NOW);
    expect(rec.action).toBe("manual_call");
    expect(rec.urgency).toBe("critical");
    expect(rec.channel).toBe("phone");
  });

  it("Branch 7: 90+ days, contact > 14 days → manual_call/high", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:        95,
      dominant_bucket:    "90+",
      days_since_contact: 20,
    }), NOW);
    expect(rec.action).toBe("manual_call");
    expect(rec.urgency).toBe("high");
  });

  it("Branch 8: critical risk (without other triggers) → payment_plan/high", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:        50,
      dominant_bucket:    "31-60",
      days_since_contact: 5,
      risk_assessment:    risk({ level: "critical", score: 80 }),
    }), NOW);
    expect(rec.action).toBe("payment_plan");
    expect(rec.urgency).toBe("high");
  });

  it("Branch 9: 61-90 days, no contact → manual_call/high", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:        70,
      dominant_bucket:    "61-90",
      days_since_contact: null,
      risk_assessment:    risk({ level: "medium", score: 50 }),
    }), NOW);
    expect(rec.action).toBe("manual_call");
    expect(rec.urgency).toBe("high");
  });

  it("Branch 10: high risk + 90+ bucket → payment_plan/high", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:        95,
      dominant_bucket:    "90+",
      days_since_contact: 5,
      risk_assessment:    risk({ level: "high", score: 60 }),
    }), NOW);
    expect(rec.action).toBe("payment_plan");
    expect(rec.urgency).toBe("high");
  });

  it("Branch 11: 31-60 days → send_reminder", () => {
    const rec = generateActionRecommendation(input({
      dominant_bucket:    "31-60",
      days_since_contact: null,
    }), NOW);
    expect(rec.action).toBe("send_reminder");
    expect(rec.urgency).toBe("medium");
  });

  it("Branch 12: 0-30 days → send_reminder/whatsapp/low", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:     15,
      dominant_bucket: "0-30",
    }), NOW);
    expect(rec.action).toBe("send_reminder");
    expect(rec.channel).toBe("whatsapp");
    expect(rec.urgency).toBe("low");
  });

  it("Branch 13: low risk → no_action/low", () => {
    const rec = generateActionRecommendation(input({
      oldest_days:     0,
      dominant_bucket: "not_due",
      risk_assessment: risk({ level: "low", score: 5 }),
    }), NOW);
    expect(rec.action).toBe("no_action");
    expect(rec.urgency).toBe("low");
  });

  it("is deterministic for same inputs", () => {
    const a = generateActionRecommendation(input(), NOW);
    const b = generateActionRecommendation(input(), NOW);
    expect(a).toEqual(b);
  });

  it("next_suggested_at is a valid ISO date or null", () => {
    const rec = generateActionRecommendation(input({ dominant_bucket: "0-30", oldest_days: 10 }), NOW);
    if (rec.next_suggested_at !== null) {
      expect(() => new Date(rec.next_suggested_at!)).not.toThrow();
      expect(rec.next_suggested_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
