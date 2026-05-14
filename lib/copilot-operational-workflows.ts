import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";
import {
  findOpenOperationalWorkflowByDedupeKey,
  insertOperationalWorkflow,
  listOperationalWorkflows,
  mapOperationalWorkflowRow,
} from "@/lib/data/operational-workflows-repository";
import { getOperationalWorkflowTemplate } from "@/lib/copilot-operational-workflows-templates";
import { readWorkspaceWorkflowExecutions } from "@/lib/copilot-operational-workflows-store";
import type {
  OperationalWorkflowExecution,
  OperationalWorkflowType,
  OperationalWorkflowsHealth,
  OperationalWorkflowsResponse,
  WorkflowExecutionStatus,
  WorkflowExecutionStep,
  WorkflowMutationInput,
} from "@/lib/copilot-operational-workflows-types";

const OPEN_ACTION_STATUSES = new Set(["pending", "in_progress", "blocked"]);
const STEP_SLA_MS = 24 * 60 * 60 * 1000;

export type OperationalWorkflowsBuildInput = {
  workspaceCompanyId: string;
  now: Date;
  snapshot: Pick<
    CopilotRutasSnapshot,
    "narratives" | "recommendations" | "memory" | "generatedAt"
  >;
  actions: OperationalActionListItem[];
};

type WorkflowCandidate = {
  type: OperationalWorkflowType;
  dedupeKey: string;
  relatedActionIds?: string[];
  relatedNarrativeIds?: string[];
  relatedMemoryIds?: string[];
};

type WorkflowBuildStats = {
  generated: number;
  deduped: number;
  blocked: number;
  completed: number;
  active: number;
  overdue: number;
};

type WorkflowMergeResult = {
  response: OperationalWorkflowsResponse;
  stats: WorkflowBuildStats;
  created: OperationalWorkflowExecution[];
};

function isOpenAction(action: OperationalActionListItem): boolean {
  return OPEN_ACTION_STATUSES.has(action.operational_status);
}

