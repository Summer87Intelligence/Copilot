/**
 * Decision Engine — Operational State Machine (Phase 2A).
 * Transiciones determinísticas con guards; sin DB ni side effects.
 */

import type {
  OperationalMachineState,
  OperationalTransitionSeverity,
  PaymentEventKind,
  StateTransitionInput,
  StateTransitionResult,
} from "@/lib/decision-engine/de-types";
import { maxSeverity } from "@/lib/decision-engine/operational-sla-engine";

// ---------------------------------------------------------------------------
// Allowed transitions (prevents invalid loops)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<OperationalMachineState, ReadonlySet<OperationalMachineState>> = {
  new_risk: new Set([
    "monitoring", "follow_up", "payment_promised", "escalated", "critical",
    "recovered", "paused", "legal_review",
  ]),
  monitoring: new Set([
    "follow_up", "payment_promised", "escalated", "critical", "recovered",
    "paused", "legal_review", "new_risk",
  ]),
  follow_up: new Set([
    "monitoring", "payment_promised", "escalated", "critical", "recovered",
    "paused", "legal_review",
  ]),
  payment_promised: new Set([
    "escalated", "critical", "recovered", "follow_up", "monitoring", "legal_review",
  ]),
  escalated: new Set([
    "critical", "payment_promised", "recovered", "follow_up", "monitoring",
    "legal_review", "paused",
  ]),
  critical: new Set([
    "escalated", "recovered", "legal_review", "payment_promised",
  ]),
  recovered: new Set([
    "new_risk", "monitoring",
  ]),
  paused: new Set([
    "monitoring", "legal_review", "follow_up",
  ]),
  legal_review: new Set([
    "escalated", "critical", "recovered", "paused", "monitoring",
  ]),
};

const TERMINAL_SOFT: ReadonlySet<OperationalMachineState> = new Set(["recovered", "paused"]);

