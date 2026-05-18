/**
 * Decision Engine — Operational SLA Engine (Phase 2A).
 * Tiempo máximo por estado, detección de breach y boost de prioridad.
 */

import type {
  OperationalMachineState,
  OperationalSlaEvaluation,
  OperationalSlaSeverity,
  RiskLevel,
} from "@/lib/decision-engine/de-types";

const MS_PER_DAY = 86_400_000;

/** Días máximos en estado antes de SLA breach (null = sin límite por tiempo). */
export const STATE_SLA_MAX_DAYS: Record<OperationalMachineState, number | null> = {
  new_risk:          3,
  monitoring:        14,
  follow_up:         7,
  payment_promised:  null, // evaluado por promise_date
  escalated:         3,
  critical:          1,
  recovered:         null,
  paused:            null,
  legal_review:      30,
};

const SEVERITY_ORDER: OperationalSlaSeverity[] = ["low", "medium", "high", "critical"];

const PRIORITY_BOOST: Record<OperationalSlaSeverity, number> = {
  low:      0,
  medium:   1,
  high:     2,
  critical: 3,
};

function daysInState(transitionedAt: string | null, now: Date): number {
  if (!transitionedAt) return 0;
  const entered = new Date(transitionedAt);
  if (isNaN(entered.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - entered.getTime()) / MS_PER_DAY));
}

function severityFromOverdueRatio(ratio: number): OperationalSlaSeverity {
  if (ratio >= 2) return "critical";
  if (ratio >= 1.5) return "high";
  if (ratio >= 1) return "medium";
  return "low";
}

function boostRiskLevel(level: RiskLevel, steps: number): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  const idx = Math.min(order.length - 1, Math.max(0, order.indexOf(level) + steps));
  return order[idx]!;
}

export type OperationalSlaInput = {
  machine_state: OperationalMachineState;
  transitioned_at: string | null;
  current_risk: RiskLevel;
  promise_date: string | null;
  has_active_promise: boolean;
  now?: Date;
};

export function evaluateOperationalSla(input: OperationalSlaInput): OperationalSlaEvaluation {
  const now = input.now ?? new Date();
  const days = daysInState(input.transitioned_at, now);

  if (input.machine_state === "recovered" || input.machine_state === "paused") {
    return {
      breached: false,
      days_in_state: days,
      max_days: null,
      severity: "low",
      priority_boost_steps: 0,
      suggested_risk: input.current_risk,
      reason: "Estado sin SLA temporal activo",
    };
  }

  if (input.machine_state === "payment_promised" && input.has_active_promise && input.promise_date) {
    const promiseDay = new Date(input.promise_date);
    if (!isNaN(promiseDay.getTime())) {
      const graceEnd = new Date(promiseDay.getTime() + MS_PER_DAY);
      const breached = now.getTime() > graceEnd.getTime();
      const overdueDays = breached
        ? Math.floor((now.getTime() - graceEnd.getTime()) / MS_PER_DAY)
        : 0;
      const severity: OperationalSlaSeverity = breached
        ? overdueDays >= 3
          ? "critical"
          : overdueDays >= 1
            ? "high"
            : "medium"
        : "low";
      const boost = PRIORITY_BOOST[severity];
      return {
        breached,
        days_in_state: days,
        max_days: null,
        severity,
        priority_boost_steps: boost,
        suggested_risk: boostRiskLevel(input.current_risk, boost),
        reason: breached
          ? "Promesa de pago vencida — SLA incumplido"
          : "Promesa activa dentro de SLA",
      };
    }
  }

  const maxDays = STATE_SLA_MAX_DAYS[input.machine_state];
  if (maxDays == null) {
    return {
      breached: false,
      days_in_state: days,
      max_days: null,
      severity: "low",
      priority_boost_steps: 0,
      suggested_risk: input.current_risk,
      reason: "Sin límite SLA configurado para el estado",
    };
  }

  const breached = days > maxDays;
  const ratio = maxDays > 0 ? days / maxDays : days;
  const severity = breached ? severityFromOverdueRatio(ratio) : "low";
  const boost = breached ? PRIORITY_BOOST[severity] : 0;

  return {
    breached,
    days_in_state: days,
    max_days: maxDays,
    severity,
    priority_boost_steps: boost,
    suggested_risk: boostRiskLevel(input.current_risk, boost),
    reason: breached
      ? `SLA breach: ${days}d en ${input.machine_state} (máx ${maxDays}d)`
      : `${days}d en ${input.machine_state} (máx ${maxDays}d)`,
  };
}

export function maxSeverity(a: OperationalSlaSeverity, b: OperationalSlaSeverity): OperationalSlaSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}
