/**
 * Tipos del módulo Tareas diarias (Sprint A).
 * Espeja el esquema de daily_tasks. La visibilidad de cada tarea depende de
 * los permisos de módulo del usuario (module_key).
 */

export const DAILY_TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type DailyTaskPriority = (typeof DAILY_TASK_PRIORITIES)[number];

/** Visibilidad de una tarea (FASE 7). Ver lib/tasks/task-visibility.ts. */
export const DAILY_TASK_VISIBILITIES = ["private", "team", "workspace"] as const;
export type DailyTaskVisibility = (typeof DAILY_TASK_VISIBILITIES)[number];

export const DAILY_TASK_VISIBILITY_LABELS: Record<DailyTaskVisibility, string> = {
  private: "Privada",
  team: "Equipo",
  workspace: "Todos",
};

export const DAILY_TASK_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "postponed",
  "cancelled",
] as const;
export type DailyTaskStatus = (typeof DAILY_TASK_STATUSES)[number];

export const DAILY_TASK_STATUS_LABELS: Record<DailyTaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Completada",
  postponed: "Pospuesta",
  cancelled: "Cancelada",
};

export const DAILY_TASK_PRIORITY_LABELS: Record<DailyTaskPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export type DailyTask = {
  id: string;
  workspace_id: string;
  assigned_to_user_id: string | null;
  title: string;
  description: string | null;
  module_key: string;
  source_type: string | null;
  source_id: string | null;
  priority: DailyTaskPriority;
  status: DailyTaskStatus;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  action_url: string | null;
  metadata?: Record<string, unknown> | null;
  /** Clave estable de tarea automática (cuaderno). NULL en manuales. */
  task_key: string | null;
  /** Tarea automática pospuesta hasta esta fecha (YYYY-MM-DD). */
  snoozed_until: string | null;
  /**
   * FASE 7 — multiusuario. Estas columnas se agregan en la migración
   * 20260715130000; hasta aplicarla, las lecturas las tratan como opcionales.
   */
  created_by_user_id?: string | null;
  visibility?: DailyTaskVisibility | null;
  created_at: string;
  updated_at: string;
};

export function isValidDailyTaskStatus(v: unknown): v is DailyTaskStatus {
  return typeof v === "string" && (DAILY_TASK_STATUSES as readonly string[]).includes(v);
}

export function isValidDailyTaskPriority(v: unknown): v is DailyTaskPriority {
  return typeof v === "string" && (DAILY_TASK_PRIORITIES as readonly string[]).includes(v);
}

export function isValidDailyTaskVisibility(v: unknown): v is DailyTaskVisibility {
  return typeof v === "string" && (DAILY_TASK_VISIBILITIES as readonly string[]).includes(v);
}

/** Visibilidad efectiva de una tarea (default seguro = workspace). */
export function taskVisibility(task: Pick<DailyTask, "visibility">): DailyTaskVisibility {
  return isValidDailyTaskVisibility(task.visibility) ? task.visibility : "workspace";
}
