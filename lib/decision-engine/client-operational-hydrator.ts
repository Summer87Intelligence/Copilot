/**
 * Phase 3C — combina ClientOperationalSummary + hidratación DB.
 */

import { COLLECTION_ACTION_TYPE_LABELS } from "@/lib/copilot-collection-types";
import type { CollectionActionType } from "@/lib/copilot-collection-types";
import type {
  ClientOperationalHydrationRecord,
  ClientOperationalSummary,
  ClientOperationalSummaryHydrated,
  ClientOperationalTimelinePreviewItem,
} from "@/lib/decision-engine/de-types";
import { OPERATIONAL_MACHINE_STATE_LABELS } from "@/lib/decision-engine/de-types";
import { isFollowUpDueToday } from "@/lib/decision-engine/client-operational-display";
import {
  buildClientOperationalLiveState,
  buildTimelineForCustomer,
} from "@/lib/decision-engine/client-operational-execution-context";
import { buildOwnershipHydrated } from "@/lib/decision-engine/client-operational-ownership-display";

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

function formatFollowUpLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : `${iso}T09:00:00`);
  if (isNaN(d.getTime())) return null;
  if (isFollowUpDueToday(iso, now)) {
    return `hoy ${d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (d.getTime() > now.getTime()) {
    return d.toLocaleDateString("es-UY", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "vencido";
}

function slaLabelFromRecord(
  record: ClientOperationalHydrationRecord,
  nextFollowUpAt: string | null,
  now: Date
): string {
  if (record.breached_sla) {
    if (record.transitioned_at) {
      const days = Math.floor(
        (now.getTime() - new Date(record.transitioned_at).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (days > 0) return `Atrasado hace ${days} d`;
    }
    return "Atrasado";
  }
  if (nextFollowUpAt && isFollowUpDueToday(nextFollowUpAt, now)) {
    return "Seguimiento hoy";
  }
  return "Dentro de SLA";
}

function buildLiveFromRecord(
  summary: ClientOperationalSummary,
  record: ClientOperationalHydrationRecord,
  currentUserId: string | null,
  now: Date
): Pick<
  ClientOperationalSummaryHydrated,
  "live_state" | "live_sla" | "live_follow_up" | "live_timeline" | "live_ownership"
> {
  const live_ownership = buildOwnershipHydrated(record, currentUserId, now);
  const machine = record.machine_state ?? summary.machine_state;
  const state_label = machine
    ? OPERATIONAL_MACHINE_STATE_LABELS[machine]
    : "Sin estado";

  const nextAt = record.next_follow_up_at ?? summary.primary_action.due_at;
  const next_follow_up_label =
    formatFollowUpLabel(nextAt, now) ??
    (record.pending_follow_up_reason ? record.pending_follow_up_reason.slice(0, 60) : null);

  let last_action_label: string | null = null;
  if (record.last_action_at && record.last_action_type) {
    const typeLabel =
      COLLECTION_ACTION_TYPE_LABELS[record.last_action_type as CollectionActionType] ??
      record.last_action_type;
    last_action_label = `${typeLabel} registrada ${formatRelativeShort(record.last_action_at, now)}`;
  } else if (record.last_action_summary) {
    last_action_label = `${record.last_action_summary} ${record.last_action_at ? formatRelativeShort(record.last_action_at, now) : ""}`.trim();
  }

  const live_timeline: ClientOperationalTimelinePreviewItem[] =
    record.timeline_preview.length > 0
      ? record.timeline_preview
      : buildTimelineForCustomer(summary.customer_id, [], 3, now).map((e) => ({
          id: e.id,
          at: e.at,
          action_type: "",
          summary: e.label,
        }));

  return {
    live_state: {
      last_action_label,
      next_follow_up_label,
      state_label,
      sla_label: slaLabelFromRecord(record, nextAt, now),
      assignee_label: live_ownership.assignee_display_name,
      transitioned_at: record.transitioned_at,
      transition_reason: record.transition_reason,
    },
    live_ownership,
    live_sla: {
      breached: record.breached_sla,
      label: slaLabelFromRecord(record, nextAt, now),
      next_follow_up_at: nextAt,
    },
    live_follow_up: {
      id: record.pending_follow_up_id,
      scheduled_for: record.pending_follow_up_id ? nextAt : null,
      reason: record.pending_follow_up_reason,
    },
    live_timeline,
  };
}

function buildLiveFallback(
  summary: ClientOperationalSummary,
  currentUserId: string | null,
  now: Date
): Pick<
  ClientOperationalSummaryHydrated,
  "live_state" | "live_sla" | "live_follow_up" | "live_timeline" | "live_ownership"
> {
  const fallback = buildClientOperationalLiveState(summary, [], now);
  const nextAt = summary.primary_action.due_at;
  const live_ownership = buildOwnershipHydrated(null, currentUserId, now);
  return {
    live_state: {
      ...fallback,
      assignee_label: live_ownership.assignee_display_name,
      transitioned_at: null,
      transition_reason: null,
    },
    live_ownership,
    live_sla: {
      breached: summary.sla_breached,
      label: fallback.sla_label,
      next_follow_up_at: nextAt,
    },
    live_follow_up: {
      id: null,
      scheduled_for: nextAt,
      reason: summary.primary_action.reason,
    },
    live_timeline: buildTimelineForCustomer(summary.customer_id, [], 3, now).map((e) => ({
      id: e.id,
      at: e.at,
      action_type: "",
      summary: e.label,
    })),
  };
}

export function hydrateClientOperationalSummary(
  summary: ClientOperationalSummary,
  record: ClientOperationalHydrationRecord | null | undefined,
  currentUserId: string | null = null,
  now = new Date()
): ClientOperationalSummaryHydrated {
  const hasDb = record != null;
  const live = hasDb
    ? buildLiveFromRecord(summary, record, currentUserId, now)
    : buildLiveFallback(summary, currentUserId, now);

  const machine_state = hasDb
    ? (record.machine_state ?? summary.machine_state)
    : summary.machine_state;
  const sla_breached = hasDb ? record.breached_sla : summary.sla_breached;

  return {
    ...summary,
    machine_state,
    sla_breached,
    ...live,
    hydration_source: hasDb ? "db" : "fallback",
  };
}

export function hydrateClientOperationalSummaries(
  summaries: ClientOperationalSummary[],
  hydrationByCustomer: Record<string, ClientOperationalHydrationRecord>,
  currentUserId: string | null = null,
  now = new Date()
): ClientOperationalSummaryHydrated[] {
  return summaries.map((s) =>
    hydrateClientOperationalSummary(s, hydrationByCustomer[s.customer_id], currentUserId, now)
  );
}
