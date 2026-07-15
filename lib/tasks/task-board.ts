/**
 * FASE 7 — Modelo puro del tablero de tareas (tabs + filtros + conteos).
 *
 * Toma la lista YA visible para el usuario (la API aplica visibilidad) y la
 * organiza en tabs y filtros para la vista "Todas las tareas". Determinista y
 * testeable; la UI solo lo consume.
 */

import type { DailyTask, DailyTaskPriority } from "@/lib/daily-tasks/daily-tasks-types";
import { isTaskDueToday, isTaskOpen, isTaskOverdue } from "@/lib/tasks/task-status";

export const TASK_TABS = [
  "mine",
  "today",
  "overdue",
  "in_progress",
  "completed",
  "unassigned",
  "all",
] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export const TASK_TAB_LABELS: Record<TaskTab, string> = {
  mine: "Mis tareas",
  today: "Para hoy",
  overdue: "Atrasadas",
  in_progress: "En progreso",
  completed: "Completadas",
  unassigned: "Sin asignar",
  all: "Todas",
};

/** Tabs reservados a admin. */
export const ADMIN_ONLY_TABS: readonly TaskTab[] = ["unassigned", "all"];

export function visibleTabs(isAdmin: boolean): TaskTab[] {
  return TASK_TABS.filter((t) => isAdmin || !ADMIN_ONLY_TABS.includes(t));
}

export type TaskBoardFilters = {
  q?: string;
  module?: string; // 'all' | ModuleKey
  priority?: string; // 'all' | DailyTaskPriority
  status?: string; // 'all' | DailyTaskStatus
  source?: string; // 'all' | 'manual' | 'automatic'
  assignee?: string; // 'all' | userId
};

export type TaskBoardContext = {
  viewerId: string;
  todayYmd: string;
};

function isAutomatic(task: DailyTask): boolean {
  return !!task.task_key || task.source_type === "auto";
}

function matchesTab(task: DailyTask, tab: TaskTab, ctx: TaskBoardContext): boolean {
  switch (tab) {
    case "mine":
      return task.assigned_to_user_id === ctx.viewerId && task.status !== "cancelled";
    case "today":
      return isTaskDueToday(task, ctx.todayYmd);
    case "overdue":
      return isTaskOverdue(task, ctx.todayYmd);
    case "in_progress":
      return task.status === "in_progress";
    case "completed":
      return task.status === "done";
    case "unassigned":
      return !task.assigned_to_user_id && isTaskOpen(task);
    case "all":
    default:
      return true;
  }
}

function matchesFilters(task: DailyTask, filters: TaskBoardFilters): boolean {
  const { q, module, priority, status, source, assignee } = filters;
  if (module && module !== "all" && task.module_key !== module) return false;
  if (priority && priority !== "all" && task.priority !== priority) return false;
  if (status && status !== "all" && task.status !== status) return false;
  if (assignee && assignee !== "all") {
    if (assignee === "unassigned" ? !!task.assigned_to_user_id : task.assigned_to_user_id !== assignee)
      return false;
  }
  if (source === "manual" && isAutomatic(task)) return false;
  if (source === "automatic" && !isAutomatic(task)) return false;
  if (q && q.trim()) {
    const hay = `${task.title} ${task.description ?? ""}`.toLowerCase();
    if (!hay.includes(q.trim().toLowerCase())) return false;
  }
  return true;
}

const PRIORITY_RANK: Record<DailyTaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function ymd(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : "9999-99-99";
}

export function compareTasks(a: DailyTask, b: DailyTask): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  const da = ymd(a.due_date);
  const db = ymd(b.due_date);
  if (da !== db) return da < db ? -1 : 1;
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

export function filterTasksForBoard(
  tasks: readonly DailyTask[],
  opts: { tab: TaskTab; filters: TaskBoardFilters } & TaskBoardContext
): DailyTask[] {
  const { tab, filters, ...ctx } = opts;
  return tasks
    .filter((t) => matchesTab(t, tab, ctx) && matchesFilters(t, filters))
    .sort(compareTasks);
}

export function tabCounts(
  tasks: readonly DailyTask[],
  ctx: TaskBoardContext & { isAdmin: boolean }
): Record<TaskTab, number> {
  const counts = {} as Record<TaskTab, number>;
  for (const tab of visibleTabs(ctx.isAdmin)) {
    counts[tab] = tasks.filter((t) => matchesTab(t, tab, ctx)).length;
  }
  return counts;
}
