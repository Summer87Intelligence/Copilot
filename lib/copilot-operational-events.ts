import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import { buildOperationalActionHref } from "@/lib/copilot-alert-ops-mapper";
import type {
  CreateOperationalEventInput,
  OperationalEntityType,
  OperationalEventActor,
  OperationalEventRecord,
  OperationalEventSeverity,
  OperationalEventType,
  OperationalTimelineItem,
} from "@/lib/copilot-operational-events-types";
import type { OperationalWorkflowExecution, WorkflowMutationInput } from "@/lib/copilot-operational-workflows-types";
import type { WorkflowReconciliationEvent } from "@/lib/copilot-operational-reconciliation";
import type { OperationalAutomationEventDraft } from "@/lib/copilot-operational-automation-types";
import {
  createOperationalEvent,
  listOperationalEventsForEntity,
  listRecentOperationalEvents,
  mapOperationalEventRow,
} from "@/lib/data/operational-events-repository";

const EVENT_TYPE_LABELS: Record<OperationalEventType, string> = {
  workflow_created: "Workflow creado",
  workflow_assigned: "Workflow asignado",
  workflow_blocked: "Workflow bloqueado",
  workflow_unblocked: "Workflow desbloqueado",
  workflow_cancelled: "Workflow cancelado",
  workflow_completed: "Workflow completado",
  step_completed: "Paso completado",
  step_blocked: "Paso bloqueado",
  action_resolved: "Acción resuelta",
  action_assigned: "Acción asignada",
  action_blocked: "Acción bloqueada",
  snapshot_degraded: "Snapshot degradado",
  workflow_suppressed: "Workflow suprimido",
  workflow_reopened: "Workflow reabierto",
  workflow_auto_completed: "Workflow auto-completado",
  workflow_sla_breached: "SLA incumplido",
  workflow_escalated: "Workflow escalado",
  workflow_followup_recommended: "Seguimiento recomendado",
  workflow_resolution_recommended: "Cierre sugerido",
  workflow_linked: "Workflow relacionado",
  workflow_recurring_detected: "Patrón recurrente",
};

const EVENT_TYPE_SEVERITY: Record<OperationalEventType, OperationalEventSeverity> = {
  workflow_created: "neutral",
  workflow_assigned: "neutral",
  workflow_blocked: "danger",
  workflow_unblocked: "warning",
  workflow_cancelled: "neutral",
  workflow_completed: "success",
  step_completed: "success",
  step_blocked: "danger",
  action_resolved: "success",
  action_assigned: "neutral",
  action_blocked: "danger",
  snapshot_degraded: "warning",
  workflow_suppressed: "neutral",
  workflow_reopened: "warning",
  workflow_auto_completed: "success",
  workflow_sla_breached: "danger",
  workflow_escalated: "warning",
  workflow_followup_recommended: "warning",
  workflow_resolution_recommended: "neutral",
  workflow_linked: "neutral",
  workflow_recurring_detected: "warning",
};

export class OperationalEventRequestBuffer {
  private readonly seen = new Set<string>();