export function canTransition(
  from: OperationalMachineState | null,
  to: OperationalMachineState
): boolean {
  if (from === to) return true;
  if (from == null) return to === "new_risk" || to === "monitoring";
  if (from === "recovered" && (to === "critical" || to === "escalated")) return false;
  if (from === "critical" && to === "monitoring") return false;
  if (from === "paused" && to !== "monitoring" && to !== "legal_review" && to !== "follow_up") {
    return ALLOWED_TRANSITIONS.paused.has(to);
  }
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

// ---------------------------------------------------------------------------
// Rule candidates (ordered — first valid wins)
// ---------------------------------------------------------------------------

type RuleCandidate = {
  state: OperationalMachineState;
  reason: string;
  severity: OperationalTransitionSeverity;
};

function actionKey(action_type: string | null, action_status: string | null): string {
  return `${action_type ?? ""}:${action_status ?? ""}`;
}

function buildCandidates(input: StateTransitionInput): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];
  const key = actionKey(input.action_type, input.action_status);

  if (input.is_paused) {
    candidates.push({
      state: "paused",
      reason: "Cuenta pausada manualmente",
      severity: "low",
    });
  }

  if (input.is_legal_review || key === "dispute:disputed") {
    candidates.push({
      state: "legal_review",
      reason: "Disputa o revisión legal activa",
      severity: "high",
    });
  }

  if (input.payment_event === "full" || input.pending_balance <= 0 || key === "internal_note:paid") {
    candidates.push({
      state: "recovered",
      reason: "Saldo pendiente liquidado o pago registrado",
      severity: "low",
    });
  }

  if (input.has_broken_promise) {
    candidates.push({
      state: "escalated",
      reason: "Promesa de pago vencida",
      severity: "high",
    });
  }

  if (input.oldest_days >= 90 && input.pending_balance > 0) {
    candidates.push({
      state: "critical",
      reason: "Deuda con más de 90 días de antigüedad",
      severity: "critical",
    });
  }

  if (
    input.pending_balance > 0 &&
    input.oldest_days > 0 &&
    (input.days_since_contact === null || input.days_since_contact >= 14)
  ) {
    candidates.push({
      state: "escalated",
      reason:
        input.days_since_contact === null
          ? "Sin contacto registrado con deuda activa"
          : `Sin contacto hace ${input.days_since_contact} días`,
      severity: "high",
    });
  }

  if (input.has_active_promise) {
    candidates.push({
      state: "payment_promised",
      reason: "Promesa de pago activa",
      severity: "medium",
    });
  }

  if (input.has_escalation || key === "escalation:escalated") {
    candidates.push({
      state: "escalated",
      reason: "Escalación formal registrada",
      severity: "high",
    });
  }

  if (key === "payment_promise:promised_payment") {
    candidates.push({
      state: "payment_promised",
      reason: "Nueva promesa de pago",
      severity: "medium",
    });
  }

  if (
    key === "call:contacted" ||
    key === "email:contacted" ||
    key === "whatsapp:contacted" ||
    key === "meeting:contacted"
  ) {
    candidates.push({
      state: "monitoring",
      reason: "Contacto exitoso registrado",
      severity: "low",
    });
  }

  if (key === "call:pending_review") {
    candidates.push({
      state: "follow_up",
      reason: "Llamada pendiente de respuesta",
      severity: "medium",
    });
  }

  if (input.sla_breached) {
    const from = input.current_state ?? "monitoring";
    if (from === "monitoring" || from === "new_risk") {
      candidates.push({
        state: "follow_up",
        reason: "SLA breach — intensificar seguimiento",
        severity: maxSeverity(input.sla_severity, "medium"),
      });
    } else if (from === "follow_up" || from === "payment_promised") {
      candidates.push({
        state: "escalated",
        reason: "SLA breach — escalar caso",
        severity: maxSeverity(input.sla_severity, "high"),
      });
    } else if (from === "escalated") {
      candidates.push({
        state: "critical",
        reason: "SLA breach — nivel crítico",
        severity: "critical",
      });
    }
  }

  if (input.risk_score >= 75 && input.pending_balance > 0) {
    candidates.push({
      state: "critical",
      reason: `Score de riesgo crítico (${input.risk_score})`,
      severity: "critical",
    });
  }

  if (input.current_state == null && input.pending_balance > 0) {
    candidates.push({
      state: "new_risk",
      reason: "Cliente con deuda sin estado operativo previo",
      severity: "medium",
    });
  }

  if (input.current_state === "recovered" && input.pending_balance > 0) {
    candidates.push({
      state: "new_risk",
      reason: "Deuda reactivada tras recuperación",
      severity: "medium",
    });
  }

  if (input.action_type != null && candidates.length === 0) {
    candidates.push({
      state: "follow_up",
      reason: "Acción de cobranza registrada",
      severity: "medium",
    });
  }

  return candidates;
}

function defaultState(input: StateTransitionInput): OperationalMachineState {
  if (input.pending_balance <= 0) return "recovered";
  if (input.current_state && !TERMINAL_SOFT.has(input.current_state)) {
    return input.current_state;
  }
  if (input.current_state === "recovered" && input.pending_balance > 0) {
    return "new_risk";
  }
  return input.current_state ?? "monitoring";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveOperationalTransition(
  input: StateTransitionInput
): StateTransitionResult {
  const current = input.current_state;
  const candidates = buildCandidates(input);

  for (const candidate of candidates) {
    if (!canTransition(current, candidate.state)) continue;
    const transitioned = current !== candidate.state;
    return {
      next_state: candidate.state,
      reason: candidate.reason,
      severity: candidate.severity,
      transitioned,
      breached_sla: input.sla_breached,
    };
  }

  const fallback = defaultState(input);
  const safeNext = canTransition(current, fallback)
    ? fallback
    : current ?? "monitoring";

  return {
    next_state: safeNext,
    reason: transitionedReason(current, safeNext),
    severity: input.sla_breached ? input.sla_severity : "low",
    transitioned: current !== safeNext,
    breached_sla: input.sla_breached,
  };
}

function transitionedReason(
  from: OperationalMachineState | null,
  to: OperationalMachineState
): string {
  if (from === to) return "Sin cambio de estado operativo";
  if (from == null) return "Estado operativo inicial";
  return `Permanece en ${to}`;
}

export function inferPaymentEvent(
  action_type: string | null,
  action_status: string | null,
  pending_balance: number
): PaymentEventKind {
  if (pending_balance <= 0) return "full";
  if (action_type === "internal_note" && action_status === "paid") return "full";
  return "none";
}
