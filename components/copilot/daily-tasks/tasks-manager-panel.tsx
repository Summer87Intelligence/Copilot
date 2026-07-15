"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import {
  FilterBar,
  FilterField,
  FilterSearchInput,
  FilterSelect,
} from "@/components/copilot/ui/filter-bar";
import { SkeletonMetricGrid, SkeletonText } from "@/components/copilot/ui/skeleton";
import { copilotCardStandardClass } from "@/components/copilot/ui/copilot-visual-system";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { FilterValues } from "@/lib/ui/filter-bar-model";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { MODULE_KEYS, type ModuleKey } from "@/lib/auth/module-permissions";
import {
  DAILY_TASK_PRIORITIES,
  DAILY_TASK_PRIORITY_LABELS,
  DAILY_TASK_STATUS_LABELS,
  DAILY_TASK_VISIBILITIES,
  DAILY_TASK_VISIBILITY_LABELS,
  type DailyTask,
  type DailyTaskPriority,
  type DailyTaskVisibility,
} from "@/lib/daily-tasks/daily-tasks-types";
import { summarizeTasks } from "@/lib/tasks/task-summary";
import {
  TASK_TAB_LABELS,
  filterTasksForBoard,
  tabCounts,
  visibleTabs,
  type TaskBoardFilters,
  type TaskTab,
} from "@/lib/tasks/task-board";
import { TaskManagerRow } from "@/components/copilot/daily-tasks/task-manager-row";
import { TaskDetailDrawer } from "@/components/copilot/daily-tasks/task-detail-drawer";

export type AssignableUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active: boolean;
};

const MODULE_LABELS: Record<string, string> = {
  hoy: "Hoy",
  clientes: "Clientes",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  finanzas: "Finanzas",
  bank_movements: "Banco",
  reportes: "Reportes",
  manual: "General",
  general: "General",
};

const MANUAL_MODULE_CHOICES: ModuleKey[] = [
  "cobranza",
  "clientes",
  "cartera",
  "tesoreria",
  "bank_movements",
  "manual",
];

type Feedback = { tone: "ok" | "error"; message: string } | null;
type LoadOptions = { silent?: boolean };

type FormState = {
  id: string | null;
  title: string;
  description: string;
  module_key: ModuleKey;
  priority: DailyTaskPriority;
  visibility: DailyTaskVisibility;
  assigned_to_user_id: string;
  due_date: string;
};

function emptyForm(today: string, viewerId: string): FormState {
  return {
    id: null,
    title: "",
    description: "",
    module_key: "manual",
    priority: "medium",
    visibility: "workspace",
    assigned_to_user_id: viewerId,
    due_date: today,
  };
}

