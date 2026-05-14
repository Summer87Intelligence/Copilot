import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CreateOperationalEventInput,
  OperationalEventRecord,
} from "@/lib/copilot-operational-events-types";

const EVENT_SELECT =
  "id, workspace_company_id, event_type, entity_type, entity_id, workflow_id, action_id, actor_label, actor_user_id, title, detail, metadata, occurred_at, created_at" as const;

export function mapOperationalEventRow(row: Record<string, unknown>): OperationalEventRecord {
  return {
    id: String(row.id),
    workspaceCompanyId: String(row.workspace_company_id),
    eventType: String(row.event_type) as OperationalEventRecord["eventType"],
    entityType: String(row.entity_type) as OperationalEventRecord["entityType"],
    entityId: String(row.entity_id),
    workflowId: row.workflow_id != null ? String(row.workflow_id) : null,
    actionId: row.action_id != null ? String(row.action_id) : null,
    actorLabel: row.actor_label != null ? String(row.actor_label) : null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    title: String(row.title),
    detail: row.detail != null ? String(row.detail) : null,
    metadata:
      row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
  };
}

function eventInsertRow(input: CreateOperationalEventInput): Record<string, unknown> {
  return {
    workspace_company_id: input.workspaceCompanyId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    workflow_id: input.workflowId ?? null,
    action_id: input.actionId ?? null,
    actor_label: input.actor?.label ?? null,
    actor_user_id: input.actor?.userId ?? null,
    title: input.title,
    detail: input.detail ?? null,
    metadata: input.metadata ?? {},
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  };
}

export async function createOperationalEvent(
  client: SupabaseClient,
  input: CreateOperationalEventInput
) {
  return client
    .from("copilot_operational_events")
    .insert(eventInsertRow(input))
    .select(EVENT_SELECT)
    .single();
}

export async function listRecentOperationalEvents(
  client: SupabaseClient,
  workspaceCompanyId: string,
  limit = 10
) {
  return client
    .from("copilot_operational_events")
    .select(EVENT_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
}

export async function listOperationalEventsForEntity(
  client: SupabaseClient,
  workspaceCompanyId: string,
  entityType: string,
  entityId: string,
  limit = 20
) {
  return client
    .from("copilot_operational_events")
    .select(EVENT_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
}
