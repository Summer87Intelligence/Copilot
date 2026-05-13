export const OPERATIONAL_ACTION_STATUSES = [
  "pending",
  "in_progress",
  "blocked",
  "resolved",
  "dismissed",
] as const;

export type OperationalActionStatus = (typeof OPERATIONAL_ACTION_STATUSES)[number];

export const OPERATIONAL_ACTION_ORIGINS = [
  "alert",
  "treasury",
  "finance",
  "customer",
  "insight",
  "manual",
] as const;

export type OperationalActionOrigin = (typeof OPERATIONAL_ACTION_ORIGINS)[number];

export const OPERATIONAL_ACTION_PRIORITIES = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

export type OperationalActionPriority = (typeof OPERATIONAL_ACTION_PRIORITIES)[number];

export type OperationalActionContext = {
  alertType?: string;
  alertPriority?: string;
  obligationId?: string | null;
  deepLink?: string | null;
  [key: string]: unknown;
};

export type OperationalActionRow = {
  id: string;
  workspace_company_id: string;
  origin: OperationalActionOrigin;
  action_type: string;
  priority: OperationalActionPriority;
  operational_status: OperationalActionStatus;
  owner_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  title: string;
  summary: string | null;
  context: OperationalActionContext;
  metadata: Record<string, unknown>;
  due_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationalActionListItem = OperationalActionRow;

export type OperationalActionEventRow = {
  id: string;
  workspace_company_id: string;
  action_id: string;
  event_type: string;
  actor_id: string | null;
  actor_label: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type OperationalActionCreateInput = {
  origin: OperationalActionOrigin;
  actionType: string;
  priority?: OperationalActionPriority;
  title: string;
  summary?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  context?: OperationalActionContext;
  metadata?: Record<string, unknown>;
  dueAt?: string | null;
  assignedTo?: string | null;
  ownerId?: string | null;
};

export type OperationalActionPatchInput = {
  operationalStatus?: OperationalActionStatus;
  assignedTo?: string | null;
  ownerId?: string | null;
  dueAt?: string | null;
  resolutionNotes?: string | null;
  summary?: string | null;
};

export type OperationalActionQueueSummary = {
  pending: number;
  inProgress: number;
  blocked: number;
  resolvedToday: number;
};
