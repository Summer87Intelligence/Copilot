/**
 * FASE 7 — Transiciones de estado y atraso de tareas (núcleo puro).
 *
 * Atraso: SIEMPRE contra la fecha canónica de Montevideo (todayYmdMontevideo()),
 * nunca contra la zona del navegador. El "hoy" se inyecta como YYYY-MM-DD para
 * mantener el módulo determinista.
 */

import type { DailyTask, DailyTaskStatus } from "@/lib/daily-tasks/daily-tasks-types";

// ─── Transiciones permitidas ──────────────────────────────────────────────────

/** Grafo de transiciones válidas (FASE 7 §14). */
const TRANSITIONS: Record<DailyTaskStatus, readonly DailyTaskStatus[]> = {
  pending: ["in_progress", "done", "cancelled"],
  in_progress: ["done", "pending", "cancelled"],
  done: ["pending", "in_progress"], // reabrir
  postponed: ["pending", "in_progress", "done", "cancelled"],
  cancelled: ["pending"], // reactivar una cancelada
};

export function canTransition(from: DailyTaskStatus, to: DailyTaskStatus): boolean {
  if (from === to) return true; // idempotente (p.ej. re-guardar sin cambio)
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: DailyTaskStatus): readonly DailyTaskStatus[] {
  return TRANSITIONS[from] ?? [];
}

// ─── Atraso / vencimiento ─────────────────────────────────────────────────────

function ymd(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/** Una tarea con due_date, no cerrada, cuya fecha ya pasó (Montevideo). */
export function isTaskOverdue(
  task: Pick<DailyTask, "due_date" | "status">,
  todayYmd: string
): boolean {
  const due = ymd(task.due_date);
  if (!due) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return due < todayYmd;
}

/** Vence exactamente hoy (no está atrasada). */
export function isTaskDueToday(
  task: Pick<DailyTask, "due_date" | "status">,
  todayYmd: string
): boolean {
  const due = ymd(task.due_date);
  if (!due) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return due === todayYmd;
}

/** Está abierta (cuenta como trabajo pendiente). */
export function isTaskOpen(task: Pick<DailyTask, "status">): boolean {
  return task.status === "pending" || task.status === "in_progress";
}
