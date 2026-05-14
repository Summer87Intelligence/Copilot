import type {
  OperationalAutomationMetadata,
  OperationalAutomationResult,
} from "@/lib/copilot-operational-automation-types";

export type WorkflowExecutionStatus = "active" | "blocked" | "completed" | "cancelled";

export type WorkflowStepStatus = "pending" | "active" | "blocked" | "completed" | "skipped";

export type OperationalWorkflowType =
  | "critical_cash"
  | "priority_collections"
  | "blocked_followup";

export type OperationalWorkflowStep = {
  id: string;
  order: number;
  title: string;
  href?: string;
};

export type OperationalWorkflowTemplate = {
  id: string;
  type: OperationalWorkflowType;
  title: string;
  steps: OperationalWorkflowStep[];
};

export type WorkflowExecutionStep = {
  stepId: string;
  title: string;
  order: number;
  status: WorkflowStepStatus;
  ownerLabel: string | null;
  dueAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  metadata?: Record<string, unknown>;
};

export type WorkflowSlaStatus = "healthy" | "warning" | "breached";

export type WorkflowLifecycleContext = {
  suppressedUntil?: string | null;
  suppressedReason?: string | null;
  lastCancelledAt?: string | null;
  lastSignalHash?: string | null;
  reopenCount?: number;
  lastUrgencyScore?: number;
};

export type WorkflowRelatedCounts = {
  actions: number;
  alerts: number;
  insights: number;
};

export type OperationalWorkflowExecution = {
  id: string;
  workspaceCompanyId: string;
  templateId: string;
  type: OperationalWorkflowType;
  title: string;
  dedupeKey: string;
  status: WorkflowExecutionStatus;
  progressPercent: number;
  currentStepId: string | null;
  currentStepTitle: string | null;
  ownerLabel: string | null;
  assignedUserId?: string | null;
  nextDueAt: string | null;
  isOverdue: boolean;
  slaStatus?: WorkflowSlaStatus;
  slaDueAt?: string | null;
  urgencyScore?: number;
  lifecycle?: WorkflowLifecycleContext;
  relatedCounts?: WorkflowRelatedCounts;
  suppressed?: boolean;
  steps: WorkflowExecutionStep[];
  createdAt: string;
  updatedAt: string;
  relatedActionIds?: string[];
  relatedNarrativeIds?: string[];
  relatedMemoryIds?: string[];
  relatedWorkflowIds?: string[];
};

export type OperationalWorkflowsHealth = {
  status: "ok" | "partial" | "degraded";
  warnings: Array<{ source: string; code: string; message: string }>;
};

export type OperationalWorkflowsResponse = {
  workflows: OperationalWorkflowExecution[];
  generatedAt: string;
  health: OperationalWorkflowsHealth;
  hasSuppressedWorkflows?: boolean;
  automation?: OperationalAutomationResult;
  automationMetadata?: OperationalAutomationMetadata;
};

export type WorkflowMutationAction =
  | "complete_step"
  | "block"
  | "unblock"
  | "cancel"
  | "assign"
  | "block_step";

export type WorkflowMutationInput = {
  action: WorkflowMutationAction;
  stepId?: string;
  assignedTo?: string | null;
  assignedUserId?: string | null;
  ownerLabel?: string | null;
  blockedReason?: string | null;
};
