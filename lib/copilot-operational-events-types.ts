import type { OperationalAutomationMetadata } from "@/lib/copilot-operational-automation-types";

export type OperationalEntityType = "workflow" | "workflow_step" | "action" | "snapshot";

export type OperationalEventType =
  | "workflow_created"
  | "workflow_assigned"
  | "workflow_blocked"
  | "workflow_unblocked"
  | "workflow_cancelled"
  | "workflow_completed"
  | "step_completed"
  | "step_blocked"
  | "action_resolved"
  | "action_assigned"
  | "action_blocked"
  | "snapshot_degraded"
  | "workflow_suppressed"
  | "workflow_reopened"
  | "workflow_auto_completed"
  | "workflow_sla_breached"
  | "workflow_escalated"
  | "workflow_followup_recommended"
  | "workflow_resolution_recommended"
  | "workflow_linked"
  | "workflow_recurring_detected";

export type OperationalEventSeverity = "neutral" | "warning" | "danger" | "success";

export type OperationalEventActor = {
  userId?: string | null;
  label?: string | null;
};

export type OperationalEventRecord = {
  id: string;
  workspaceCompanyId: string;
  eventType: OperationalEventType;
  entityType: OperationalEntityType;
  entityId: string;
  workflowId: string | null;
  actionId: string | null;
  actorLabel: string | null;
  actorUserId: string | null;
  title: string;
  detail: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};

export type OperationalTimelineItem = {
  id: string;
  eventType: OperationalEventType;
  typeLabel: string;
  severity: OperationalEventSeverity;
  entityType: OperationalEntityType;
  entityId: string;
  entityLabel: string;
  actorLabel: string | null;
  detail: string | null;
  occurredAt: string;
  href: string | null;
  contextLabel: string | null;
};

export type OperationalEventsResponse = {
  events: OperationalTimelineItem[];
  computedAt: string;
  automationMetadata?: OperationalAutomationMetadata;
};

export type CreateOperationalEventInput = {
  workspaceCompanyId: string;
  eventType: OperationalEventType;
  entityType: OperationalEntityType;
  entityId: string;
  workflowId?: string | null;
  actionId?: string | null;
  title: string;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  actor?: OperationalEventActor | null;
};
