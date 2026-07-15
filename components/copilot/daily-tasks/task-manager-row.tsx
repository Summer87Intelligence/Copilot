"use client";

import { Check, Play, RotateCcw } from "lucide-react";

import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { isTaskOverdue } from "@/lib/tasks/task-status";
import { priorityLabel, priorityTone, statusLabel, statusTone } from "@/lib/tasks/task-ui";

/** Fila de tarea en la vista de gestión. Mobile-first, acciones no truncadas. */
export function TaskManagerRow({
  task,
  today,
  assigneeName,
  busy = false,
  onOpen,
  onComplete,
  onStart,
  onReopen,
}: {
  task: DailyTask;
  today: string;
  assigneeName: string;
  busy?: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onStart: () => void;
  onReopen: () => void;
}) {
  const overdue = isTaskOverdue(task, today);
  const isDone = task.status === "done";
  const iconBtn = copilotButtonClassName({ variant: "ghost", size: "sm" });

  return (
    <li className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="text-left text-sm font-semibold text-[var(--copilot-ink)] hover:underline"
          >
            {task.title}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={priorityTone(task.priority)}>{priorityLabel(task.priority)}</StatusBadge>
            <StatusBadge tone={statusTone(task.status)} dot>
              {statusLabel(task.status)}
            </StatusBadge>
            {overdue ? <StatusBadge tone="danger">Atrasada</StatusBadge> : null}
            <span className="text-[11px] text-[var(--copilot-muted)]">{assigneeName}</span>
            {task.due_date ? (
              <span className="text-[11px] text-[var(--copilot-muted)]">· Vence {task.due_date.slice(0, 10)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isDone ? (
            <button type="button" disabled={busy} onClick={onReopen} aria-label="Reabrir" title="Reabrir" className={iconBtn}>
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <>
              {task.status === "pending" ? (
                <button type="button" disabled={busy} onClick={onStart} aria-label="Iniciar" title="Iniciar" className={iconBtn}>
                  <Play className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={onComplete} aria-label="Completar" title="Completar" className={iconBtn}>
                <Check className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
