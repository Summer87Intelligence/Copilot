/**
 * Phase 4A — labels de ownership para UI.
 */

import type {
  ClientOperationalHydrationRecord,
  ClientOperationalOwnershipHydrated,
} from "@/lib/decision-engine/de-types";

function formatAssignedDuration(assignedAt: string | null, now = new Date()): string | null {
  if (!assignedAt) return null;
  const diffMs = now.getTime() - new Date(assignedAt).getTime();
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return "hace menos de 1 h";
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export function buildOwnershipHydrated(
  record: ClientOperationalHydrationRecord | null | undefined,
  currentUserId: string | null,
  now = new Date()
): ClientOperationalOwnershipHydrated {
  const assigned_user_id = record?.assigned_user_id ?? null;
  const is_unassigned = !assigned_user_id;
  const is_mine = Boolean(currentUserId && assigned_user_id === currentUserId);
  const ownership_overdue = Boolean(record?.breached_sla && assigned_user_id);

  let ownership_status_label = "Sin asignar";
  if (is_mine) ownership_status_label = "Asignado a mí";
  else if (assigned_user_id) ownership_status_label = "Asignado";
  else if (record?.breached_sla) ownership_status_label = "Crítico sin dueño";

  return {
    assigned_user_id,
    assigned_at: record?.assigned_at ?? null,
    assignee_display_name: record?.assignee_display_name ?? "Sin asignar",
    assignment_note: record?.assignment_note ?? null,
    is_mine,
    is_unassigned,
    ownership_overdue,
    assigned_duration_label: formatAssignedDuration(record?.assigned_at ?? null, now),
    ownership_status_label,
  };
}

export function assigneeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
