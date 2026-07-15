/**
 * FASE 7 — Tareas vinculadas a una entidad (cliente, factura, alerta…).
 * source_type/source_id son el vínculo genérico ya presente en daily_tasks.
 */
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";

export function tasksForEntity(
  tasks: readonly DailyTask[],
  sourceType: string,
  sourceId: string
): DailyTask[] {
  return tasks.filter((t) => t.source_type === sourceType && t.source_id === sourceId);
}

/** Solo tareas abiertas de una entidad (pending/in_progress). */
export function openTasksForEntity(
  tasks: readonly DailyTask[],
  sourceType: string,
  sourceId: string
): DailyTask[] {
  return tasksForEntity(tasks, sourceType, sourceId).filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
}
