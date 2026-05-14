import type { OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { getOperationalWorkflowTemplate } from "@/lib/copilot-operational-workflows-templates";
import {
  applyWorkflowCancelLifecycle,
  clearWorkflowSuppression,
  incrementWorkflowReopenCount,
  isEarlyCancelledWorkflow,
  isWorkflowSuppressed,
  readWorkflowLifecycleContext,
  withWorkflowLifecycleContext,
} from "@/lib/copilot-operational-workflow-lifecycle";
import {
  compareWorkflowPriority,
  computeWorkflowSla,
  computeWorkflowUrgencyScore,
} from "@/lib/copilot-operational-workflow-scoring";
import {
  buildWorkflowSignalHash,
  detectWorkflowSignalCandidates,
  hasSignalEscalated,
  hasWorkflowJustifyingSignal,
  resolveWorkflowSignalStrength,
  type WorkflowSignalCandidate,
  type WorkflowSignalsInput,
} from "@/lib/copilot-operational-workflow-signals";
import type {
  OperationalWorkflowExecution,
  OperationalWorkflowsHealth,
  OperationalWorkflowsResponse,
  WorkflowExecutionStep,
  WorkflowRelatedCounts,
} from "@/lib/copilot-operational-workflows-types";
import { recomputeWorkflowExecution } from "@/lib/copilot-operational-workflow-engine";

export type WorkflowReconciliationEvent =
  | { type: "workflow_suppressed"; workflow: OperationalWorkflowExecution; detail: string }
  | { type: "workflow_reopened"; workflow: OperationalWorkflowExecution }
  | { type: "workflow_auto_completed"; workflow: OperationalWorkflowExecution }
  | { type: "workflow_sla_breached"; workflow: OperationalWorkflowExecution }
  | { type: "workflow_escalated"; workflow: OperationalWorkflowExecution; detail: string };

export type WorkflowReconcileStats = {
  generated: number;
  deduped: number;
  blocked: number;
  completed: number;
  active: number;
  overdue: number;
  suppressed: number;
  reopened: number;
  autoCompleted: number;
};

export type WorkflowReconcileResult = {
  response: OperationalWorkflowsResponse;
  stats: WorkflowReconcileStats;
  created: OperationalWorkflowExecution[];
  updated: OperationalWorkflowExecution[];
  events: WorkflowReconciliationEvent[];
  hasSuppressedWorkflows: boolean;
};

export type OperationalWorkflowReconcileInput = WorkflowSignalsInput & {
  workspaceCompanyId: string;
  now: Date;
};

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function executionIdFor(dedupeKey: string): string {
  return `wf:${dedupeKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

function instantiateWorkflow(
  candidate: WorkflowSignalCandidate,
  input: OperationalWorkflowReconcileInput
): OperationalWorkflowExecution {
  const template = getOperationalWorkflowTemplate(candidate.type);
  const nowIso = input.now.toISOString();
  const steps: WorkflowExecutionStep[] = template.steps.map((step, index) => ({
    stepId: step.id,
    title: step.title,
    order: step.order,
    status: index === 0 ? "active" : "pending",
    ownerLabel: null,
    dueAt: index === 0 ? addHours(nowIso, 24) : null,
    activatedAt: index === 0 ? nowIso : null,
    completedAt: null,
    blockedReason: null,
    metadata: step.href ? { href: step.href } : undefined,
  }));

  const execution: OperationalWorkflowExecution = {
    id: executionIdFor(candidate.dedupeKey),
    workspaceCompanyId: input.workspaceCompanyId,
    templateId: template.id,
    type: candidate.type,
    title: template.title,
    dedupeKey: candidate.dedupeKey,
    status: "active",
    progressPercent: 0,
    currentStepId: steps[0]?.stepId ?? null,
    currentStepTitle: steps[0]?.title ?? null,
    ownerLabel: null,
    assignedUserId: null,
    nextDueAt: steps[0]?.dueAt ?? null,
    isOverdue: false,
    steps,
    createdAt: nowIso,
    updatedAt: nowIso,
    relatedActionIds: candidate.relatedActionIds,
    relatedNarrativeIds: candidate.relatedNarrativeIds,
    relatedMemoryIds: candidate.relatedMemoryIds,
    lifecycle: {
      lastSignalHash: buildWorkflowSignalHash(candidate),
      reopenCount: 0,
    },
  };

  return recomputeWorkflowExecution(execution, input.now);
}

function resetWorkflowStepsForReopen(
  execution: OperationalWorkflowExecution,
  input: OperationalWorkflowReconcileInput
): OperationalWorkflowExecution {
  const template = getOperationalWorkflowTemplate(execution.type);
  const nowIso = input.now.toISOString();
  const steps: WorkflowExecutionStep[] = template.steps.map((step, index) => ({
    stepId: step.id,
    title: step.title,
    order: step.order,
    status: index === 0 ? "active" : "pending",
    ownerLabel: null,
    dueAt: index === 0 ? addHours(nowIso, 24) : null,
    activatedAt: index === 0 ? nowIso : null,
    completedAt: null,
    blockedReason: null,
    metadata: step.href ? { href: step.href } : undefined,
  }));
  return {
    ...execution,
    status: "active",
    steps,
    progressPercent: 0,
    currentStepId: steps[0]?.stepId ?? null,
    currentStepTitle: steps[0]?.title ?? null,
    nextDueAt: steps[0]?.dueAt ?? null,
  };
}

function reopenWorkflow(
  execution: OperationalWorkflowExecution,
  candidate: WorkflowSignalCandidate,
  input: OperationalWorkflowReconcileInput
): OperationalWorkflowExecution {
  const base = clearWorkflowSuppression(incrementWorkflowReopenCount(execution));
  const reopened = isEarlyCancelledWorkflow(execution)
    ? resetWorkflowStepsForReopen(base, input)
    : { ...base, status: "active" as const };
  const lifecycle = readWorkflowLifecycleContext(reopened);
  return recomputeWorkflowExecution(
    withWorkflowLifecycleContext(reopened, {
      ...lifecycle,
      lastSignalHash: buildWorkflowSignalHash(candidate),
    }),
    input.now
  );
}

function autoCompleteWorkflow(
  execution: OperationalWorkflowExecution,
  input: OperationalWorkflowReconcileInput
): OperationalWorkflowExecution {
  const completedSteps = execution.steps.map((step) => ({
    ...step,
    status: step.status === "skipped" ? "skipped" : "completed",
    completedAt: step.completedAt ?? input.now.toISOString(),
    blockedReason: null,
  })) as WorkflowExecutionStep[];

  return recomputeWorkflowExecution(
    {
      ...execution,
      status: "completed",
      steps: completedSteps,
      progressPercent: 100,
    },
    input.now
  );
}

function deriveRelatedCounts(
  execution: OperationalWorkflowExecution,
  input: OperationalWorkflowReconcileInput
): WorkflowRelatedCounts {
  const feedItems = input.snapshot.feed?.items ?? [];
  const relatedActions = execution.relatedActionIds?.length ?? 0;
  const alerts = feedItems.filter(
    (item: OperationalFeedItem) =>
      item.source === "alert" &&
      (execution.type === "critical_cash"
        ? item.severity === "critical" || item.severity === "high"
        : execution.type === "priority_collections"
          ? item.title.toLowerCase().includes("cobranza") || item.source === "alert"
          : item.blocked === true)
  ).length;
  const insights = feedItems.filter((item: OperationalFeedItem) => item.source === "insight").length;

  return {
    actions: relatedActions,
    alerts,
    insights,
  };
}

function enrichWorkflow(
  execution: OperationalWorkflowExecution,
  input: OperationalWorkflowReconcileInput,
  candidate?: WorkflowSignalCandidate
): OperationalWorkflowExecution {
  const signalStrength = candidate
    ? resolveWorkflowSignalStrength(candidate, input)
    : resolveWorkflowSignalStrength(
        {
          type: execution.type,
          dedupeKey: execution.dedupeKey,
          relatedActionIds: execution.relatedActionIds,
          relatedNarrativeIds: execution.relatedNarrativeIds,
          relatedMemoryIds: execution.relatedMemoryIds,
        },
        input
      );
  const sla = computeWorkflowSla(execution, input.now);
  const urgencyScore = computeWorkflowUrgencyScore(execution, input.now, { signalStrength });
  const lifecycle = readWorkflowLifecycleContext(execution);
  return {
    ...execution,
    slaStatus: sla.slaStatus,
    slaDueAt: sla.slaDueAt,
    urgencyScore,
    relatedCounts: deriveRelatedCounts(execution, input),
    lifecycle: {
      ...lifecycle,
      lastUrgencyScore: urgencyScore,
    },
    isOverdue: sla.slaStatus === "breached",
    suppressed: isWorkflowSuppressed(execution, input.now),
  };
}

function summarizeStats(workflows: OperationalWorkflowExecution[]): WorkflowReconcileStats {
  const stats: WorkflowReconcileStats = {
    generated: 0,
    deduped: 0,
    blocked: 0,
    completed: 0,
    active: 0,
    overdue: 0,
    suppressed: 0,
    reopened: 0,
    autoCompleted: 0,
  };
  for (const execution of workflows) {
    if (execution.status === "blocked") stats.blocked += 1;
    if (execution.status === "completed") stats.completed += 1;
    if (execution.status === "active") stats.active += 1;
    if (execution.isOverdue) stats.overdue += 1;
    if (execution.suppressed) stats.suppressed += 1;
  }
  return stats;
}

function findLatestByDedupeKey(
  executions: OperationalWorkflowExecution[],
  dedupeKey: string
): OperationalWorkflowExecution | null {
  const matches = executions
    .filter((execution) => execution.dedupeKey === dedupeKey)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return matches[0] ?? null;
}

function hasOpenExecution(executions: OperationalWorkflowExecution[], dedupeKey: string): boolean {
  return executions.some(
    (execution) =>
      execution.dedupeKey === dedupeKey &&
      (execution.status === "active" || execution.status === "blocked")
  );
}

export function reconcileOperationalWorkflows(
  input: OperationalWorkflowReconcileInput,
  existing: OperationalWorkflowExecution[],
  health: OperationalWorkflowsHealth = { status: "ok", warnings: [] }
): WorkflowReconcileResult {
  const events: WorkflowReconciliationEvent[] = [];
  const created: OperationalWorkflowExecution[] = [];
  const updated: OperationalWorkflowExecution[] = [];
  const stats: WorkflowReconcileStats = {
    generated: 0,
    deduped: 0,
    blocked: 0,
    completed: 0,
    active: 0,
    overdue: 0,
    suppressed: 0,
    reopened: 0,
    autoCompleted: 0,
  };

  const recomputed = existing.map((execution) => recomputeWorkflowExecution(execution, input.now));
  const merged = new Map(recomputed.map((execution) => [execution.id, execution]));
  const candidates = detectWorkflowSignalCandidates(input);

  for (const execution of [...merged.values()]) {
    if (execution.status !== "active" && execution.status !== "blocked") continue;
    if (execution.status === "blocked") continue;
    if (!hasWorkflowJustifyingSignal(execution, input)) {
      const autoCompleted = autoCompleteWorkflow(execution, input);
      merged.set(autoCompleted.id, autoCompleted);
      updated.push(autoCompleted);
      events.push({ type: "workflow_auto_completed", workflow: autoCompleted });
      stats.autoCompleted += 1;
    }
  }

  for (const candidate of candidates) {
    if (hasOpenExecution([...merged.values()], candidate.dedupeKey)) {
      const open = findLatestByDedupeKey([...merged.values()], candidate.dedupeKey);
      if (open) {
        const enriched = enrichWorkflow(
          withWorkflowLifecycleContext(open, {
            ...readWorkflowLifecycleContext(open),
            lastSignalHash: buildWorkflowSignalHash(candidate),
          }),
          input,
          candidate
        );
        merged.set(enriched.id, enriched);
        if (enriched.id === open.id && enriched.lifecycle?.lastSignalHash !== open.lifecycle?.lastSignalHash) {
          updated.push(enriched);
        }
      }
      stats.deduped += 1;
      continue;
    }

    const latest = findLatestByDedupeKey([...merged.values()], candidate.dedupeKey);
    const signalStrength = resolveWorkflowSignalStrength(candidate, input);
    const previousStrength = latest
      ? resolveWorkflowSignalStrength(
          {
            type: latest.type,
            dedupeKey: latest.dedupeKey,
            relatedActionIds: latest.relatedActionIds,
            relatedNarrativeIds: latest.relatedNarrativeIds,
            relatedMemoryIds: latest.relatedMemoryIds,
          },
          input
        )
      : "normal";

    if (latest?.status === "cancelled") {
      const lifecycle = readWorkflowLifecycleContext(latest);
      const insideCooldown = isWorkflowSuppressed(latest, input.now);
      const escalated = hasSignalEscalated(previousStrength, signalStrength);
      if (insideCooldown && !escalated) {
        const suppressed = enrichWorkflow(
          withWorkflowLifecycleContext(latest, {
            ...lifecycle,
            suppressedReason: lifecycle.suppressedReason ?? "Cancelado por el usuario.",
          }),
          input,
          candidate
        );
        merged.set(suppressed.id, { ...suppressed, suppressed: true });
        events.push({
          type: "workflow_suppressed",
          workflow: suppressed,
          detail: suppressed.lifecycle?.suppressedReason ?? "Suprimido temporalmente.",
        });
        stats.suppressed += 1;
        stats.deduped += 1;
        continue;
      }

      const reopened = enrichWorkflow(reopenWorkflow(latest, candidate, input), input, candidate);
      merged.set(reopened.id, reopened);
      updated.push(reopened);
      events.push({ type: "workflow_reopened", workflow: reopened });
      stats.reopened += 1;
      continue;
    }

    const workflow = enrichWorkflow(instantiateWorkflow(candidate, input), input, candidate);
    merged.set(workflow.id, workflow);
    created.push(workflow);
    stats.generated += 1;
  }

  const workflows = [...merged.values()]
    .filter((execution) => execution.status !== "cancelled")
    .map((execution) => enrichWorkflow(execution, input))
    .sort(compareWorkflowPriority);

  const previousById = new Map(existing.map((execution) => [execution.id, execution]));
  for (const execution of workflows) {
    const previous = previousById.get(execution.id);
    const previousLifecycle = previous ? readWorkflowLifecycleContext(previous) : null;
    const previousScore = previousLifecycle?.lastUrgencyScore ?? previous?.urgencyScore ?? 0;
    const currentScore = execution.urgencyScore ?? 0;
    if (currentScore - previousScore >= 20) {
      events.push({
        type: "workflow_escalated",
        workflow: execution,
        detail: `${previousScore} → ${currentScore}`,
      });
    }
    const previousSla = previous ? computeWorkflowSla(previous, input.now).slaStatus : "healthy";
    if (execution.slaStatus === "breached" && previousSla !== "breached") {
      events.push({ type: "workflow_sla_breached", workflow: execution });
    }
  }

  const summary = summarizeStats(workflows);
  stats.blocked = summary.blocked;
  stats.completed = summary.completed;
  stats.active = summary.active;
  stats.overdue = summary.overdue;
  stats.suppressed = summary.suppressed;

  return {
    response: {
      workflows,
      generatedAt: input.now.toISOString(),
      health,
      hasSuppressedWorkflows: events.some((event) => event.type === "workflow_suppressed"),
    },
    stats,
    created,
    updated,
    events,
    hasSuppressedWorkflows: events.some((event) => event.type === "workflow_suppressed"),
  };
}

export function applyWorkflowCancelReconciliation(
  execution: OperationalWorkflowExecution,
  now: Date
): OperationalWorkflowExecution {
  return applyWorkflowCancelLifecycle(execution, now);
}
