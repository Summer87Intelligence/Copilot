import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

const executionsByWorkspace = new Map<string, Map<string, OperationalWorkflowExecution>>();

function workspaceBucket(workspaceCompanyId: string): Map<string, OperationalWorkflowExecution> {
  const existing = executionsByWorkspace.get(workspaceCompanyId);
  if (existing) return existing;
  const created = new Map<string, OperationalWorkflowExecution>();
  executionsByWorkspace.set(workspaceCompanyId, created);
  return created;
}

export function readWorkspaceWorkflowExecutions(
  workspaceCompanyId: string
): OperationalWorkflowExecution[] {
  return [...workspaceBucket(workspaceCompanyId).values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function readWorkflowExecution(
  workspaceCompanyId: string,
  executionId: string
): OperationalWorkflowExecution | null {
  return workspaceBucket(workspaceCompanyId).get(executionId) ?? null;
}

export function upsertWorkflowExecution(execution: OperationalWorkflowExecution): void {
  workspaceBucket(execution.workspaceCompanyId).set(execution.id, execution);
}

export function clearOperationalWorkflowStoreForTests(): void {
  executionsByWorkspace.clear();
}