export function TasksManagerPanel() {
  const today = useMemo(() => todayYmdMontevideo(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewerId, setViewerId] = useState("");
  const [tab, setTab] = useState<TaskTab>("mine");
  const [filters, setFilters] = useState<TaskBoardFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const syncTask = useCallback((task: DailyTask) => {
    setTasks((current) => {
      if (task.source_type === "auto") return current.filter((t) => t.id !== task.id);
      const exists = current.some((t) => t.id === task.id);
      return exists ? current.map((t) => (t.id === task.id ? task : t)) : [task, ...current];
    });
  }, []);

  const load = useCallback(async (options: LoadOptions = {}) => {
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    if (!silent) setError(false);
    const [tasksRes, usersRes] = await Promise.allSettled([
      copilotApiFetch("/api/copilot/daily-tasks"),
      copilotApiFetch("/api/copilot/daily-tasks/users"),
    ]);

    let ok = false;
    if (tasksRes.status === "fulfilled") {
      const json = (await tasksRes.value.json().catch(() => null)) as
        | { ok?: boolean; data?: DailyTask[]; meta?: { is_admin?: boolean; viewer_id?: string } }
        | null;
      if (json?.ok) {
        ok = true;
        // La vista de gestión excluye las filas de interacción automáticas (source_type 'auto').
        setTasks((json.data ?? []).filter((t) => t.source_type !== "auto"));
        setIsAdmin(Boolean(json.meta?.is_admin));
        setViewerId(json.meta?.viewer_id ?? "");
      }
    }
    if (usersRes.status === "fulfilled") {
      const json = (await usersRes.value.json().catch(() => null)) as
        | { ok?: boolean; data?: AssignableUser[] }
        | null;
      if (json?.ok) setUsers(json.data ?? []);
    }
    setError(!ok);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const tabs = useMemo(() => visibleTabs(isAdmin), [isAdmin]);
  const counts = useMemo(
    () => tabCounts(tasks, { viewerId, todayYmd: today, isAdmin }),
    [tasks, viewerId, today, isAdmin]
  );
  const summary = useMemo(
    () => summarizeTasks(tasks, { todayYmd: today, periodStartYmd: `${today.slice(0, 7)}-01` }),
    [tasks, today]
  );
  const visibleRows = useMemo(
    () => filterTasksForBoard(tasks, { tab, filters, viewerId, todayYmd: today }),
    [tasks, tab, filters, viewerId, today]
  );

  const userName = useCallback(
    (id: string | null): string => {
      if (!id) return "Sin asignar";
      if (id === viewerId) return "Vos";
      const u = users.find((x) => x.id === id);
      return u?.full_name || u?.email || "Usuario";
    },
    [users, viewerId]
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId]
  );

  // ── Mutaciones ────────────────────────────────────────────────────────────────
  const patchTask = useCallback(
    async (id: string, patch: Record<string, unknown>, okMsg: string) => {
      setBusyId(id);
      try {
        const res = await copilotApiFetch(`/api/copilot/daily-tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; data?: DailyTask }
          | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo actualizar." });
          return false;
        }
        if (json.data) {
          syncTask(json.data);
        } else {
          await load({ silent: true });
        }
        setFeedback({ tone: "ok", message: okMsg });
        if (selectedId === id) setDetailRefreshKey((key) => key + 1);
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [load, selectedId, syncTask]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta tarea?")) return;
      setBusyId(id);
      try {
        const res = await copilotApiFetch(`/api/copilot/daily-tasks/${id}`, { method: "DELETE" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo eliminar." });
          return;
        }
        setFeedback({ tone: "ok", message: "Tarea eliminada." });
        setSelectedId(null);
        setTasks((current) => current.filter((task) => task.id !== id));
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  const submitForm = useCallback(async () => {
    if (!form) return;
    if (!form.title.trim()) {
      setFeedback({ tone: "error", message: "Escribí un título." });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        module_key: form.module_key,
        priority: form.priority,
        visibility: form.visibility,
        due_date: form.due_date || null,
      };
      if (isAdmin || !form.id) {
        payload.assigned_to_user_id = form.assigned_to_user_id || null;
      }
      const res = await copilotApiFetch(
        form.id ? `/api/copilot/daily-tasks/${form.id}` : "/api/copilot/daily-tasks",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; data?: DailyTask }
        | null;
      if (!res.ok || !json?.ok) {
        setFeedback({ tone: "error", message: json?.error ?? "No se pudo guardar." });
        return;
      }
      if (json.data) {
        syncTask(json.data);
      } else {
        await load({ silent: true });
      }
      setForm(null);
      setFeedback({ tone: "ok", message: form.id ? "Tarea actualizada." : "Tarea creada." });
      if (form.id) {
        setSelectedId(form.id);
        setDetailRefreshKey((key) => key + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, isAdmin, load, syncTask]);

  const startEdit = useCallback(
    (task: DailyTask) => {
      setForm({
        id: task.id,
        title: task.title,
        description: task.description ?? "",
        module_key: (MODULE_KEYS as readonly string[]).includes(task.module_key)
          ? (task.module_key as ModuleKey)
          : "manual",
        priority: task.priority,
        visibility: (task.visibility as DailyTaskVisibility) ?? "workspace",
        assigned_to_user_id: task.assigned_to_user_id ?? "",
        due_date: task.due_date ? task.due_date.slice(0, 10) : "",
      });
      setSelectedId(null);
    },
    []
  );

  const priorityOptions = DAILY_TASK_PRIORITIES.filter((p) => isAdmin || p !== "critical");

  return (
    <div className="flex flex-col gap-4">
      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-3 py-2 text-xs ${
            feedback.tone === "ok"
              ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
              : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {/* KPIs (solo tareas, sin monedas) */}
      {loading ? (
        <SkeletonMetricGrid count={isAdmin ? 6 : 5} />
      ) : (
        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${isAdmin ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          <CopilotKpiCard size="compact" eyebrow="Pendientes" value={summary.pending} />
          <CopilotKpiCard size="compact" eyebrow="En progreso" value={summary.inProgress} />
          <CopilotKpiCard size="compact" tone="danger" eyebrow="Atrasadas" value={summary.overdue} />
          <CopilotKpiCard size="compact" tone="warning" eyebrow="Para hoy" value={summary.dueToday} />
          <CopilotKpiCard size="compact" tone="positive" eyebrow="Completadas" value={summary.completedInPeriod} />
          {isAdmin ? (
            <CopilotKpiCard size="compact" eyebrow="Sin asignar" value={summary.unassigned} />
          ) : null}
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Vistas de tareas" className="flex flex-wrap gap-1.5 overflow-x-auto">
        {tabs.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                active
                  ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)]/10 text-[var(--copilot-accent)]"
                  : "border-[var(--copilot-border)] text-[var(--copilot-muted)] hover:bg-[var(--copilot-hover-bg)]"
              }`}
            >
              {TASK_TAB_LABELS[t]}
              <span className="rounded-full bg-[var(--copilot-soft-bg)] px-1.5 text-[10px] tabular-nums">
                {counts[t] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filtros + acción crear */}
      <div className="flex flex-wrap items-end gap-2">
        <FilterBar
          className="flex-1"
          values={filters as unknown as FilterValues}
          onClear={() => setFilters({})}
        >
          <FilterField label="Buscar" htmlFor="task-q" className="min-w-[160px] flex-1">
            <FilterSearchInput
              id="task-q"
              value={filters.q ?? ""}
              onChange={(q) => setFilters((f) => ({ ...f, q }))}
              placeholder="Buscar tarea…"
            />
          </FilterField>
          <FilterField label="Módulo" htmlFor="task-module">
            <FilterSelect
              id="task-module"
              value={filters.module ?? "all"}
              onChange={(module) => setFilters((f) => ({ ...f, module }))}
              options={[
                { value: "all", label: "Todos" },
                ...MANUAL_MODULE_CHOICES.map((k) => ({ value: k, label: MODULE_LABELS[k] ?? k })),
              ]}
            />
          </FilterField>
          <FilterField label="Prioridad" htmlFor="task-priority">
            <FilterSelect
              id="task-priority"
              value={filters.priority ?? "all"}
              onChange={(priority) => setFilters((f) => ({ ...f, priority }))}
              options={[
                { value: "all", label: "Todas" },
                ...DAILY_TASK_PRIORITIES.map((p) => ({ value: p, label: DAILY_TASK_PRIORITY_LABELS[p] })),
              ]}
            />
          </FilterField>
          <FilterField label="Estado" htmlFor="task-status">
            <FilterSelect
              id="task-status"
              value={filters.status ?? "all"}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              options={[
                { value: "all", label: "Todos" },
                ...(["pending", "in_progress", "done", "cancelled"] as const).map((s) => ({
                  value: s,
                  label: DAILY_TASK_STATUS_LABELS[s],
                })),
              ]}
            />
          </FilterField>
          <FilterField label="Origen" htmlFor="task-source">
            <FilterSelect
              id="task-source"
              value={filters.source ?? "all"}
              onChange={(source) => setFilters((f) => ({ ...f, source }))}
              options={[
                { value: "all", label: "Todos" },
                { value: "manual", label: "Manual" },
                { value: "automatic", label: "Automática" },
              ]}
            />
          </FilterField>
          {isAdmin ? (
            <FilterField label="Responsable" htmlFor="task-assignee">
              <FilterSelect
                id="task-assignee"
                value={filters.assignee ?? "all"}
                onChange={(assignee) => setFilters((f) => ({ ...f, assignee }))}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "unassigned", label: "Sin asignar" },
                  ...users.map((u) => ({ value: u.id, label: u.full_name || u.email || "Usuario" })),
                ]}
              />
            </FilterField>
          ) : null}
        </FilterBar>
        <button
          type="button"
          onClick={() => setForm(form ? null : emptyForm(today, viewerId))}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Nueva tarea
        </button>
      </div>

      {form ? (
        <TaskForm
          form={form}
          submitting={submitting}
          isAdmin={isAdmin}
          users={users}
          viewerId={viewerId}
          moduleChoices={MANUAL_MODULE_CHOICES}
          moduleLabels={MODULE_LABELS}
          priorityOptions={priorityOptions}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSubmit={submitForm}
        />
      ) : null}

      {/* Lista */}
      {loading ? (
        <section className={copilotCardStandardClass}>
          <SkeletonText lines={5} />
        </section>
      ) : error ? (
        <EmptyState
          title="No pudimos cargar las tareas"
          description="Reintentá para recuperar las tareas del equipo."
          action={
            <button type="button" onClick={() => void load()} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              Reintentar
            </button>
          }
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={tab === "mine" ? "No tenés tareas en esta vista" : "No hay tareas con estos filtros"}
          description="Probá con otros filtros o creá una tarea nueva."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleRows.map((task) => (
            <TaskManagerRow
              key={task.id}
              task={task}
              today={today}
              assigneeName={userName(task.assigned_to_user_id)}
              busy={busyId === task.id}
              onOpen={() => setSelectedId(task.id)}
              onComplete={() => void patchTask(task.id, { status: "done" }, "Tarea completada.")}
              onStart={() => void patchTask(task.id, { status: "in_progress" }, "Tarea iniciada.")}
              onReopen={() => void patchTask(task.id, { status: "pending" }, "Tarea reabierta.")}
            />
          ))}
        </ul>
      )}

      {selectedTask ? (
        <TaskDetailDrawer
          task={selectedTask}
          today={today}
          assigneeName={userName(selectedTask.assigned_to_user_id)}
          creatorName={userName(selectedTask.created_by_user_id ?? null)}
          moduleLabel={MODULE_LABELS[selectedTask.module_key] ?? selectedTask.module_key}
          busy={busyId === selectedTask.id}
          refreshKey={detailRefreshKey}
          onClose={() => setSelectedId(null)}
          onEdit={() => startEdit(selectedTask)}
          onDelete={() => void deleteTask(selectedTask.id)}
          onComplete={() => void patchTask(selectedTask.id, { status: "done" }, "Tarea completada.")}
          onReopen={() => void patchTask(selectedTask.id, { status: "pending" }, "Tarea reabierta.")}
        />
      ) : null}
    </div>
  );
}

