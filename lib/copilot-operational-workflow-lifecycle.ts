import type {
  OperationalWorkflowExecution,
  WorkflowLifecycleContext,
} from "@/lib/copilot-operational-workflows-types";

export const WORKFLOW_CANCEL_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export function readWorkflowLifecycleContext(
  execution: OperationalWorkflowExecution
): WorkflowLifecycleContext {
  return {
    suppressedUntil: execution.lifecycle?.suppressedUntil ?? null,
    suppressedReason: execution.lifecycle?.suppressedReason ?? null,
    lastCancelledAt: execution.lifecycle?.lastCancelledAt ?? null,
    lastSignalHash: execution.lifecycle?.lastSignalHash ?? null,
    reopenCount: execution.lifecycle?.reopenCount ?? 0,
    lastUrgencyScore: execution.lifecycle?.lastUrgencyScore ?? 0,
  };
}

export function withWorkflowLifecycleContext(
  execution: OperationalWorkflowExecution,
  lifecycle: WorkflowLifecycleContext
): OperationalWorkflowExecution {
  return {
    ...execution,
    lifecycle,
  };
}

export function applyWorkflowCancelLifecycle(
  execution: OperationalWorkflowExecution,
  now: Date,
  reason = "Cancelado por el usuario."
): OperationalWorkflowExecution {
  const lifecycle = readWorkflowLifecycleContext(execution);
  const suppressedUntil = new Date(now.getTime() + WORKFLOW_CANCEL_COOLDOWN_MS).toISOString();
  return withWorkflowLifecycleContext(execution, {
    ...lifecycle,
    lastCancelledAt: now.toISOString(),
    suppressedUntil,
    suppressedReason: reason,
  });
}

export function isWorkflowSuppressed(
  execution: OperationalWorkflowExecution,
  now: Date
): boolean {
  const lifecycle = readWorkflowLifecycleContext(execution);
  if (!lifecycle.suppressedUntil) return false;
  return new Date(lifecycle.suppressedUntil).getTime() > now.getTime();
}

export function clearWorkflowSuppression(
  execution: OperationalWorkflowExecution
): OperationalWorkflowExecution {
  const lifecycle = readWorkflowLifecycleContext(execution);
  return withWorkflowLifecycleContext(execution, {
    ...lifecycle,
    suppressedUntil: null,
    suppressedReason: null,
  });
}

export function incrementWorkflowReopenCount(
  execution: OperationalWorkflowExecution
): OperationalWorkflowExecution {
  const lifecycle = readWorkflowLifecycleContext(execution);
  return withWorkflowLifecycleContext(execution, {
    ...lifecycle,
    reopenCount: (lifecycle.reopenCount ?? 0) + 1,
  });
}

export function isEarlyCancelledWorkflow(execution: OperationalWorkflowExecution): boolean {
  if (execution.progressPercent > 20) return false;
  const completedSteps = execution.steps.filter((step) => step.status === "completed").length;
  return completedSteps <= 1;
}
