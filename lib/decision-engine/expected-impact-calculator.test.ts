import { describe, expect, it } from "vitest";

import { calculateExpectedImpact } from "@/lib/decision-engine/expected-impact-calculator";

describe("calculateExpectedImpact", () => {
  it("recovery_amount = saldo pendiente", () => {
    const impact = calculateExpectedImpact({
      total_pending_amount: 936,
      risk_level: "critical",
      concentration_percent: null,
    });
    expect(impact.recovery_amount).toBe(936);
  });

  it("risk_reduction alto para riesgo critical/high", () => {
    expect(
      calculateExpectedImpact({
        total_pending_amount: 100,
        risk_level: "critical",
        concentration_percent: null,
      }).risk_reduction
    ).toBe("high");
    expect(
      calculateExpectedImpact({
        total_pending_amount: 100,
        risk_level: "low",
        concentration_percent: null,
      }).risk_reduction
    ).toBe("low");
  });

  it("concentration_reduction solo si > 25%", () => {
    expect(
      calculateExpectedImpact({
        total_pending_amount: 1000,
        risk_level: "high",
        concentration_percent: 20,
      }).concentration_reduction
    ).toBeNull();
    expect(
      calculateExpectedImpact({
        total_pending_amount: 1000,
        risk_level: "high",
        concentration_percent: 50,
      }).concentration_reduction
    ).toBe(7.5);
  });
});
