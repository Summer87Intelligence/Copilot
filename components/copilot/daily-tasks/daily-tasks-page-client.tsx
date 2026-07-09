"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { MODULE_KEYS, type ModuleKey } from "@/lib/auth/module-permissions";
import {
  DAILY_TASK_PRIORITY_LABELS,
  DAILY_TASK_STATUS_LABELS,
  type DailyTask,
  type DailyTaskPriority,
} from "@/lib/daily-tasks/daily-tasks-types";

type TaskFilter = "pendientes" | "vencidas" | "completadas" | "todas";

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: "pendientes", label: "Pendientes" },
  { id: "vencidas", label: "Vencidas" },
  { id: "completadas", label: "Completadas" },
  { id: "todas", label: "Todas" },
];

type ListResponse = { ok: boolean; data?: DailyTask[]; message?: string };
type WriteResponse = { ok: boolean; data?: DailyTask; error?: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

const MODULE_LABELS: Record<string, string> = {
  hoy: "Hoy",
  dashboard: "Dashboard",
  acciones: "Acciones",
  clientes: "Clientes",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  finanzas: "Finanzas",
  reportes: "Reportes",
  datos: "Datos",
  agentes: "Agentes IA",
  manual: "Manual",
  admin: "Admin",
  helpdesk: "Mesa de ayuda",
  bank_movements: "Movimientos bancarios",
  daily_tasks: "Tareas diarias",
};

type FormState = {
  id: string | null;
  title: string;
  description: string;
  module_key: ModuleKey;
  priority: DailyTaskPriority;
  due_date: string;
};

function emptyForm(): FormState {
  return {
    id: null,
    title: "",
    description: "",
    module_key: "cobranza",
    priority: "medium",
    due_date: todayYmd(),
  };
}

function formFromTask(t: DailyTask): FormState {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    module_key: (MODULE_KEYS as readonly string[]).includes(t.module_key)
      ? (t.module_key as ModuleKey)
      : "cobranza",
    priority: t.priority,
    due_date: t.due_date ? t.due_date.slice(0, 10) : "",
  };
}

