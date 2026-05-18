/**
 * Phase 3C — construye ClientOperationalHydrationRecord desde índice DB.
 */

import { COLLECTION_ACTION_TYPE_LABELS } from "@/lib/copilot-collection-types";
import type { CollectionActionType } from "@/lib/copilot-collection-types";
import type {
  ClientOperationalHydrationRecord,
  ClientOperationalTimelinePreviewItem,
  DECollectionAction,
} from "@/lib/decision-engine/de-types";
import type { DecisionEngineOperationalIndex } from "@/lib/data/decision-engine-data-loader";

const TIMELINE_LIMIT = 3;

function actionSummary(action: DECollectionAction): string {
  const label =
    COLLECTION_ACTION_TYPE_LABELS[action.action_type as CollectionActionType] ??
    action.action_type;
  const note = action.notes?.trim();
  return note ? `${label}: ${note.slice(0, 80)}` : label;
}

function formatTimelineWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) {
    return `Hoy ${d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) return "Ayer";
  return `Hace ${diffDays}d`;
}

function buildTimelinePreview(
  actions: DECollectionAction[],
  now = new Date()
): ClientOperationalTimelinePreviewItem[] {
  return actions.slice(0, TIMELINE_LIMIT).map((a) => ({
    id: a.id,
    at: a.created_at,
    action_type: a.action_type,
    summary: `${formatTimelineWhen(a.created_at, now)} — ${actionSummary(a).toLowerCase()}`,
  }));
}

export function buildHydrationRecordForCustomer(
  customerId: string,
  index: DecisionEngineOperationalIndex,
  now = new Date()
): ClientOperationalHydrationRecord | null {
  const state = index.operationalStateByCustomer.get(customerId);
  const followUp = index.pendingFollowUpByCustomer.get(customerId);
  const actions = index.recentActionsByCustomer.get(customerId) ?? [];
  const last = actions[0];

  if (!state && !followUp && actions.length === 0) {
    return null;
  }

  const nextFromState = state?.next_follow_up_at ?? null;
  const nextFromFollowUp = followUp?.scheduled_for ?? null;
  const next_follow_up_at = nextFromState ?? nextFromFollowUp;

  return {
    customer_id: customerId,
    machine_state: state?.machine_state ?? null,
    previous_state: state?.previous_state ?? null,
    transitioned_at: state?.transitioned_at ?? null,
    transition_reason: state?.transition_reason ?? null,
    breached_sla: state?.breached_sla ?? false,
    next_follow_up_at,
    pending_follow_up_id: followUp?.id ?? null,
    pending_follow_up_reason: followUp?.reason ?? null,
    last_action_at: last?.created_at ?? state?.last_contact_at ?? null,
    last_action_type: last?.action_type ?? null,
    last_action_summary: last ? actionSummary(last) : null,
    timeline_preview: buildTimelinePreview(actions, now),
    assigned_user_id: state?.assigned_user_id ?? null,
    assigned_at: state?.assigned_at ?? null,
    assigned_by: state?.assigned_by ?? null,
    assignment_note: state?.assignment_note ?? null,
    assignee_display_name: null,
  };
}

export function attachAssigneeNamesToHydration(
  records: Record<string, ClientOperationalHydrationRecord>,
  namesByUserId: Map<string, string>
): Record<string, ClientOperationalHydrationRecord> {
  const out: Record<string, ClientOperationalHydrationRecord> = {};
  for (const [id, record] of Object.entries(records)) {
    const name =
      record.assigned_user_id && namesByUserId.has(record.assigned_user_id)
        ? namesByUserId.get(record.assigned_user_id)!
        : null;
    out[id] = {
      ...record,
      assignee_display_name: name,
    };
  }
  return out;
}

export function buildHydrationByCustomer(
  customerIds: string[],
  index: DecisionEngineOperationalIndex,
  now = new Date()
): Record<string, ClientOperationalHydrationRecord> {
  const out: Record<string, ClientOperationalHydrationRecord> = {};
  for (const id of customerIds) {
    const record = buildHydrationRecordForCustomer(id, index, now);
    if (record) out[id] = record;
  }
  return out;
}