  shouldEmit(input: CreateOperationalEventInput): boolean {
    const key = [
      input.eventType,
      input.entityType,
      input.entityId,
      input.workflowId ?? "",
      input.actionId ?? "",
    ].join("|");
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

export function mapOperationalEventTypeLabel(eventType: OperationalEventType | string): string {
  return EVENT_TYPE_LABELS[eventType as OperationalEventType] ?? String(eventType);
}

export function mapOperationalEventSeverity(
  eventType: OperationalEventType | string
): OperationalEventSeverity {
  return EVENT_TYPE_SEVERITY[eventType as OperationalEventType] ?? "neutral";
}

function contextLabelForEvent(record: OperationalEventRecord): string | null {
  if (record.entityType === "workflow") return "Ejecución guiada";
  if (record.entityType === "workflow_step") return "Paso de workflow";
  if (record.entityType === "action") return "Seguimiento";
  if (record.entityType === "snapshot") return "Snapshot operativo";
  return null;
}

export function resolveOperationalEventHref(record: OperationalEventRecord): string | null {
  if (record.entityType === "action" || record.actionId) {
    return buildOperationalActionHref(record.actionId ?? record.entityId);
  }
  if (record.entityType === "workflow" || record.entityType === "workflow_step" || record.workflowId) {
    return "/copilot/acciones";
  }
  if (record.entityType === "snapshot") return "/copilot/hoy";
  return null;
}

export function mapOperationalEventToTimelineItem(
  record: OperationalEventRecord
): OperationalTimelineItem {
  return {
    id: record.id,
    eventType: record.eventType,
    typeLabel: mapOperationalEventTypeLabel(record.eventType),
    severity: mapOperationalEventSeverity(record.eventType),
    entityType: record.entityType,
    entityId: record.entityId,
    entityLabel: record.title,
    actorLabel: record.actorLabel,
    detail: record.detail,
    occurredAt: record.occurredAt,
    href: resolveOperationalEventHref(record),
    contextLabel: contextLabelForEvent(record),
  };
}

export async function emitOperationalEvent(
  client: SupabaseClient,
  input: CreateOperationalEventInput,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  if (buffer && !buffer.shouldEmit(input)) return;
  const result = await createOperationalEvent(client, input);
  if (result.error && process.env.NODE_ENV === "development") {
    console.debug("[copilot-operational-events]", {
      code: "CREATE_FAILED",
      message: result.error.message,
      eventType: input.eventType,
    });
  }
}

export async function listOperationalTimeline(
  client: SupabaseClient,
  workspaceCompanyId: string,
  limit = 10
): Promise<OperationalTimelineItem[]> {
  const result = await listRecentOperationalEvents(client, workspaceCompanyId, limit);
  if (result.error) return [];
  return (result.data ?? []).map((row) =>
    mapOperationalEventToTimelineItem(mapOperationalEventRow(row as Record<string, unknown>))
  );
}

export async function listOperationalTimelineForEntity(
  client: SupabaseClient,
  workspaceCompanyId: string,
  entityType: OperationalEntityType,
  entityId: string,
  limit = 20
): Promise<OperationalTimelineItem[]> {
  const result = await listOperationalEventsForEntity(
    client,
    workspaceCompanyId,
    entityType,
    entityId,
    limit
  );
  if (result.error) return [];
  return (result.data ?? []).map((row) =>
    mapOperationalEventToTimelineItem(mapOperationalEventRow(row as Record<string, unknown>))
  );
}

export async function recordWorkflowCreatedEvent(
  client: SupabaseClient,
  workflow: OperationalWorkflowExecution,
  actor?: OperationalEventActor | null,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  await emitOperationalEvent(
    client,
    {
      workspaceCompanyId: workflow.workspaceCompanyId,
      eventType: "workflow_created",
      entityType: "workflow",
      entityId: workflow.id,
      workflowId: workflow.id,
      title: workflow.title,
      detail: workflow.type.replaceAll("_", " "),
      metadata: {
        workflowType: workflow.type,
        dedupeKey: workflow.dedupeKey,
      },
      actor,
    },
    buffer
  );
}

export async function recordWorkflowPatchEvents(
  client: SupabaseClient,
  before: OperationalWorkflowExecution,
  after: OperationalWorkflowExecution,
  mutation: WorkflowMutationInput,
  actor?: OperationalEventActor | null,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  const base = {
    workspaceCompanyId: after.workspaceCompanyId,
    workflowId: after.id,
    actor,
  };

  if (mutation.action === "assign") {
    await emitOperationalEvent(
      client,
      {
        ...base,
        eventType: "workflow_assigned",
        entityType: "workflow",
        entityId: after.id,
        title: after.title,
        detail: after.ownerLabel,
        metadata: { assignedUserId: after.assignedUserId ?? null },
      },
      buffer
    );
    return;
  }

  if (mutation.action === "block") {
    await emitOperationalEvent(
      client,
      {
        ...base,
        eventType: "workflow_blocked",
        entityType: "workflow",
        entityId: after.id,
        title: after.title,
        detail: mutation.blockedReason ?? after.steps.find((step) => step.status === "blocked")?.blockedReason ?? null,
      },
      buffer
    );
    return;
  }

  if (mutation.action === "block_step" && mutation.stepId) {
    const step = after.steps.find((row) => row.stepId === mutation.stepId);
    await emitOperationalEvent(
      client,
      {
        ...base,
        eventType: "step_blocked",
        entityType: "workflow_step",
        entityId: mutation.stepId,
        title: step?.title ?? after.title,
        detail: mutation.blockedReason ?? step?.blockedReason ?? null,
        metadata: { workflowTitle: after.title },
      },
      buffer
    );
    return;
  }

  if (mutation.action === "unblock") {
    await emitOperationalEvent(
      client,
      {
        ...base,
        eventType: "workflow_unblocked",
        entityType: "workflow",
        entityId: after.id,
        title: after.title,
      },
      buffer
    );
    return;
  }

  if (mutation.action === "cancel") {
    await emitOperationalEvent(
      client,
      {
        ...base,
        eventType: "workflow_cancelled",
        entityType: "workflow",
        entityId: after.id,
        title: after.title,
      },
      buffer
    );
    return;
  }

  if (mutation.action === "complete_step" && mutation.stepId) {
    const step = after.steps.find((row) => row.stepId === mutation.stepId) ?? before.steps.find((row) => row.stepId === mutation.stepId);
    await emitOperationalEvent(
      client,
      {
        ...base,
        eventType: "step_completed",
        entityType: "workflow_step",
        entityId: mutation.stepId,
        title: step?.title ?? after.title,
        detail: after.currentStepTitle,
        metadata: { workflowTitle: after.title },
      },
      buffer
    );
    if (after.status === "completed" && before.status !== "completed") {
      await emitOperationalEvent(
        client,
        {
          ...base,
          eventType: "workflow_completed",
          entityType: "workflow",
          entityId: after.id,
          title: after.title,
          detail: `${after.progressPercent}%`,
        },
        buffer
      );
    }
  }
}

export async function recordOperationalActionPatchEvents(
  client: SupabaseClient,
  workspaceCompanyId: string,
  action: OperationalActionListItem,
  events: Array<{ eventType: string; detail: Record<string, unknown> }>,
  actor?: OperationalEventActor | null,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  for (const event of events) {
    if (event.eventType === "resolved") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId,
          eventType: "action_resolved",
          entityType: "action",
          entityId: action.id,
          actionId: action.id,
          title: action.title,
          detail: event.detail.to_status ? String(event.detail.to_status) : null,
          metadata: event.detail,
          actor,
        },
        buffer
      );
      continue;
    }
    if (event.eventType === "assigned" || event.eventType === "reassigned") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId,
          eventType: "action_assigned",
          entityType: "action",
          entityId: action.id,
          actionId: action.id,
          title: action.title,
          detail:
            event.detail.assigned_to != null ? String(event.detail.assigned_to) : action.assigned_to,
          metadata: event.detail,
          actor,
        },
        buffer
      );
      continue;
    }
    if (event.eventType === "blocked") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId,
          eventType: "action_blocked",
          entityType: "action",
          entityId: action.id,
          actionId: action.id,
          title: action.title,
          detail: event.detail.to_status ? String(event.detail.to_status) : null,
          metadata: event.detail,
          actor,
        },
        buffer
      );
    }
  }
}

