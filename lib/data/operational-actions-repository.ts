import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OperationalActionEventRow,
  OperationalActionListItem,
  OperationalActionRow,
} from "@/lib/copilot-operational-actions-types";

const ACTION_SELECT =
  "id, workspace_company_id, origin, action_type, priority, operational_status, owner_id, assigned_to, created_by, related_entity_type, related_entity_id, title, summary, context, metadata, due_at, resolved_at, resolution_notes, created_at, updated_at" as const;

const EVENT_SELECT =
  "id, workspace_company_id, action_id, event_type, actor_id, actor_label, detail, created_at" as const;

function mapActionRow(row: Record<string, unknown>): OperationalActionListItem {
  return {
    id: String(row.id),
    workspace_company_id: String(row.workspace_company_id),
    origin: row.origin as OperationalActionListItem["origin"],
    action_type: String(row.action_type),
    priority: row.priority as OperationalActionListItem["priority"],
    operational_status: row.operational_status as OperationalActionListItem["operational_status"],
    owner_id: row.owner_id != null ? String(row.owner_id) : null,
    assigned_to: row.assigned_to != null ? String(row.assigned_to) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    related_entity_type:
      row.related_entity_type != null ? String(row.related_entity_type) : null,
    related_entity_id:
      row.related_entity_id != null ? String(row.related_entity_id) : null,
    title: String(row.title),
    summary: row.summary != null ? String(row.summary) : null,
    context:
      row.context != null && typeof row.context === "object" && !Array.isArray(row.context)
        ? (row.context as OperationalActionListItem["context"])
        : {},
    metadata:
      row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    due_at: row.due_at != null ? String(row.due_at) : null,
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null,
    resolution_notes:
      row.resolution_notes != null ? String(row.resolution_notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapEventRow(row: Record<string, unknown>): OperationalActionEventRow {
  return {
    id: String(row.id),
    workspace_company_id: String(row.workspace_company_id),
    action_id: String(row.action_id),
    event_type: String(row.event_type),
    actor_id: row.actor_id != null ? String(row.actor_id) : null,
    actor_label: row.actor_label != null ? String(row.actor_label) : null,
    detail:
      row.detail != null && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? (row.detail as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
  };
}

export async function selectOperationalActionsOrdered(
  client: SupabaseClient,
  workspaceCompanyId: string,
  limit: number
) {
  return client
    .from("operational_actions")
    .select(ACTION_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function selectOperationalActionById(
  client: SupabaseClient,
  workspaceCompanyId: string,
  actionId: string
) {
  return client
    .from("operational_actions")
    .select(ACTION_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("id", actionId)
    .maybeSingle();
}

export async function selectOpenOperationalActionByOriginEntity(
  client: SupabaseClient,
  workspaceCompanyId: string,
  origin: string,
  relatedEntityId: string
) {
  return client
    .from("operational_actions")
    .select(ACTION_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("origin", origin)
    .eq("related_entity_id", relatedEntityId)
    .in("operational_status", ["pending", "in_progress", "blocked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function insertOperationalAction(
  client: SupabaseClient,
  row: Record<string, unknown>
) {
  return client.from("operational_actions").insert(row).select(ACTION_SELECT).single();
}

export async function updateOperationalActionById(
  client: SupabaseClient,
  workspaceCompanyId: string,
  actionId: string,
  patch: Record<string, unknown>
) {
  return client
    .from("operational_actions")
    .update(patch)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("id", actionId)
    .select(ACTION_SELECT)
    .maybeSingle();
}

export async function insertOperationalActionEvent(
  client: SupabaseClient,
  row: Record<string, unknown>
) {
  return client.from("operational_action_events").insert(row).select(EVENT_SELECT).single();
}

export async function selectOperationalActionEvents(
  client: SupabaseClient,
  workspaceCompanyId: string,
  actionId: string,
  limit: number
) {
  return client
    .from("operational_action_events")
    .select(EVENT_SELECT)
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("action_id", actionId)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export function mapOperationalActionRow(row: Record<string, unknown>): OperationalActionListItem {
  return mapActionRow(row);
}

export function mapOperationalActionEventRow(
  row: Record<string, unknown>
): OperationalActionEventRow {
  return mapEventRow(row);
}

export type { OperationalActionRow };
