/**
 * FASE 7 — Mapeo puro estado/prioridad → tono semántico + label.
 * No depende del color: siempre acompaña con texto/aria.
 */
import {
  DAILY_TASK_PRIORITY_LABELS,
  DAILY_TASK_STATUS_LABELS,
  type DailyTaskPriority,
  type DailyTaskStatus,
} from "@/lib/daily-tasks/daily-tasks-types";
import type { StatusTone } from "@/lib/ui/status-badge-model";

export function statusTone(status: DailyTaskStatus): StatusTone {
  switch (status) {
    case "done":
      return "positive";
    case "in_progress":
      return "warning";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: DailyTaskPriority): StatusTone {
  switch (priority) {
    case "critical":
    case "high":
      return "danger";
    case "medium":
      return "warning";
    default:
      return "neutral";
  }
}

export function statusLabel(status: DailyTaskStatus): string {
  return DAILY_TASK_STATUS_LABELS[status];
}

export function priorityLabel(priority: DailyTaskPriority): string {
  return DAILY_TASK_PRIORITY_LABELS[priority];
}
