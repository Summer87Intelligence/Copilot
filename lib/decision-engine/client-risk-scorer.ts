/**
 * Decision Engine — Client Risk Scorer.
 * Computes a 0-100 risk score from client signals.
 * Pure: no DB, no side effects.
 */

import type { RiskAssessment, RiskLevel, RiskScoringInput } from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Component tables (deterministic → testable)
// ---------------------------------------------------------------------------

const AGING_COMPONENT: Record<string, number> = {
  not_due: 0,
  "0-30":  10,
  "31-60": 25,
  "61-90": 45,
  "90+":   70,
};

function concentrationComponent(pct: number): number {
  if (pct >= 50) return 15;
  if (pct >= 30) return 10;
  if (pct >= 15) return  5;
  return 0;
}

function behaviorComponent(
  has_broken_promise: boolean,
  days_since_contact: number | null,
  oldest_days: number
): number {
  if (has_broken_promise) return 20;
  if (days_since_contact === null) {
    if (oldest_days > 60) return 15;
    if (oldest_days > 30) return 10;
    if (oldest_days > 0)  return  5;
  }
  return 0;
}

function contactComponent(days_since_contact: number | null): number {
  if (days_since_contact === null) return 10;
  if (days_since_contact > 60)    return  8;
  if (days_since_contact > 30)    return  5;
  if (days_since_contact > 14)    return  3;
  return 0;
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeClientRiskScore(input: RiskScoringInput): RiskAssessment {
  const aging          = AGING_COMPONENT[input.dominant_bucket] ?? 0;
  const concentration  = concentrationComponent(input.concentration_pct);
  const behavior       = behaviorComponent(input.has_broken_promise, input.days_since_contact, input.oldest_days);
  const contact        = contactComponent(input.days_since_contact);

  const raw  = aging + concentration + behavior + contact;
  const adj  = input.has_active_promise ? raw - 10 : raw;
  const score = Math.max(0, Math.min(100, adj));

  return {
    score,
    level:                   toRiskLevel(score),
    aging_component:         aging,
    concentration_component: concentration,
    behavior_component:      behavior,
    contact_component:       contact,
  };
}
