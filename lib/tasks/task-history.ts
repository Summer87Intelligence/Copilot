/**
 * FASE 7 — Auditoría de cambios de tarea.
 *
 * `diffTaskChanges` es puro (testeable). `recordTaskHistory` persiste en
 * task_history y es tolerante a que la tabla aún no exista (migración pendiente):
 * nunca hace fallar la operación principal.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { isMissingTableError } from "@/lib/tasks/task-row";

export type TaskHistoryEntry = {
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
};

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

const TRACKED_FIELDS: Array<{ key: keyof DailyTask; action: string }> = [
  { key: "status", action: "status_changed" },
  { key: "priority", action: "priority_changed" },
  { key: "assigned_to_user_id", action: "assigned" },
  { key: "due_date", action: "due_changed" },
  { key: "visibility", action: "visibility_changed" },
  { key: "module_key", action: "module_changed" },
  { key: "title", action: "title_changed" },
];

/** Deriva las entradas de historial a partir de un before → after. */
export function diffTaskChanges(
  before: Partial<DailyTask>,
  after: Partial<DailyTask>
): TaskHistoryEntry[] {
  const entries: TaskHistoryEntry[] = [];
  for (const { key, action } of TRACKED_FIELDS) {
    if (!(key in after)) continue;
    const oldV = str(before[key]);
    const newV = str(after[key]);
    if (oldV === newV) continue;
    entries.push({ action, field: key, old_value: oldV, new_value: newV });
  }
  return entries;
}

export function createdEntry(): TaskHistoryEntry {
  return { action: "created", field: null, old_value: null, new_value: null };
}

export function commentEntry(): TaskHistoryEntry {
  return { action: "comment_added", field: null, old_value: null, new_value: null };
}

/**
 * Inserta entradas de historial. workspace_id lo fija el trigger; igual lo
 * pasamos por claridad. Errores de tabla ausente se ignoran (no bloquean).
 */
export async function recordTaskHistory(
  supabase: SupabaseClient,
  opts: {
    workspaceId: string;
    taskId: string;
    actorUserId: string | null;
    entries: readonly TaskHistoryEntry[];
  }
): Promise<void> {
  if (opts.entries.length === 0) return;
  const rows = opts.entries.map((e) => ({
    workspace_id: opts.workspaceId,
    task_id: opts.taskId,
    actor_user_id: opts.actorUserId,
    action: e.action,
    field: e.field,
    old_value: e.old_value,
    new_value: e.new_value,
  }));
  const { error } = await supabase.from("task_history").insert(rows);
  if (error && !isMissingTableError(error)) {
    // No bloquea la operación principal; deja rastro en logs del servidor.
    console.warn("[tasks] no se pudo registrar historial:", error.message);
  }
}