export async function recordSnapshotDegradedEvent(
  client: SupabaseClient,
  workspaceCompanyId: string,
  detail: string,
  metadata: Record<string, unknown>,
  actor?: OperationalEventActor | null,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  await emitOperationalEvent(
    client,
    {
      workspaceCompanyId,
      eventType: "snapshot_degraded",
      entityType: "snapshot",
      entityId: workspaceCompanyId,
      title: "Snapshot operativo degradado",
      detail,
      metadata,
      actor,
    },
    buffer
  );
}

export async function recordWorkflowReconciliationEvents(
  client: SupabaseClient,
  events: WorkflowReconciliationEvent[],
  actor?: OperationalEventActor | null,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  for (const event of events) {
    if (event.type === "workflow_suppressed") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId: event.workflow.workspaceCompanyId,
          eventType: "workflow_suppressed",
          entityType: "workflow",
          entityId: event.workflow.id,
          workflowId: event.workflow.id,
          title: event.workflow.title,
          detail: event.detail,
          actor,
        },
        buffer
      );
      continue;
    }
    if (event.type === "workflow_reopened") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId: event.workflow.workspaceCompanyId,
          eventType: "workflow_reopened",
          entityType: "workflow",
          entityId: event.workflow.id,
          workflowId: event.workflow.id,
          title: event.workflow.title,
          detail: `Reaperturas: ${event.workflow.lifecycle?.reopenCount ?? 1}`,
          actor,
        },
        buffer
      );
      continue;
    }
    if (event.type === "workflow_auto_completed") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId: event.workflow.workspaceCompanyId,
          eventType: "workflow_auto_completed",
          entityType: "workflow",
          entityId: event.workflow.id,
          workflowId: event.workflow.id,
          title: event.workflow.title,
          detail: "Señal operativa resuelta.",
          actor,
        },
        buffer
      );
      continue;
    }
    if (event.type === "workflow_sla_breached") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId: event.workflow.workspaceCompanyId,
          eventType: "workflow_sla_breached",
          entityType: "workflow",
          entityId: event.workflow.id,
          workflowId: event.workflow.id,
          title: event.workflow.title,
          detail: event.workflow.slaDueAt,
          actor,
        },
        buffer
      );
      continue;
    }
    if (event.type === "workflow_escalated") {
      await emitOperationalEvent(
        client,
        {
          workspaceCompanyId: event.workflow.workspaceCompanyId,
          eventType: "workflow_escalated",
          entityType: "workflow",
          entityId: event.workflow.id,
          workflowId: event.workflow.id,
          title: event.workflow.title,
          detail: event.detail,
          metadata: { urgencyScore: event.workflow.urgencyScore ?? 0 },
          actor,
        },
        buffer
      );
    }
  }
}

export async function recordOperationalAutomationEvents(
  client: SupabaseClient,
  drafts: OperationalAutomationEventDraft[],
  actor?: OperationalEventActor | null,
  buffer?: OperationalEventRequestBuffer
): Promise<void> {
  for (const draft of drafts) {
    await emitOperationalEvent(
      client,
      {
        workspaceCompanyId: draft.workflow.workspaceCompanyId,
        eventType: draft.eventType,
        entityType: "workflow",
        entityId: draft.workflow.id,
        workflowId: draft.workflow.id,
        title: draft.title,
        detail: draft.detail ?? null,
        metadata: draft.metadata ?? {},
        actor,
      },
      buffer
    );
  }
}
