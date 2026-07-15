"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";

import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { taskVisibility, DAILY_TASK_VISIBILITY_LABELS, type DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { isTaskOverdue } from "@/lib/tasks/task-status";
import { priorityLabel, priorityTone, statusLabel, statusTone } from "@/lib/tasks/task-ui";

type Comment = { id: string; author_user_id: string | null; body: string; created_at: string };
type HistoryRow = {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  created: "Creó la tarea",
  status_changed: "Cambió el estado",
  priority_changed: "Cambió la prioridad",
  assigned: "Cambió el responsable",
  due_changed: "Cambió el vencimiento",
  visibility_changed: "Cambió la visibilidad",
  module_changed: "Cambió el módulo",
  title_changed: "Cambió el título",
  comment_added: "Agregó una nota",
};

export function TaskDetailDrawer({
  task,
  today,
  assigneeName,
  creatorName,
  moduleLabel,
  busy = false,
  onClose,
  onEdit,
  onDelete,
  onComplete,
  onReopen,
}: {
  task: DailyTask;
  today: string;
  assigneeName: string;
  creatorName: string;
  moduleLabel: string;
  busy?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const overdue = isTaskOverdue(task, today);
  const isDone = task.status === "done";

  // Focus trap: no cierra por Escape mientras se guarda una nota (§12).
  const onEscape = useCallback(() => {
    if (!savingNote) onClose();
  }, [savingNote, onClose]);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onEscape);

  const loadThreads = useCallback(async () => {
    const [c, h] = await Promise.allSettled([
      copilotApiFetch(`/api/copilot/daily-tasks/${task.id}/comments`),
      copilotApiFetch(`/api/copilot/daily-tasks/${task.id}/history`),
    ]);
    if (c.status === "fulfilled") {
      const j = (await c.value.json().catch(() => null)) as { ok?: boolean; data?: Comment[] } | null;
      if (j?.ok) setComments(j.data ?? []);
    }
    if (h.status === "fulfilled") {
      const j = (await h.value.json().catch(() => null)) as { ok?: boolean; data?: HistoryRow[] } | null;
      if (j?.ok) setHistory(j.data ?? []);
    }
  }, [task.id]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const addNote = useCallback(async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      const res = await copilotApiFetch(`/api/copilot/daily-tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && j?.ok) {
        setNote("");
        await loadThreads();
      }
    } finally {
      setSavingNote(false);
    }
  }, [note, task.id, loadThreads]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] shadow-xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--copilot-border)] p-4">
          <h2 id="task-detail-title" className="text-base font-semibold text-[var(--copilot-ink)]">
            {task.title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={priorityTone(task.priority)}>{priorityLabel(task.priority)}</StatusBadge>
            <StatusBadge tone={statusTone(task.status)} dot>
              {statusLabel(task.status)}
            </StatusBadge>
            {overdue ? <StatusBadge tone="danger">Atrasada</StatusBadge> : null}
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Field label="Responsable" value={assigneeName} />
            <Field label="Creada por" value={creatorName} />
            <Field label="Módulo" value={moduleLabel} />
            <Field label="Visibilidad" value={DAILY_TASK_VISIBILITY_LABELS[taskVisibility(task)]} />
            <Field label="Vencimiento" value={task.due_date ? task.due_date.slice(0, 10) : "Sin fecha"} />
            <Field label="Origen" value={task.task_key || task.source_type === "auto" ? "Automática" : "Manual"} />
          </dl>

          {task.description ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Descripción</p>
              <p className="mt-1 whitespace-pre-line text-sm text-[var(--copilot-ink)]">{task.description}</p>
            </div>
          ) : null}

          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            {isDone ? (
              <button type="button" disabled={busy} onClick={onReopen} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden /> Reabrir
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={onComplete} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Completar
              </button>
            )}
            <button type="button" onClick={onEdit} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden /> Editar
            </button>
            <button type="button" disabled={busy} onClick={onDelete} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Eliminar
            </button>
          </div>

          {/* Notas */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Notas</p>
            <div className="mt-2 flex flex-col gap-2">
              {comments.length === 0 ? (
                <p className="text-xs text-[var(--copilot-muted)]">Sin notas todavía.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2">
                    <p className="whitespace-pre-line text-xs text-[var(--copilot-ink)]">{c.body}</p>
                    <p className="mt-1 text-[10px] text-[var(--copilot-muted)]">{c.created_at.slice(0, 16).replace("T", " ")}</p>
                  </div>
                ))
              )}
              <div className="flex items-end gap-2">
                <textarea
                  aria-label="Agregar nota"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={4000}
                  placeholder="Escribí una nota…"
                  className="mt-1 w-full rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                />
                <button type="button" disabled={savingNote || !note.trim()} onClick={addNote} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
                  {savingNote ? "…" : "Agregar"}
                </button>
              </div>
            </div>
          </section>

          {/* Historial */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Historial</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {history.length === 0 ? (
                <li className="text-xs text-[var(--copilot-muted)]">Sin cambios registrados.</li>
              ) : (
                history.map((h) => (
                  <li key={h.id} className="text-xs text-[var(--copilot-ink)]">
                    <span className="font-medium">{ACTION_LABELS[h.action] ?? h.action}</span>
                    {h.old_value || h.new_value ? (
                      <span className="text-[var(--copilot-muted)]">
                        {" "}
                        {h.old_value ?? "—"} → {h.new_value ?? "—"}
                      </span>
                    ) : null}
                    <span className="text-[var(--copilot-muted)]"> · {h.created_at.slice(0, 16).replace("T", " ")}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--copilot-ink)]">{value}</dd>
    </div>
  );
}
