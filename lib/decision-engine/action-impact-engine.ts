/**
 * Decision Engine — Action Impact Engine.
 * Computa el impacto operacional inmediato de registrar una acción de cobranza.
 * Pure: sin DB, sin side effects, determinístico.
 */

import type {
  ActionImpact,
  ActionImpactInput,
  FollowUpState,
  RecommendedAction,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Impact table (action_type:action_status → deltas)
// ---------------------------------------------------------------------------

type ImpactRow = {
  risk_delta: number;
  urgency_delta: number;
  recommendation_override: RecommendedAction | null;
  snooze_hours: number;
  requires_follow_up: boolean;
  state: FollowUpState;
};

const IMPACT_TABLE: Record<string, ImpactRow> = {
  // Promesa de pago → congelar escalación, snooze 7 días
  "payment_promise:promised_payment": {
    risk_delta: -10, urgency_delta: -2, recommendation_override: "monitor",
    snooze_hours: 168, requires_follow_up: true, state: "awaiting_promise",
  },
  // Pago recibido → reset completo
  "internal_note:paid": {
    risk_delta: -25, urgency_delta: -5, recommendation_override: "no_action",
    snooze_hours: 0, requires_follow_up: false, state: "payment_cleared",
  },
  // Contacto exitoso por llamada
  "call:contacted": {
    risk_delta: -5, urgency_delta: -1, recommendation_override: "monitor",
    snooze_hours: 0, requires_follow_up: true, state: "monitor",
  },
  // Llamada sin respuesta → subir riesgo levemente
  "call:pending_review": {
    risk_delta: 5, urgency_delta: 1, recommendation_override: null,
    snooze_hours: 72, requires_follow_up: true, state: "retry_call",
  },
  // WhatsApp enviado
  "whatsapp:contacted": {
    risk_delta: -3, urgency_delta: -1, recommendation_override: "monitor",
    snooze_hours: 96, requires_follow_up: true, state: "retry_call",
  },
  // Email enviado
  "email:contacted": {
    risk_delta: -3, urgency_delta: -1, recommendation_override: "monitor",
    snooze_hours: 96, requires_follow_up: true, state: "retry_email",
  },
  // Escalación formal → subir riesgo, SLA 24h
  "escalation:escalated": {
    risk_delta: 15, urgency_delta: 3, recommendation_override: "escalate",
    snooze_hours: 24, requires_follow_up: true, state: "escalated_active",
  },
  // Disputa
  "dispute:disputed": {
    risk_delta: 10, urgency_delta: 2, recommendation_override: "escalate",
    snooze_hours: 48, requires_follow_up: true, state: "escalated_active",
  },
  // Reunión agendada → señal positiva
  "meeting:contacted": {
    risk_delta: -5, urgency_delta: -2, recommendation_override: "monitor",
    snooze_hours: 24, requires_follow_up: true, state: "monitor",
  },
  // Nota interna (genérica)
  "internal_note:pending_review": {
    risk_delta: 0, urgency_delta: 0, recommendation_override: null,
    snooze_hours: 0, requires_follow_up: false, state: "monitor",
  },
};

const FALLBACK_ROW: ImpactRow = {
  risk_delta: 0, urgency_delta: 0, recommendation_override: null,
  snooze_hours: 0, requires_follow_up: false, state: "monitor",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeActionImpact(input: ActionImpactInput): ActionImpact {
  const key = `${input.action_type}:${input.action_status}`;
  const base = IMPACT_TABLE[key] ?? FALLBACK_ROW;

  let risk_delta = base.risk_delta;
  let urgency_delta = base.urgency_delta;
  let recommendation_override = base.recommendation_override;

  // Override: múltiples llamadas ignoradas → escalar
  if (input.ignored_call_count >= 3 && !input.has_escalation) {
    risk_delta += 10;
    urgency_delta += 2;
    recommendation_override = "escalate";
  }

  // Override: ya escalado → bloquear reminder simple
  if (input.has_escalation && recommendation_override === "send_reminder") {
    recommendation_override = "escalate";
  }

  // Override: pago parcial (internal_note:paid con riesgo alto previo)
  if (
    input.action_type === "internal_note" &&
    input.action_status === "paid" &&
    input.current_risk_score >= 50
  ) {
    risk_delta = Math.min(risk_delta, -15);
  }

  return {
    risk_delta:              Math.max(-30, Math.min(30, risk_delta)),
    urgency_delta:           Math.max(-5, Math.min(5, urgency_delta)),
    recommendation_override: recommendation_override as RecommendedAction | null,
    snooze_hours:            base.snooze_hours,
    requires_follow_up:      base.requires_follow_up,
    operational_state:       base.state,
  };
}
