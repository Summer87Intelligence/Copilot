/**
 * Phase 3A — deterministic expected impact heuristics (no ML).
 */

import type {
  ClientOperationalExpectedImpact,
  ExpectedImpactRiskReduction,
  RiskLevel,
} from "@/lib/decision-engine/de-types";

export type ExpectedImpactInput = {
  total_pending_amount: number;
  risk_level: RiskLevel;
  concentration_percent: number | null;
};

function riskReductionFromLevel(level: RiskLevel): ExpectedImpactRiskReduction {
  switch (level) {
    case "critical":
      return "high";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

/**
 * recovery_amount = saldo pendiente total del cliente.
 * risk_reduction según riesgo actual.
 * concentration_reduction si concentración > 25% (heurística: 15% del % actual).
 */
export function calculateExpectedImpact(input: ExpectedImpactInput): ClientOperationalExpectedImpact {
  const { total_pending_amount, risk_level, concentration_percent } = input;

  let concentration_reduction: number | null = null;
  if (concentration_percent != null && concentration_percent > 25) {
    concentration_reduction = Math.round(concentration_percent * 0.15 * 10) / 10;
  }

  return {
    recovery_amount: total_pending_amount,
    risk_reduction: riskReductionFromLevel(risk_level),
    concentration_reduction,
  };
}
