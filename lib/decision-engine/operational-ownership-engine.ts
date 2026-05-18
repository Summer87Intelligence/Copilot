/**
 * Phase 4A — reglas determinísticas de asignación operacional.
 */

import type { OperationalMachineState, RiskLevel } from "@/lib/decision-engine/de-types";
import type { OperationalOwnershipOperatorStats } from "@/lib/decision-engine/de-types";

export const DEFAULT_MAX_ACTIVE_CRITICAL = 8;

export type AutoAssignCandidate = {
  customer_id: string;
  current_risk: RiskLevel;
  machine_state: OperationalMachineState;
  breached_sla: boolean;
  existing_owner_id: string | null;
};

export type AutoAssignDecision = {
  customer_id: string;
  assigned_user_id: string;
  reason: string;
};

function isCriticalCandidate(c: AutoAssignCandidate): boolean {
  return (
    c.current_risk === "critical" ||
    c.machine_state === "critical" ||
    c.machine_state === "escalated" ||
    c.machine_state === "legal_review" ||
    c.breached_sla
  );
}

function scoreOperator(
  op: OperationalOwnershipOperatorStats,
  critical: boolean,
  breached: boolean
): number {
  let score = op.total_assigned * 2 + op.critical_assigned * 5 + op.overdue_assigned * 3;
  if (critical && op.critical_assigned >= DEFAULT_MAX_ACTIVE_CRITICAL) {
    score += 1000;
  }
  if (breached && op.overdue_assigned > 0) {
    score += 2;
  }
  return score;
}

export function pickAutoAssignee(
  operators: OperationalOwnershipOperatorStats[],
  candidate: AutoAssignCandidate,
  options: { maxActiveCritical?: number } = {}
): AutoAssignDecision | null {
  if (operators.length === 0) return null;

  const maxCritical = options.maxActiveCritical ?? DEFAULT_MAX_ACTIVE_CRITICAL;
  const critical = isCriticalCandidate(candidate);

  if (
    candidate.existing_owner_id &&
    operators.some((o) => o.user_id === candidate.existing_owner_id)
  ) {
    const owner = operators.find((o) => o.user_id === candidate.existing_owner_id)!;
    if (!critical || owner.critical_assigned < maxCritical) {
      return {
        customer_id: candidate.customer_id,
        assigned_user_id: candidate.existing_owner_id,
        reason: "sticky_owner",
      };
    }
  }

  const ranked = [...operators].sort((a, b) => {
    const sa = scoreOperator(a, critical, candidate.breached_sla);
    const sb = scoreOperator(b, critical, candidate.breached_sla);
    return sa - sb || a.total_assigned - b.total_assigned;
  });

  const pick = ranked[0];
  if (!pick) return null;

  if (critical && pick.critical_assigned >= maxCritical) {
    const alternate = ranked.find((o) => o.critical_assigned < maxCritical);
    if (!alternate) return null;
    return {
      customer_id: candidate.customer_id,
      assigned_user_id: alternate.user_id,
      reason: candidate.breached_sla ? "sla_balanced" : "critical_balanced",
    };
  }

  return {
    customer_id: candidate.customer_id,
    assigned_user_id: pick.user_id,
    reason: candidate.breached_sla
      ? "sla_escalation"
      : critical
        ? "critical_load_balance"
        : "workload_balance",
  };
}

export function planAutoAssignments(
  operators: OperationalOwnershipOperatorStats[],
  candidates: AutoAssignCandidate[],
  options: { maxActiveCritical?: number } = {}
): AutoAssignDecision[] {
  const working = operators.map((o) => ({ ...o }));
  const decisions: AutoAssignDecision[] = [];

  const sorted = [...candidates].sort((a, b) => {
    const score = (c: AutoAssignCandidate) =>
      (c.breached_sla ? 100 : 0) + (isCriticalCandidate(c) ? 50 : 0);
    return score(b) - score(a);
  });

  for (const candidate of sorted) {
    const decision = pickAutoAssignee(working, candidate, options);
    if (!decision) continue;

    decisions.push(decision);
    const op = working.find((o) => o.user_id === decision.assigned_user_id);
    if (op) {
      op.total_assigned += 1;
      if (isCriticalCandidate(candidate)) op.critical_assigned += 1;
      if (candidate.breached_sla) op.overdue_assigned += 1;
    }
  }

  return decisions;
}
