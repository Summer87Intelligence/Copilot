/**
 * FASE 7 — Puente Alerta → Tarea (puro).
 * Mapea severidad de alerta a prioridad sugerida y arma título/dedup sin copiar
 * payload sensible (solo el título visible de la alerta).
 */
import type { DailyTaskPriority } from "@/lib/daily-tasks/daily-tasks-types";

/** Severidad de alerta → prioridad sugerida (crítica→high para no gatear a no-admin). */
export function alertSeverityToPriority(severity: string): DailyTaskPriority {
  switch (severity) {
    case "critical":
      return "high";
    case "warning":
      return "medium";
    default:
      return "low";
  }
}

/** Título prellenado para la tarea (sin volcar metadata ni payload sensible). */
export function alertTaskTitle(alertTitle: string): string {
  const clean = alertTitle.trim().slice(0, 160);
  return `Revisar alerta: ${clean}`;
}

/** Clave de deduplicación estable de una tarea originada en una alerta. */
export function alertTaskDedupKey(workspaceId: string, alertId: string): string {
  return `${workspaceId}:alert:${alertId}`;
}
