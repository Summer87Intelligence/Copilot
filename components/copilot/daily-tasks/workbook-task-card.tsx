"use client";

import { Check, ChevronRight, Clock, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { CopilotButtonLink, copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  DAILY_TASK_PRIORITY_LABELS,
  type DailyTaskPriority,
} from "@/lib/daily-tasks/daily-tasks-types";
import {
  WORKBOOK_ORIGIN_LABELS,
  type WorkbookCard,
} from "@/lib/daily-tasks/daily-tasks-workbook";

const PRIORITY_BADGE: Record<DailyTaskPriority, string> = {
  high: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  medium:
    "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  low: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
};

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

export type WorkbookTaskCardProps = {
  card: WorkbookCard;
  busy?: boolean;
  onComplete: (card: WorkbookCard) => void;
  onReopen: (card: WorkbookCard) => void;
  onSecondary: (card: WorkbookCard) => void;
  onEdit?: (card: WorkbookCard) => void;
  onDelete?: (card: WorkbookCard) => void;
};

/**
 * Card de tarea del cuaderno. Mobile-first: vertical, botones grandes, prioridad
 * arriba. Funciona igual para tareas automáticas y manuales.
 */
export function WorkbookTaskCard({
  card,
  busy = false,
  onComplete,
  onReopen,
  onSecondary,
  onEdit,
  onDelete,
}: WorkbookTaskCardProps) {
  const isDone = card.status === "done";
  const isPostponed = card.status === "postponed";
  const isActive = !isDone && !isPostponed;
  const ghost = (extra = "") => copilotButtonClassName({ variant: "ghost", size: "sm", className: extra });

  return (
    <article className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]">
          {WORKBOOK_ORIGIN_LABELS[card.origin]}
        </Badge>
        <Badge className={PRIORITY_BADGE[card.priority]}>
          {DAILY_TASK_PRIORITY_LABELS[card.priority]}
        </Badge>
        {card.dueLabel ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--copilot-muted)]">
            <Clock className="h-3 w-3" aria-hidden />
            {card.dueLabel}
          </span>
        ) : null}
      </div>

      <h3
        className={`mt-2 text-sm font-semibold ${
          isDone ? "text-[var(--copilot-muted)] line-through" : "text-[var(--copilot-text)]"
        }`}
      >
        {card.title}
      </h3>

      {card.reason ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-muted)]">{card.reason}</p>
      ) : null}
      {card.impact ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          <span className="font-medium">Impacto:</span> {card.impact}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isActive && card.actionUrl ? (
          <CopilotButtonLink href={card.actionUrl} size="sm" variant="primary" className="shrink-0">
            {card.actionLabel ?? "Ver detalle"}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </CopilotButtonLink>
        ) : null}

        {isActive ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onComplete(card)}
            className={ghost()}
          >
            <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
            Marcar hecho
          </button>
        ) : null}

        {isActive && card.kind === "auto" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSecondary(card)}
            className={ghost()}
          >
            {card.secondaryLabel ?? "Posponer"}
          </button>
        ) : null}

        {isActive && card.kind === "manual" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSecondary(card)}
              className={ghost()}
            >
              Posponer
            </button>
            {onEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit(card)}
                className={ghost()}
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(card)}
                className={ghost()}
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </>
        ) : null}

        {!isActive ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReopen(card)}
            className={ghost()}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
            {isDone ? "Reabrir" : "Reactivar"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
