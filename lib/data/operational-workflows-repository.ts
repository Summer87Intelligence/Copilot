import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OperationalWorkflowExecution,
  OperationalWorkflowType,
  WorkflowExecutionStatus,
  WorkflowExecutionStep,
  WorkflowLifecycleContext,
} from "@/lib/copilot-operational-workflows-types";

const WORKFLOW_SELECT =
  "id, workspace_company_id, dedupe_key, workflow_type, title, status, current_step_index, assigned_to, assigned_user_id, source, source_id, context, steps, progress, due_at, blocked_reason, completed_at, cancelled_at, created_at, updated_at" as const;

export type OperationalWorkflowRow = {
  id: string;
  workspace_company_id: string;
  dedupe_key: string;
  workflow_type: OperationalWorkflowType;
  title: string;
  status: WorkflowExecutionStatus;
  current_step_index: number;
  assigned_to: string | null;
  assigned_user_id: string | null;
  source: string | null;
  source_id: string | null;
  context: Record<string, unknown>;
  steps: WorkflowExecutionStep[];
  progress: number;
  due_at: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

function readContextStringArray(
  context: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = context[key];
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => String(entry));
}

function readLifecycleFromContext(context: Record<string, unknown>): WorkflowLifecycleContext {
  return {
    suppressedUntil: context.suppressedUntil != null ? String(context.suppressedUntil) : null,
    suppressedReason: context.suppressedReason != null ? String(context.suppressedReason) : null,
    lastCancelledAt: context.lastCancelledAt != null ? String(context.lastCancelledAt) : null,
    lastSignalHash: context.lastSignalHash != null ? String(context.lastSignalHash) : null,
    reopenCount: Number(context.reopenCount ?? 0),
    lastUrgencyScore: Number(context.lastUrgencyScore ?? 0),
  };
}

export function mapOperationalWorkflowRow(row: Record<string, unknown>): OperationalWorkflowExecution {
  const steps = Array.isArray(row.steps)
    ? (row.steps as WorkflowExecutionStep[])
    : [];
  const context =
    row.context != null && typeof row.context === "object" && !Array.isArray(row.context)
      ? (row.context as Record<string, unknown>)
      : {};
  const currentStep = steps.find((step) => step.status === "active" || step.status === "blocked");

  return {
    id: String(row.id),
    workspaceCompanyId: String(row.workspace_company_id),
    templateId:
      typeof context.templateId === "string" ? context.templateId : `template:${String(row.workflow_type)}`,
    type: row.workflow_type as OperationalWorkflowType,
    title: String(row.title),
    dedupeKey: String(row.dedupe_key),
    status: row.status as WorkflowExecutionStatus,
    progressPercent: Number(row.progress ?? 0),
    currentStepId: currentStep?.stepId ?? steps[row.current_step_index as number]?.stepId ?? null,
    currentStepTitle: currentStep?.title ?? steps[row.current_step_index as number]?.title ?? null,
    ownerLabel: row.assigned_to != null ? String(row.assigned_to) : null,
    assignedUserId: row.assigned_user_id != null ? String(row.assigned_user_id) : null,
    nextDueAt: row.due_at != null ? String(row.due_at) : null,
    isOverdue: false,
    steps,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    relatedActionIds: readContextStringArray(context, "relatedActionIds"),
    relatedNarrativeIds: readContextStringArray(context, "relatedNarrativeIds"),
    relatedMemoryIds: readContextStringArray(context, "relatedMemoryIds"),
    lifecycle: readLifecycleFromContext(context),
  };
}

function currentStepIndex(steps: WorkflowExecutionStep[]): number {
  const activeIndex = steps.findIndex(
    (step) => step.status === "active" || step.status === "blocked"
  );
  if (activeIndex >= 0) return activeIndex;
  const pendingIndex = steps.findIndex((step) => step.status === "pending");
  if (pendingIndex >= 0) return pendingIndex;
  return Math.max(0, steps.length - 1);
}

export function executionToWorkflowRow(
  execution: OperationalWorkflowExecution
): Record<string, unknown> {
  const stepIndex = currentStepIndex(execution.steps);
  return {
    workspace_company_id: execution.workspaceCompanyId,
    dedupe_key: execution.dedupeKey,
    workflow_type: execution.type,
    title: execution.title,
    status: execution.status,
    current_step_index: stepIndex,
    assigned_to: execution.ownerLabel,
    assigned_user_id: execution.assignedUserId ?? null,
    source: "copilot_snapshot",
    source_id: execution.dedupeKey,
    context: {
      templateId: execution.templateId,
      relatedActionIds: execution.relatedActionIds ?? [],
      relatedNarrativeIds: execution.relatedNarrativeIds ?? [],
      relatedMemoryIds: execution.relatedMemoryIds ?? [],
      suppressedUntil: execution.lifecycle?.suppressedUntil ?? null,
      suppressedReason: execution.lifecycle?.suppressedReason ?? null,
      lastCancelledAt: execution.lifecycle?.lastCancelledAt ?? null,
      lastSignalHash: execution.lifecycle?.lastSignalHash ?? null,
      reopenCount: execution.lifecycle?.reopenCount ?? 0,
      lastUrgencyScore: execution.lifecycle?.lastUrgencyScore ?? execution.urgencyScore ?? 0,
    },
    steps: execution.steps,
    progress: execution.progressPercent,
    due_at: execution.nextDueAt,
    blocked_reason:
      execution.status === "blocked"
        ? execution.steps.find((step) => step.status === "blocked")?.blockedReason ?? null
        : null,
    completed_at: execution.status === "completed" ? execution.updatedAt : null,
    cancelled_at: execution.status === "cancelled" ? execution.updatedAt : null,
  };
}

export async function listOperationalWorkflows(
  client: SupabaseClient,
  workspaceCompanyId: string
) {
  return client
    .from("copilot_operational_workflows")
    .select(WORKFLOW_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .order("updated_at", { ascending: false });
}

export async function getOperationalWorkflowById(
  client: SupabaseClient,
  workspaceCompanyId: string,
  workflowId: string
) {
  return client
    .from("copilot_operational_workflows")
    .select(WORKFLOW_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("id", workflowId)
    .maybeSingle();
}

export async function findOpenOperationalWorkflowByDedupeKey(
  client: SupabaseClient,
  workspaceCompanyId: string,
  dedupeKey: string
) {
  return client
    .from("copilot_operational_workflows")
    .select(WORKFLOW_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("dedupe_key", dedupeKey)
    .in("status", ["active", "blocked"])
    .maybeSingle();
}

export async function insertOperationalWorkflow(
  client: SupabaseClient,
  execution: OperationalWorkflowExecution
) {
  return client
    .from("copilot_operational_workflows")
    .insert(executionToWorkflowRow(execution))
    .select(WORKFLOW_SELECT)
    .single();
}

export async function updateOperationalWorkflowById(
  client: SupabaseClient,
  workspaceCompanyId: string,
  workflowId: string,
  execution: OperationalWorkflowExecution
) {
  return client
    .from("copilot_operational_workflows")
    .update(executionToWorkflowRow(execution))
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("id", workflowId)
    .select(WORKFLOW_SELECT)
    .maybeSingle();
}