function executionIdFor(dedupeKey: string): string {
  return `wf:${dedupeKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function isOverdue(dueAt: string | null, now: Date, status: WorkflowExecutionStatus): boolean {
  if (!dueAt || status === "completed" || status === "cancelled") return false;
  return new Date(dueAt).getTime() < now.getTime();
}

export function computeWorkflowProgressPercent(steps: WorkflowExecutionStep[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((step) => step.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
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

function instantiateWorkflow(
  candidate: WorkflowCandidate,
  input: OperationalWorkflowsBuildInput
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
  };

  return recomputeWorkflowExecution(execution, input.now);
}

function detectWorkflowCandidates(input: OperationalWorkflowsBuildInput): WorkflowCandidate[] {
  const candidates: WorkflowCandidate[] = [];

  const criticalCashNarrative = input.snapshot.narratives.find(
    (narrative) =>
      narrative.category === "cashflow" &&
      (narrative.severity === "critical" || narrative.id === "narrative:cash-critical")
  );
  if (criticalCashNarrative) {
    candidates.push({
      type: "critical_cash",
      dedupeKey: "workflow:critical_cash:caja-critica",
      relatedNarrativeIds: [criticalCashNarrative.id],
    });
  }

  const criticalCashRecommendation = input.snapshot.recommendations.find(
    (recommendation) =>
      recommendation.category === "cashflow" &&
      (recommendation.priority === "critical" || recommendation.id === "strategic:cash-critical")
  );
  if (criticalCashRecommendation) {
    candidates.push({
      type: "critical_cash",
      dedupeKey: "workflow:critical_cash:caja-critica",
      relatedNarrativeIds: criticalCashRecommendation.relatedNarrativeIds,
    });
  }

  const collectionsRecommendation = input.snapshot.recommendations.find(
    (recommendation) => recommendation.category === "collections"
  );
  const collectionsNarrative = input.snapshot.narratives.find(
    (narrative) => narrative.category === "collections"
  );
  if (collectionsRecommendation || collectionsNarrative) {
    candidates.push({
      type: "priority_collections",
      dedupeKey: "workflow:priority_collections:cobranza",
      relatedNarrativeIds: collectionsNarrative ? [collectionsNarrative.id] : undefined,
    });
  }

  const recurringMemory = input.snapshot.memory.find((signal) => signal.type === "recurring_issue");
  if (recurringMemory) {
    candidates.push({
      type: "blocked_followup",
      dedupeKey: "workflow:blocked_followup:recurring",
      relatedMemoryIds: [recurringMemory.id],
      relatedActionIds: recurringMemory.relatedActionIds,
    });
  }

  const blockedActions = input.actions.filter(
    (action) => isOpenAction(action) && action.operational_status === "blocked"
  );
  if (blockedActions.length > 0) {
    candidates.push({
      type: "blocked_followup",
      dedupeKey: "workflow:blocked_followup:blocked-open",
      relatedActionIds: blockedActions.map((action) => action.id),
    });
  }

  const deduped = new Map<string, WorkflowCandidate>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.dedupeKey)) {
      deduped.set(candidate.dedupeKey, candidate);
    }
  }
  return [...deduped.values()];
}

function hasActiveExecution(
  executions: OperationalWorkflowExecution[],
  dedupeKey: string
): boolean {
  return executions.some(
    (execution) =>
      execution.dedupeKey === dedupeKey &&
      (execution.status === "active" || execution.status === "blocked")
  );
}

function summarizeWorkflowStats(workflows: OperationalWorkflowExecution[]): WorkflowBuildStats {
  const stats: WorkflowBuildStats = {
    generated: 0,
    deduped: 0,
    blocked: 0,
    completed: 0,
    active: 0,
    overdue: 0,
  };
  for (const execution of workflows) {
    if (execution.status === "blocked") stats.blocked += 1;
    if (execution.status === "completed") stats.completed += 1;
    if (execution.status === "active") stats.active += 1;
    if (execution.isOverdue) stats.overdue += 1;
  }
  return stats;
}

export function mergeOperationalWorkflows(
  input: OperationalWorkflowsBuildInput,
  existing: OperationalWorkflowExecution[],
  health: OperationalWorkflowsHealth = { status: "ok", warnings: [] }
): WorkflowMergeResult {
  const recomputedExisting = existing.map((execution) =>
    recomputeWorkflowExecution(execution, input.now)
  );
  const stats: WorkflowBuildStats = {
    generated: 0,
    deduped: 0,
    blocked: 0,
    completed: 0,
    active: 0,
    overdue: 0,
  };
  const created: OperationalWorkflowExecution[] = [];
  const candidates = detectWorkflowCandidates(input);
  const merged = new Map(recomputedExisting.map((execution) => [execution.id, execution]));

  for (const candidate of candidates) {
    if (hasActiveExecution([...merged.values()], candidate.dedupeKey)) {
      stats.deduped += 1;
      continue;
    }
    const workflow = instantiateWorkflow(candidate, input);
    merged.set(workflow.id, workflow);
    created.push(workflow);
    stats.generated += 1;
  }

  const workflows = [...merged.values()]
    .map((execution) => recomputeWorkflowExecution(execution, input.now))
    .filter((execution) => execution.status !== "cancelled")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const summary = summarizeWorkflowStats(workflows);
  stats.blocked = summary.blocked;
  stats.completed = summary.completed;
  stats.active = summary.active;
  stats.overdue = summary.overdue;

  logWorkflowObservability(stats);

  return {
    response: {
      workflows,
      generatedAt: input.now.toISOString(),
      health,
    },
    stats,
    created,
  };
}

export async function buildOperationalWorkflows(
  client: SupabaseClient,
  input: OperationalWorkflowsBuildInput
): Promise<WorkflowMergeResult> {
  const warnings: OperationalWorkflowsHealth["warnings"] = [];
  let existing: OperationalWorkflowExecution[] = [];

  const listResult = await listOperationalWorkflows(client, input.workspaceCompanyId);
  if (listResult.error) {
    warnings.push({
      source: "workflows",
      code: "DB_READ_FAILED",
      message: listResult.error.message,
    });
    existing = readWorkspaceWorkflowExecutions(input.workspaceCompanyId);
  } else {
    existing = (listResult.data ?? []).map((row) =>
      mapOperationalWorkflowRow(row as Record<string, unknown>)
    );
  }

  const health: OperationalWorkflowsHealth = {
    status: warnings.length > 0 ? "partial" : "ok",
    warnings,
  };
  const merged = mergeOperationalWorkflows(input, existing, health);
  const persistedByDedupe = new Map(
    merged.response.workflows.map((workflow) => [workflow.dedupeKey, workflow])
  );

  for (const workflow of merged.created) {
    const insertResult = await insertOperationalWorkflow(client, workflow);
    if (insertResult.error) {
      merged.stats.deduped += 1;
      merged.stats.generated = Math.max(0, merged.stats.generated - 1);
      const openResult = await findOpenOperationalWorkflowByDedupeKey(
        client,
        input.workspaceCompanyId,
        workflow.dedupeKey
      );
      if (openResult.data) {
        const persisted = recomputeWorkflowExecution(
          mapOperationalWorkflowRow(openResult.data as Record<string, unknown>),
          input.now
        );
        persistedByDedupe.set(persisted.dedupeKey, persisted);
      }
      continue;
    }
    if (insertResult.data) {
      const persisted = recomputeWorkflowExecution(
        mapOperationalWorkflowRow(insertResult.data as Record<string, unknown>),
        input.now
      );
      persistedByDedupe.set(persisted.dedupeKey, persisted);
    }
  }

  const workflows = [...persistedByDedupe.values()]
    .filter((execution) => execution.status !== "cancelled")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const summary = summarizeWorkflowStats(workflows);
  merged.stats.blocked = summary.blocked;
  merged.stats.completed = summary.completed;
  merged.stats.active = summary.active;
  merged.stats.overdue = summary.overdue;
  merged.response.workflows = workflows;

  return merged;
}

export function applyWorkflowMutation(
  execution: OperationalWorkflowExecution,
  mutation: WorkflowMutationInput,
  now: Date
): OperationalWorkflowExecution {
  const steps = execution.steps.map((step) => ({ ...step }));
  let status = execution.status;
  let ownerLabel = execution.ownerLabel;
  let assignedUserId = execution.assignedUserId ?? null;

  if (mutation.action === "assign") {
    ownerLabel = mutation.ownerLabel ?? mutation.assignedTo ?? ownerLabel;
    assignedUserId = mutation.assignedUserId ?? assignedUserId;
    for (const step of steps) {
      if (step.status === "active" || step.status === "blocked") {
        step.ownerLabel = ownerLabel;
      }
    }
  }

  if (mutation.action === "complete_step" && mutation.stepId) {
    const index = steps.findIndex((step) => step.stepId === mutation.stepId);
    if (index >= 0) {
      steps[index] = {
        ...steps[index],
        status: "completed",
        completedAt: now.toISOString(),
        blockedReason: null,
      };
      const next = steps[index + 1];
      if (next && next.status === "pending") {
        steps[index + 1] = {
          ...next,
          status: "active",
          activatedAt: now.toISOString(),
          dueAt: addHours(now.toISOString(), 24),
        };
      }
    }
    status = "active";
  }

  if (mutation.action === "block_step" && mutation.stepId) {
    const index = steps.findIndex((step) => step.stepId === mutation.stepId);
    if (index >= 0) {
      steps[index] = {
        ...steps[index],
        status: "blocked",
        blockedReason: mutation.blockedReason ?? "Bloqueado manualmente.",
      };
    }
    status = "blocked";
  }

  if (mutation.action === "block") {
    status = "blocked";
    for (const step of steps) {
      if (step.status === "active") {
        step.status = "blocked";
        step.blockedReason = mutation.blockedReason ?? "Workflow bloqueado.";
      }
    }
  }

  if (mutation.action === "unblock") {
    status = "active";
    for (const step of steps) {
      if (step.status === "blocked") {
        step.status = step.completedAt ? "completed" : "active";
        step.blockedReason = null;
      }
    }
  }

  if (mutation.action === "cancel") {
    status = "cancelled";
  }

  return recomputeWorkflowExecution(
    {
      ...execution,
      status,
      ownerLabel,
      assignedUserId,
      steps,
    },
    now
  );
}

export function logWorkflowObservability(stats: WorkflowBuildStats): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[copilot-operational-workflows]", {
    generated: stats.generated,
    deduped: stats.deduped,
    blocked: stats.blocked,
    completed: stats.completed,
    active: stats.active,
    overdue: stats.overdue,
  });
}

export function isWorkflowStepOverdue(
  step: WorkflowExecutionStep,
  now: Date,
  workflowStatus: WorkflowExecutionStatus
): boolean {
  if (step.status === "completed" || step.status === "skipped") return false;
  if (!step.dueAt) {
    if (!step.activatedAt) return false;
    return now.getTime() - new Date(step.activatedAt).getTime() > STEP_SLA_MS;
  }
  return isOverdue(step.dueAt, now, workflowStatus);
}
