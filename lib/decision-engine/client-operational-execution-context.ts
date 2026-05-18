/**
 * Phase 3B — contexto operativo vivo + timeline (view-model, sin DB nueva).
 */

import type { CollectionAction } from "@/lib/copilot-collection-types";
import { COLLECTION_ACTION_TYPE_LABELS } from "@/lib/copilot-collection-types";
import type { ClientOperationalSummary, DECollectionAction } from "@/lib/decision-engine/de-types";
import { OPERATIONAL_MACHINE_STATE_LABELS } from "@/lib/decision-engine/de-types";
import { isFollowUpDueToday } from "@/lib/decision-engine/client-operational-display";

export type TimelineEvent = {
  id: string;
  at: string;
  label: string;
};

export type ClientOperationalLiveState = {
  last_action_label: string | null;
  next_follow_up_label: string | null;
  state_label: string;
  sla_label: string;
  assignee_label: string;
};

type ActionLike = {
  id: string;
  company_id: string;
  action_type: string;
  created_at: string;
  notes: string | null;
};

function normalizeAction(a: CollectionAction | DECollectionAction): ActionLike {
  if ("companyId" in a && typeof (a as CollectionAction).companyId === "string") {
    const c = a as CollectionAction;
    return {
      id: c.id,
      company_id: c.companyId,
      action_type: c.actionType,
      created_at: c.createdAt,
      notes: c.notes,
    };
  }
  const d = a as DECollectionAction;
  return {
    id: d.id,
    company_id: d.company_id,
    action_type: d.action_type,
    created_at: d.created_at,
    notes: d.notes,
  };
}

function formatRelativeShort(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ayer";
  return `hace ${days} d`;
}

function formatTimelineWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 0) {
    return `Hoy ${d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) return "Ayer";
  return `Hace ${diffDays}d`;
}

function actionTypeLabel(actionType: string): string {
  const key = actionType as keyof typeof COLLECTION_ACTION_TYPE_LABELS;
  if (key in COLLECTION_ACTION_TYPE_LABELS) {
    return COLLECTION_ACTION_TYPE_LABELS[key].toLowerCase();
  }
  return actionType.replace(/_/g, " ");
}

export function buildTimelineForCustomer(
  customerId: string,
  actions: Array<CollectionAction | DECollectionAction>,
  limit = 3,
  now = new Date()
): TimelineEvent[] {
  return actions
    .map(normalizeAction)
    .filter((a) => a.company_id === customerId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      at: a.created_at,
      label: `${formatTimelineWhen(a.created_at, now)} — ${actionTypeLabel(a.action_type)} registrada`,
    }));
}

export function buildClientOperationalLiveState(
  summary: ClientOperationalSummary,
  customerActions: Array<CollectionAction | DECollectionAction>,
  now = new Date()
): ClientOperationalLiveState {
  const sorted = customerActions
    .map(normalizeAction)
    .filter((a) => a.company_id === summary.customer_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const last = sorted[0];
  const last_action_label = last
    ? `${COLLECTION_ACTION_TYPE_LABELS[last.action_type as keyof typeof COLLECTION_ACTION_TYPE_LABELS] ?? last.action_type} registrada ${formatRelativeShort(last.created_at, now)}`
    : null;

  const due = summary.primary_action.due_at;
  let next_follow_up_label: string | null = null;
  if (due) {
    const d = new Date(due.includes("T") ? due : `${due}T09:00:00`);
    if (!isNaN(d.getTime())) {
      if (isFollowUpDueToday(due, now)) {
        next_follow_up_label = `hoy ${d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}`;
      } else if (d.getTime() > now.getTime()) {
        next_follow_up_label = d.toLocaleDateString("es-UY", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      } else {
        next_follow_up_label = "vencido";
      }
    }
  } else if (summary.primary_action.category === "promise_follow_up") {
    next_follow_up_label = "revisar promesa";
  }

  const state_label = summary.machine_state
    ? OPERATIONAL_MACHINE_STATE_LABELS[summary.machine_state]
    : "Sin estado";

  const sla_label = summary.sla_breached
    ? summary.primary_action.breached_sla
      ? "Vencido"
      : "Fuera de SLA"
    : isFollowUpDueToday(due, now)
      ? "Seguimiento hoy"
      : "Dentro de SLA";

  return {
    last_action_label,
    next_follow_up_label,
    state_label,
    sla_label,
    assignee_label: "Sin asignar",
  };
}

export function collectCompanyIdsFromQueue(
  sections: Record<string, Array<{ customer_id: string }>>
): string[] {
  const ids = new Set<string>();
  for (const tasks of Object.values(sections)) {
    for (const t of tasks) ids.add(t.customer_id);
  }
  return [...ids];
}
