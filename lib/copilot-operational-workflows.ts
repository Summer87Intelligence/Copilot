import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";
import {
  OperationalEventRequestBuffer,
  recordWorkflowCreatedEvent,
  recordWorkflowReconciliationEvents,
  recordOperationalAutomationEvents,
  listOperationalTimeline,
} from "@/lib/copilot-operational-events";
import { runOperationalAutomations } from "@/lib/copilot-operational-automation-engine";
import { summarizeAutomationMetadata } from "@/lib/copilot-operational-automation-rules";
import type { OperationalEventActor } from "@/lib/copilot-operational-events-types";
import {
  applyWorkflowCancelLifecycle,
} from "@/lib/copilot-operational-workflow-lifecycle";
import { recomputeWorkflowExecution } from "@/lib/copilot-operational-workflow-engine";
import { reconcileOperationalWorkflows } from "@/lib/copilot-operational-reconciliation";
import {
  findOpenOperationalWorkflowByDedupeKey,
  insertOperationalWorkflow,
  listOperationalWorkflows,
  mapOperationalWorkflowRow,
  updateOperationalWorkflowById,
} from "@/lib/data/operational-workflows-repository";
import { readWorkspaceWorkflowExecutions } from "@/lib/copilot-operational-workflows-store";
import type {
  OperationalWorkflowExecution,
  OperationalWorkflowsHealth,
  OperationalWorkflowsResponse,
  WorkflowExecutionStatus,
  WorkflowExecutionStep,
  WorkflowMutationInput,
} from "@/lib/copilot-operational-workflows-types";

export { computeWorkflowProgressPercent, recomputeWorkflowExecution } from "@/lib/copilot-operational-workflow-engine";

const STEP_SLA_MS = 24 * 60 * 60 * 1000;

export type OperationalWorkflowsBuildInput = {
  workspaceCompanyId: string;
  now: Date;
  snapshot: Pick<
    CopilotRutasSnapshot,
    "narratives" | "recommendations" | "memory" | "feed" | "generatedAt"
  >;
  actions: OperationalActionListItem[];
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
  hasSuppressedWorkflows: boolean;
};

export type OperationalWorkflowBuildContext = {
  eventBuffer?: OperationalEventRequestBuffer;
  actor?: OperationalEventActor | null;
};

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function mergeOperationalWorkflows(
  input: OperationalWorkflowsBuildInput,
  existing: OperationalWorkflowExecution[],
  health: OperationalWorkflowsHealth = { status: "ok", warnings: [] }
): WorkflowMergeResult {
  const reconciled = reconcileOperationalWorkflows(input, existing, health);
  reconciled.response.hasSuppressedWorkflows = reconciled.hasSuppressedWorkflows;
  return {
    response: reconciled.response,
    stats: reconciled.stats,
    created: reconciled.created,
    hasSuppressedWorkflows: reconciled.hasSuppressedWorkflows,
  };
}

export async function buildOperationalWorkflows(
  client: SupabaseClient,
  input: OperationalWorkflowsBuildInput,
  context?: OperationalWorkflowBuildContext
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
  const reconciled = reconcileOperationalWorkflows(input, existing, health);
  const events = await listOperationalTimeline(client, input.workspaceCompanyId, 20);
  const automationRun = runOperationalAutomations({
    workspaceCompanyId: input.workspaceCompanyId,
    now: input.now,
    snapshot: input.snapshot,
    workflows: reconciled.response.workflows,
    actions: input.actions,
    events,
    memorySignals: input.snapshot.memory,
  });
  reconciled.response.workflows = automationRun.workflows;
  reconciled.response.automation = {
    automations: automationRun.automations,
    escalations: automationRun.escalations,
    recommendations: automationRun.recommendations,
    memoryDerived: automationRun.memoryDerived,
    computedAt: automationRun.computedAt,
  };
  reconciled.response.automationMetadata = summarizeAutomationMetadata(
    automationRun.automations,
    automationRun.escalations,
    automationRun.recommendations
  );

  const persistedById = new Map(
    automationRun.workflows.map((workflow) => [workflow.id, workflow])
  );

  for (const workflow of reconciled.updated) {
    const updateResult = await updateOperationalWorkflowById(
      client,
      input.workspaceCompanyId,
      workflow.id,
      workflow
    );
    if (updateResult.data) {
      const persisted = mapOperationalWorkflowRow(updateResult.data as Record<string, unknown>);
      persistedById.set(persisted.id, persisted);
    }
  }

  for (const workflow of reconciled.created) {
    const insertResult = await insertOperationalWorkflow(client, workflow);
    if (insertResult.error) {
      reconciled.stats.deduped += 1;
      reconciled.stats.generated = Math.max(0, reconciled.stats.generated - 1);
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
        persistedById.set(persisted.id, persisted);
      }
      continue;
    }
    if (insertResult.data) {
      const persisted = recomputeWorkflowExecution(
        mapOperationalWorkflowRow(insertResult.data as Record<string, unknown>),
        input.now
      );
      persistedById.set(persisted.id, persisted);
      await recordWorkflowCreatedEvent(
        client,
        persisted,
        context?.actor ?? { label: "Sistema" },
        context?.eventBuffer
      );
    }
  }

  await recordWorkflowReconciliationEvents(
    client,
    reconciled.events,
    context?.actor ?? { label: "Sistema" },
    context?.eventBuffer
  );
  await recordOperationalAutomationEvents(
    client,
    automationRun.eventDrafts,
    context?.actor ?? { label: "Sistema" },
    context?.eventBuffer
  );

  const workflows = [...persistedById.values()].sort(
    (left, right) => (right.urgencyScore ?? 0) - (left.urgencyScore ?? 0)
  );
  reconciled.response.workflows = workflows;
  reconciled.response.hasSuppressedWorkflows = reconciled.hasSuppressedWorkflows;
  logWorkflowObservability(reconciled.stats);

  return {
    response: reconciled.response,
    stats: reconciled.stats,
    created: reconciled.created,
    hasSuppressedWorkflows: reconciled.hasSuppressedWorkflows,
  };
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
  const lifecycle = execution.lifecycle;

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

  const nextExecution = recomputeWorkflowExecution(
    {
      ...execution,
      status,
      ownerLabel,
      assignedUserId,
      lifecycle,
      steps,
    },
    now
  );

  if (mutation.action === "cancel") {
    return applyWorkflowCancelLifecycle(nextExecution, now);
  }

  return nextExecution;
}

export function logWorkflowObservability(stats: WorkflowBuildStats): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[copilot-operational-workflows]", stats);
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
  if (!step.dueAt || workflowStatus === "completed" || workflowStatus === "cancelled") return false;
  return new Date(step.dueAt).getTime() < now.getTime();
}
