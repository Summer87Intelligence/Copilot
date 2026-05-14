import type {
  OperationalWorkflowExecution,
  OperationalWorkflowType,
  WorkflowSlaStatus,
} from "@/lib/copilot-operational-workflows-types";
import { readWorkflowLifecycleContext } from "@/lib/copilot-operational-workflow-lifecycle";
import type { WorkflowSignalStrength } from "@/lib/copilot-operational-workflow-signals";

const WARNING_WINDOW_MS = 4 * 60 * 60 * 1000;

export type WorkflowSlaSnapshot = {
  slaStatus: WorkflowSlaStatus;
  slaDueAt: string | null;
};

export function resolveWorkflowSlaDueAt(execution: OperationalWorkflowExecution): string | null {
  const activeStep = execution.steps.find(
    (step) => step.status === "active" || step.status === "blocked"
  );
  return activeStep?.dueAt ?? execution.nextDueAt ?? null;
}

export function computeWorkflowSla(
  execution: OperationalWorkflowExecution,
  now: Date
): WorkflowSlaSnapshot {
  const slaDueAt = resolveWorkflowSlaDueAt(execution);
  if (!slaDueAt || execution.status === "completed" || execution.status === "cancelled") {
    return { slaStatus: "healthy", slaDueAt };
  }

  const dueMs = new Date(slaDueAt).getTime();
  const nowMs = now.getTime();
  if (dueMs < nowMs) {
    return { slaStatus: "breached", slaDueAt };
  }
  if (dueMs - nowMs <= WARNING_WINDOW_MS) {
    return { slaStatus: "warning", slaDueAt };
  }
  return { slaStatus: "healthy", slaDueAt };
}

function severityBonus(type: OperationalWorkflowType, signalStrength: WorkflowSignalStrength): number {
  if (signalStrength === "critical") return 50;
  if (signalStrength === "high") return 30;
  if (type === "critical_cash") return 50;
  if (type === "priority_collections") return 30;
  return 0;
}

export function computeWorkflowUrgencyScore(
  execution: OperationalWorkflowExecution,
  now: Date,
  options: { signalStrength?: WorkflowSignalStrength } = {}
): number {
  const lifecycle = readWorkflowLifecycleContext(execution);
  const sla = computeWorkflowSla(execution, now);
  let score = severityBonus(execution.type, options.signalStrength ?? "normal");

  if (execution.status === "blocked") score += 25;
  if (sla.slaStatus === "breached") score += 25;
  if (execution.type === "blocked_followup") score += 15;
  if (!execution.ownerLabel && !execution.assignedUserId) score += 10;
  score += (lifecycle.reopenCount ?? 0) * 5;

  const ageMs = now.getTime() - new Date(execution.createdAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) score += 10;

  return score;
}

export function compareWorkflowPriority(
  left: OperationalWorkflowExecution,
  right: OperationalWorkflowExecution
): number {
  if (left.status === "blocked" && right.status !== "blocked") return -1;
  if (right.status === "blocked" && left.status !== "blocked") return 1;

  const urgencyDelta = (right.urgencyScore ?? 0) - (left.urgencyScore ?? 0);
  if (urgencyDelta !== 0) return urgencyDelta;

  const slaRank: Record<WorkflowSlaStatus, number> = {
    breached: 0,
    warning: 1,
    healthy: 2,
  };
  const leftSla = slaRank[left.slaStatus ?? "healthy"];
  const rightSla = slaRank[right.slaStatus ?? "healthy"];
  if (leftSla !== rightSla) return leftSla - rightSla;

  const leftDue = left.slaDueAt ? new Date(left.slaDueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDue = right.slaDueAt ? new Date(right.slaDueAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;

  return right.updatedAt.localeCompare(left.updatedAt);
}