// ─── Formulario ────────────────────────────────────────────────────────────────

function TaskForm({
  form,
  submitting,
  isAdmin,
  users,
  viewerId,
  moduleChoices,
  moduleLabels,
  priorityOptions,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  isAdmin: boolean;
  users: AssignableUser[];
  viewerId: string;
  moduleChoices: ModuleKey[];
  moduleLabels: Record<string, string>;
  priorityOptions: readonly DailyTaskPriority[];
  onChange: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputClass =
    "mt-1 w-full rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]";
  return (
    <form
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
        {form.id ? "Editar tarea" : "Nueva tarea"}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Título</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            className={inputClass}
            maxLength={200}
            required
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Descripción (opcional)</span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={inputClass}
            rows={2}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Módulo</span>
          <select
            value={form.module_key}
            onChange={(e) => onChange({ ...form, module_key: e.target.value as ModuleKey })}
            className={inputClass}
          >
            {moduleChoices.map((k) => (
              <option key={k} value={k}>
                {moduleLabels[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Prioridad</span>
          <select
            value={form.priority}
            onChange={(e) => onChange({ ...form, priority: e.target.value as DailyTaskPriority })}
            className={inputClass}
          >
            {priorityOptions.map((p) => (
              <option key={p} value={p}>
                {DAILY_TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Responsable</span>
          <select
            value={form.assigned_to_user_id}
            onChange={(e) => onChange({ ...form, assigned_to_user_id: e.target.value })}
            className={inputClass}
            disabled={!isAdmin}
          >
            <option value="">Sin asignar</option>
            {isAdmin ? (
              users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email || "Usuario"}
                  {u.active ? "" : " (inactivo)"}
                </option>
              ))
            ) : (
              <option value={viewerId}>Yo</option>
            )}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Visibilidad</span>
          <select
            value={form.visibility}
            onChange={(e) => onChange({ ...form, visibility: e.target.value as DailyTaskVisibility })}
            className={inputClass}
          >
            {DAILY_TASK_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {DAILY_TASK_VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Vencimiento</span>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => onChange({ ...form, due_date: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Cancelar
        </button>
        <button type="submit" disabled={submitting} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
