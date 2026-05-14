import type {
  OperationalWorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowExecutionStep,
} from "@/lib/copilot-operational-workflows-types";

export function computeWorkflowProgressPercent(steps: WorkflowExecutionStep[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((step) => step.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function isOverdue(dueAt: string | null, now: Date, status: WorkflowExecutionStatus): boolean {
  if (!dueAt || status === "completed" || status === "cancelled") return false;
  return new Date(dueAt).getTime() < now.getTime();
}

export function recomputeWorkflowExecution(
  execution: OperationalWorkflowExecution,
  now: Date
): OperationalWorkflowExecution {
  const steps = execution.steps.map((step) => ({ ...step }));
  let workflowStatus: WorkflowExecutionStatus = execution.status;

  if (workflowStatus === "cancelled" || workflowStatus === "completed") {
    return {
      ...execution,
      progressPercent: computeWorkflowProgressPercent(steps),
      updatedAt: now.toISOString(),
    };
  }

  const hasBlockedStep = steps.some((step) => step.status === "blocked");
  if (hasBlockedStep) {
    workflowStatus = "blocked";
  } else if (steps.every((step) => step.status === "completed" || step.status === "skipped")) {
    workflowStatus = "completed";
  } else {
    workflowStatus = "active";
  }

  const activeIndex = steps.findIndex(
    (step) => step.status === "active" || step.status === "blocked"
  );
  if (activeIndex === -1) {
    const nextPendingIndex = steps.findIndex((step) => step.status === "pending");
    if (nextPendingIndex >= 0) {
      steps[nextPendingIndex] = {
        ...steps[nextPendingIndex],
        status: "active",
        activatedAt: steps[nextPendingIndex].activatedAt ?? now.toISOString(),
        dueAt: steps[nextPendingIndex].dueAt ?? addHours(now.toISOString(), 24),
      };
    }
  }

  const currentStep =
    steps.find((step) => step.status === "active" || step.status === "blocked") ?? null;
  const ownerLabel =
    currentStep?.ownerLabel ??
    steps.find((step) => step.ownerLabel)?.ownerLabel ??
    execution.ownerLabel ??
    null;
  const nextDueAt = currentStep?.dueAt ?? execution.nextDueAt ?? null;

  return {
    ...execution,
    status: workflowStatus,
    steps,
    progressPercent: computeWorkflowProgressPercent(steps),
    currentStepId: currentStep?.stepId ?? null,
    currentStepTitle: currentStep?.title ?? null,
    ownerLabel,
    nextDueAt,
    isOverdue: isOverdue(nextDueAt, now, workflowStatus),
    updatedAt: now.toISOString(),
  };
}
