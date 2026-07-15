"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import type { ModuleKey } from "@/lib/auth/module-permissions";
import type { DailyTask, DailyTaskPriority } from "@/lib/daily-tasks/daily-tasks-types";
import { tasksForEntity } from "@/lib/tasks/task-entity";
import { priorityLabel, priorityTone, statusLabel, statusTone } from "@/lib/tasks/task-ui";

/**
 * FASE 7 — Tarjeta reutilizable de tareas vinculadas a una entidad.
 * Se usa en Cliente 360, Cobranza y Alertas pasando source_type/source_id.
 * Respeta permisos (canWrite) y no toca lógica financiera.
 */
export function RelatedTasksCard({
  sourceType,
  sourceId,
  moduleKey,
  canWrite = false,
  title = "Tareas relacionadas",
  defaultTitle = "",
  defaultPriority = "medium",
  actionUrl,
}: {
  sourceType: string;
  sourceId: string;
  moduleKey: ModuleKey;
  canWrite?: boolean;
  title?: string;
  defaultTitle?: string;
  /** Prioridad sugerida inicial (editable dentro de permisos). */
  defaultPriority?: DailyTaskPriority;
  /** URL estable para abrir la entidad desde la tarea (action_url). */
  actionUrl?: string;
}) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState(defaultTitle);
  const [draftPriority, setDraftPriority] = useState<DailyTaskPriority>(defaultPriority);
  const [draftDue, setDraftDue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/daily-tasks");
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: DailyTask[] } | null;
      if (json?.ok) setTasks(tasksForEntity(json.data ?? [], sourceType, sourceId));
    } finally {
      setLoading(false);
    }
  }, [sourceType, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!draftTitle.trim()) return;
    setSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          module_key: moduleKey,
          source_type: sourceType,
          source_id: sourceId,
          priority: draftPriority,
          due_date: draftDue || null,
          action_url: actionUrl ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && json?.ok) {
        setCreating(false);
        setDraftTitle("");
        setDraftDue("");
        setDraftPriority(defaultPriority);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }, [draftTitle, draftPriority, draftDue, moduleKey, sourceType, sourceId, actionUrl, defaultPriority, load]);

  const inputClass =
    "w-full rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]";

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">{title}</p>
        {canWrite && !creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Nueva
          </button>
        ) : null}
      </div>

      {creating ? (
        <form
          className="mb-3 flex flex-col gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="text"
            aria-label="Título de la tarea"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="¿Qué hay que hacer con este cliente?"
            maxLength={200}
            className={inputClass}
            required
          />
          <div className="flex gap-2">
            <select
              aria-label="Prioridad"
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as DailyTaskPriority)}
              className={inputClass}
            >
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
            <input
              type="date"
              aria-label="Vencimiento"
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
              min={todayYmdMontevideo()}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              {saving ? "Guardando…" : "Crear tarea"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">Cargando tareas…</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">Sin tareas vinculadas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--copilot-ink)]">{task.title}</span>
              <StatusBadge tone={priorityTone(task.priority)}>{priorityLabel(task.priority)}</StatusBadge>
              <StatusBadge tone={statusTone(task.status)} dot>
                {statusLabel(task.status)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
