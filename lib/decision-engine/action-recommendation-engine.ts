/**
 * Decision Engine — Action Recommendation Engine.
 * Pure decision tree: 14 branches → deterministic output.
 * No DB, no side effects, no LLM.
 */

import type {
  ActionRecommendation,
  RecommendedAction,
  RecommendedChannel,
  RecommendationInput,
  UrgencyLevel,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDateOffset(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0]!;
}

function rec(
  action: RecommendedAction,
  channel: RecommendedChannel | null,
  urgency: UrgencyLevel,
  rationale: string[],
  confidence: number,
  next_suggested_at: string | null
): ActionRecommendation {
  return { action, channel, urgency, rationale, confidence, next_suggested_at };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateActionRecommendation(
  input: RecommendationInput,
  now?: Date
): ActionRecommendation {
  const ref = now ?? new Date();
  const {
    risk_assessment,
    oldest_days,
    dominant_bucket,
    has_active_promise,
    has_broken_promise,
    has_escalation,
    days_since_contact,
  } = input;
  const { level } = risk_assessment;

  // Branch 1 — active promise: wait, no interruption
  if (has_active_promise) {
    return rec("monitor", "internal", "low",
      ["Promesa de pago activa registrada — esperar fecha acordada"],
      90, isoDateOffset(ref, 7));
  }

  // Branch 2 — existing escalation
  if (has_escalation) {
    return rec("escalate", "internal", "high",
      ["Expediente de escalamiento activo"],
      85, null);
  }

  // Branch 3 — broken promise + critical risk → hold credit
  if (has_broken_promise && level === "critical") {
    return rec("hold_credit", "internal", "critical",
      ["Promesa de pago no cumplida", "Riesgo de cartera crítico"],
      88, null);
  }

  // Branch 4 — broken promise + 90+ days
  if (has_broken_promise && oldest_days >= 90) {
    return rec("escalate", "internal", "critical",
      ["Promesa de pago no cumplida", "Deuda supera 90 días vencida"],
      90, null);
  }

  // Branch 5 — broken promise (any bucket)
  if (has_broken_promise) {
    return rec("escalate", "internal", "high",
      ["Promesa de pago no cumplida"],
      82, null);
  }

  // Branch 6 — 90+ days, never contacted
  if (oldest_days >= 90 && days_since_contact === null) {
    return rec("manual_call", "phone", "critical",
      ["Deuda mayor a 90 días sin contacto registrado"],
      92, null);
  }

  // Branch 7 — 90+ days, no recent contact (> 14 days)
  if (oldest_days >= 90 && (days_since_contact === null || days_since_contact > 14)) {
    return rec("manual_call", "phone", "high",
      ["Deuda mayor a 90 días", "Sin contacto en los últimos 14 días"],
      85, null);
  }

  // Branch 8 — critical risk score (not yet handled above)
  if (level === "critical") {
    return rec("payment_plan", "phone", "high",
      ["Riesgo elevado de incobrabilidad — negociar plan de pago"],
      78, null);
  }

  // Branch 9 — 61-90 days with no contact
  if (dominant_bucket === "61-90" && days_since_contact === null) {
    return rec("manual_call", "phone", "high",
      ["Factura con 61-90 días vencida sin contacto registrado"],
      80, null);
  }

  // Branch 10 — high risk + 90+ bucket
  if (level === "high" && dominant_bucket === "90+") {
    return rec("payment_plan", "phone", "high",
      ["Alto riesgo", "Deuda en tramo 90+ días"],
      75, null);
  }

  // Branch 11 — 31-60 days: send reminder
  if (dominant_bucket === "31-60") {
    const noRecent = days_since_contact === null || days_since_contact > 7;
    const channel: RecommendedChannel = noRecent ? "email" : "internal";
    return rec("send_reminder", channel, "medium",
      ["Factura con 31-60 días vencida"],
      80, isoDateOffset(ref, 2));
  }

  // Branch 12 — 0-30 days: light reminder
  if (dominant_bucket === "0-30") {
    return rec("send_reminder", "whatsapp", "low",
      ["Factura recién vencida — primer contacto"],
      82, isoDateOffset(ref, 3));
  }

  // Branch 13 — low risk: no action needed
  if (level === "low") {
    return rec("no_action", null, "low",
      ["Sin vencimientos significativos ni señales de riesgo"],
      85, isoDateOffset(ref, 14));
  }

  // Branch 14 — fallthrough: routine monitor
  return rec("monitor", "internal", "low",
    ["Seguimiento de rutina"],
    70, isoDateOffset(ref, 7));
}