export function DailyTasksPageClient() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>("pendientes");
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/copilot/daily-tasks");
      const json = (await res.json()) as ListResponse;
      if (json.ok) setTasks(json.data ?? []);
    } catch {
      // Estado vacío ya cubre el caso sin datos.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const today = todayYmd();

  const counts = useMemo(() => {
    const pendingToday = tasks.filter(
      (t) => t.status === "pending" && (!t.due_date || t.due_date.slice(0, 10) === today)
    ).length;
    const overdue = tasks.filter(
      (t) =>
        (t.status === "pending" || t.status === "in_progress") &&
        t.due_date != null &&
        t.due_date.slice(0, 10) < today
    ).length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const doneToday = tasks.filter(
      (t) => t.status === "done" && (t.completed_at ?? "").slice(0, 10) === today
    ).length;
    return { pendingToday, overdue, inProgress, doneToday };
  }, [tasks, today]);

  const summaryCards = [
    { label: "Pendientes hoy", value: counts.pendingToday },
    { label: "Vencidas", value: counts.overdue },
    { label: "En progreso", value: counts.inProgress },
    { label: "Completadas hoy", value: counts.doneToday },
  ];

  const visibleTasks = useMemo(() => {
    switch (filter) {
      case "pendientes":
        return tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
      case "vencidas":
        return tasks.filter(
          (t) =>
            (t.status === "pending" || t.status === "in_progress") &&
            t.due_date != null &&
            t.due_date.slice(0, 10) < today
        );
      case "completadas":
        return tasks.filter((t) => t.status === "done");
      default:
        return tasks;
    }
  }, [tasks, filter, today]);

  const submitForm = useCallback(async () => {
    if (!form) return;
    if (!form.title.trim()) {
      setFeedback({ tone: "error", message: "El título es obligatorio." });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        module_key: form.module_key,
        priority: form.priority,
        due_date: form.due_date || null,
      };

      const res = await fetch(
        form.id ? `/api/copilot/daily-tasks/${form.id}` : "/api/copilot/daily-tasks",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo guardar la tarea." });
        return;
      }
      setForm(null);
      setFeedback({ tone: "ok", message: form.id ? "Tarea actualizada." : "Tarea creada." });
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const setStatus = useCallback(
    async (task: DailyTask, status: "done" | "pending") => {
      const res = await fetch(`/api/copilot/daily-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo actualizar la tarea." });
        return;
      }
      await load();
    },
    [load]
  );

  const remove = useCallback(
    async (task: DailyTask) => {
      if (!window.confirm("¿Eliminar esta tarea?")) return;
      const res = await fetch(`/api/copilot/daily-tasks/${task.id}`, { method: "DELETE" });
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo eliminar." });
        return;
      }
      setFeedback({ tone: "ok", message: "Tarea eliminada." });
      await load();
    },
    [load]
  );

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Tareas diarias"
        description="Checklist operativo para no dejar controles pendientes."
        right={
          <button
            type="button"
            onClick={() => setForm(form ? null : emptyForm())}
            className={copilotButtonClassName({ variant: "primary", size: "sm" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Nueva tarea
          </button>
        }
      />

      {feedback ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            feedback.tone === "ok"
              ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
              : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
        {summaryCards.map((card) => (
          <div key={card.label} className={copilotCardStandardClass}>
            <p className={copilotMetricLabelClass}>{card.label}</p>
            <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
          </div>
        ))}
      </div>

      {form ? (
        <TaskForm
          form={form}
          submitting={submitting}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSubmit={submitForm}
        />
      ) : null}

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm"
        aria-label="Filtros de tareas"
      >
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={copilotButtonClassName({
              variant: filter === item.id ? "primary" : "ghost",
              size: "sm",
              className: filter === item.id ? "" : "!border-transparent",
            })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <p className={copilotCaptionClass}>
        Las tareas se muestran según tus permisos y los módulos que podés ver.
      </p>

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>
          {FILTERS.find((f) => f.id === filter)?.label ?? "Tareas"}
        </h2>
        {visibleTasks.length === 0 ? (
          <p className={`${copilotCaptionClass} mt-2`}>
            {loading ? "Cargando tareas…" : "No hay tareas pendientes para hoy."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {visibleTasks.map((task) => {
              const done = task.status === "done";
              const overdue =
                !done && task.due_date != null && task.due_date.slice(0, 10) < today;
              return (
                <li
                  key={task.id}
                  className="flex items-start gap-3 rounded-xl border border-[var(--copilot-border)] px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => void setStatus(task, done ? "pending" : "done")}
                    aria-label={done ? "Reabrir tarea" : "Completar tarea"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      done
                        ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
                        : "border-[var(--copilot-border)]"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        done
                          ? "text-[var(--copilot-muted)] line-through"
                          : "text-[var(--copilot-text)]"
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description ? (
                      <p className={`${copilotCaptionClass} mt-0.5`}>{task.description}</p>
                    ) : null}
                    <p className={`${copilotCaptionClass} mt-0.5`}>
                      {MODULE_LABELS[task.module_key] ?? task.module_key}
                      {" · "}
                      Prioridad {DAILY_TASK_PRIORITY_LABELS[task.priority].toLowerCase()}
                      {task.due_date ? (
                        <span className={overdue ? "text-[var(--copilot-danger-text-strong)]" : ""}>
                          {" · "}
                          {overdue ? "Venció " : "Vence "}
                          {task.due_date.slice(0, 10)}
                        </span>
                      ) : null}
                      {done ? ` · ${DAILY_TASK_STATUS_LABELS.done}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {done ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(task, "pending")}
                        className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                        aria-label="Reabrir"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setForm(formFromTask(task))}
                        className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(task)}
                      className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TaskForm({
  form,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  onChange: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
          {form.id ? "Editar tarea" : "Nueva tarea"}
        </h3>
        <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[var(--copilot-muted)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Título</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            className={copilotInputClass}
            maxLength={200}
            required
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Descripción</span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={copilotInputClass}
            rows={2}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Módulo</span>
          <select
            value={form.module_key}
            onChange={(e) => onChange({ ...form, module_key: e.target.value as ModuleKey })}
            className={copilotInputClass}
          >
            {MODULE_KEYS.map((k) => (
              <option key={k} value={k}>
                {MODULE_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Prioridad</span>
          <select
            value={form.priority}
            onChange={(e) => onChange({ ...form, priority: e.target.value as DailyTaskPriority })}
            className={copilotInputClass}
          >
            <option value="high">{DAILY_TASK_PRIORITY_LABELS.high}</option>
            <option value="medium">{DAILY_TASK_PRIORITY_LABELS.medium}</option>
            <option value="low">{DAILY_TASK_PRIORITY_LABELS.low}</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Fecha límite</span>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => onChange({ ...form, due_date: e.target.value })}
            className={copilotInputClass}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          {submitting ? "Guardando…" : form.id ? "Guardar cambios" : "Crear tarea"}
        </button>
      </div>
    </form>
  );
}
