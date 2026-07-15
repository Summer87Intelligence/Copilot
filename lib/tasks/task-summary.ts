/**
 * FASE 7 — KPIs y carga de trabajo (núcleo puro, sin monedas ni finanzas).
 *
 * Opera sobre tareas YA filtradas por visibilidad. No mezcla cálculos
 * financieros: cuenta tareas, nada más.
 */

import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { isTaskDueToday, isTaskOpen, isTaskOverdue } from "@/lib/tasks/task-status";

export type TaskSummary = {
  pending: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
  completedInPeriod: number;
  /** Tareas abiertas sin asignar (bandeja admin). */
  unassigned: number;
  total: number;
};

function ymd(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

export function summarizeTasks(
  tasks: readonly DailyTask[],
  opts: { todayYmd: string; periodStartYmd?: string }
): TaskSummary {
  const { todayYmd, periodStartYmd } = opts;
  const summary: TaskSummary = {
    pending: 0,
    inProgress: 0,
    overdue: 0,
    dueToday: 0,
    completedInPeriod: 0,
    unassigned: 0,
    total: tasks.length,
  };

  for (const task of tasks) {
    if (task.status === "pending") summary.pending += 1;
    if (task.status === "in_progress") summary.inProgress += 1;
    if (isTaskOverdue(task, todayYmd)) summary.overdue += 1;
    if (isTaskDueToday(task, todayYmd)) summary.dueToday += 1;
    if (isTaskOpen(task) && !task.assigned_to_user_id) summary.unassigned += 1;

    if (task.status === "done") {
      const completed = ymd(task.completed_at);
      const start = periodStartYmd ?? todayYmd;
      if (completed && completed >= start) summary.completedInPeriod += 1;
    }
  }

  return summary;
}

export type UserWorkload = {
  userId: string | null; // null = sin asignar
  active: number; // abiertas (pending + in_progress)
  overdue: number;
  dueToday: number;
  completedInPeriod: number;
};

/** Agrega la carga de trabajo por usuario (vista Admin §21). */
export function workloadByUser(
  tasks: readonly DailyTask[],
  opts: { todayYmd: string; periodStartYmd?: string }
): UserWorkload[] {
  const { todayYmd, periodStartYmd } = opts;
  const map = new Map<string | null, UserWorkload>();

  const bucket = (userId: string | null): UserWorkload => {
    let entry = map.get(userId);
    if (!entry) {
      entry = { userId, active: 0, overdue: 0, dueToday: 0, completedInPeriod: 0 };
      map.set(userId, entry);
    }
    return entry;
  };

  for (const task of tasks) {
    const entry = bucket(task.assigned_to_user_id ?? null);
    if (isTaskOpen(task)) entry.active += 1;
    if (isTaskOverdue(task, todayYmd)) entry.overdue += 1;
    if (isTaskDueToday(task, todayYmd)) entry.dueToday += 1;
    if (task.status === "done") {
      const completed = ymd(task.completed_at);
      const start = periodStartYmd ?? todayYmd;
      if (completed && completed >= start) entry.completedInPeriod += 1;
    }
  }

  // Sin asignar primero, luego por carga activa desc.
  return [...map.values()].sort((a, b) => {
    if (a.userId === null) return -1;
    if (b.userId === null) return 1;
    return b.active - a.active;
  });
}
