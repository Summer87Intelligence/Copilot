import { describe, expect, it } from "vitest";
import { computeClientRiskScore } from "./client-risk-scorer";
import type { RiskScoringInput } from "./de-types";

const base: RiskScoringInput = {
  oldest_days:        0,
  dominant_bucket:    "not_due",
  concentration_pct:  10,
  has_active_promise: false,
  has_broken_promise: false,
  days_since_contact: null,
  invoice_count:      1,
};

describe("computeClientRiskScore", () => {
  it("returns level=low for not_due with no signals", () => {
    const result = computeClientRiskScore({ ...base, days_since_contact: 0 });
    expect(result.level).toBe("low");
    expect(result.score).toBeLessThan(25);
    expect(result.aging_component).toBe(0);
  });

  it("returns level=critical for 90+ bucket with broken promise and high concentration", () => {
    const result = computeClientRiskScore({
      ...base,
      oldest_days:        95,
      dominant_bucket:    "90+",
      concentration_pct:  55,
      has_broken_promise: true,
    });
    expect(result.level).toBe("critical");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.aging_component).toBe(70);
    expect(result.concentration_component).toBe(15);
    expect(result.behavior_component).toBe(20);
  });

  it("active promise reduces score by 10", () => {
    const without = computeClientRiskScore({
      ...base,
      dominant_bucket:    "61-90",
      oldest_days:        75,
      days_since_contact: null,
    });
    const withPromise = computeClientRiskScore({
      ...base,
      dominant_bucket:    "61-90",
      oldest_days:        75,
      days_since_contact: null,
      has_active_promise: true,
    });
    expect(withPromise.score).toBe(Math.max(0, without.score - 10));
  });

  it("score is clamped to 0-100", () => {
    const result = computeClientRiskScore({
      ...base,
      dominant_bucket:    "90+",
      oldest_days:        120,
      concentration_pct:  100,
      has_broken_promise: true,
      days_since_contact: null,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("components are deterministic for same inputs", () => {
    const a = computeClientRiskScore({ ...base, dominant_bucket: "31-60", oldest_days: 45, concentration_pct: 20, days_since_contact: 10 });
    const b = computeClientRiskScore({ ...base, dominant_bucket: "31-60", oldest_days: 45, concentration_pct: 20, days_since_contact: 10 });
    expect(a).toEqual(b);
  });

  it("31-60 bucket produces medium or high risk with no contact", () => {
    const result = computeClientRiskScore({
      ...base,
      dominant_bucket:    "31-60",
      oldest_days:        50,
      days_since_contact: null,
    });
    expect(["medium", "high", "critical"]).toContain(result.level);
    expect(result.aging_component).toBe(25);
  });

  it("concentration component tiers are correct", () => {
    expect(computeClientRiskScore({ ...base, concentration_pct: 50 }).concentration_component).toBe(15);
    expect(computeClientRiskScore({ ...base, concentration_pct: 30 }).concentration_component).toBe(10);
    expect(computeClientRiskScore({ ...base, concentration_pct: 15 }).concentration_component).toBe(5);
    expect(computeClientRiskScore({ ...base, concentration_pct: 14 }).concentration_component).toBe(0);
  });
});
