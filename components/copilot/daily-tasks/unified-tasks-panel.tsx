"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Play, Plus, RotateCcw, X } from "lucide-react";

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
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import {
  copilotCardStandardClass,
  copilotInputClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { FilterValues } from "@/lib/ui/filter-bar-model";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { MODULE_KEYS, type ModuleKey } from "@/lib/auth/module-permissions";
import {
  DAILY_TASK_PRIORITIES,
  DAILY_TASK_PRIORITY_LABELS,
  DAILY_TASK_VISIBILITIES,
  DAILY_TASK_VISIBILITY_LABELS,
  type DailyTask,
  type DailyTaskPriority,
  type DailyTaskVisibility,
} from "@/lib/daily-tasks/daily-tasks-types";
import { priorityLabel, priorityTone, statusLabel, statusTone } from "@/lib/tasks/task-ui";
import {
  UNIFIED_TASK_TAB_LABELS,
  visibleUnifiedTabs,
  type UnifiedTaskFilters,
  type UnifiedTaskItem,
  type UnifiedTaskSummary,
  type UnifiedTaskTab,
} from "@/lib/tasks/unified-task-feed";
import { TaskDetailDrawer } from "@/components/copilot/daily-tasks/task-detail-drawer";
import type { AssignableUser } from "@/components/copilot/daily-tasks/tasks-manager-panel";

const MODULE_LABELS: Record<string, string> = {
  hoy: "Alertas",
  clientes: "Clientes",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  finanzas: "Finanzas",
  datos: "Datos",
  bank_movements: "Banco",
  manual: "General",
};

const MANUAL_MODULE_CHOICES: ModuleKey[] = [
  "cobranza",
  "clientes",
  "cartera",
  "tesoreria",
  "bank_movements",
  "datos",
  "manual",
];

type Feedback = { tone: "ok" | "error"; message: string } | null;
type LoadOptions = { silent?: boolean };

type FormState = {
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
    title: "",
    description: "",
    module_key: "manual",
    priority: "medium",
    visibility: "workspace",
    assigned_to_user_id: viewerId,
    due_date: today,
  };
}

function buildQuery(tab: UnifiedTaskTab, filters: UnifiedTaskFilters): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== "all") params.set(key, String(value));
  }
  return params.toString();
}

export function UnifiedTasksPanel() {
  const today = useMemo(() => todayYmdMontevideo(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<UnifiedTaskItem[]>([]);
  const [summary, setSummary] = useState<UnifiedTaskSummary | null>(null);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewerId, setViewerId] = useState("");
  const [tab, setTab] = useState<UnifiedTaskTab>("priority");
  const [filters, setFilters] = useState<UnifiedTaskFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const load = useCallback(
    async (options: LoadOptions = {}) => {
      const silent = options.silent === true;
      if (!silent) setLoading(true);
      if (!silent) setError(false);
      const query = buildQuery(tab, filters);
      const [feedRes, usersRes] = await Promise.allSettled([
        copilotApiFetch(`/api/copilot/tasks/feed?${query}`),
        copilotApiFetch("/api/copilot/daily-tasks/users"),
      ]);

      let ok = false;
      if (feedRes.status === "fulfilled") {
        const json = (await feedRes.value.json().catch(() => null)) as
          | {
              ok?: boolean;
              items?: UnifiedTaskItem[];
              summary?: UnifiedTaskSummary;
              meta?: { isAdmin?: boolean; is_admin?: boolean; viewerId?: string; viewer_id?: string };
            }
          | null;
        if (json?.ok) {
          ok = true;
          setItems(json.items ?? []);
          setSummary(json.summary ?? null);
          setIsAdmin(Boolean(json.meta?.isAdmin ?? json.meta?.is_admin));
          setViewerId(String(json.meta?.viewerId ?? json.meta?.viewer_id ?? ""));
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
    },
    [filters, tab]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const tabs = useMemo(() => visibleUnifiedTabs(isAdmin), [isAdmin]);
  const selectedTask = useMemo(
    () => items.find((item) => item.kind === "task" && item.task?.id === selectedId)?.task ?? null,
    [items, selectedId]
  );

  const userName = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return "Sin asignar";
      if (id === viewerId) return "Vos";
      const u = users.find((user) => user.id === id);
      return u?.full_name || u?.email || "Usuario";
    },
    [users, viewerId]
  );

  const runRecommendationAction = useCallback(
    async (item: UnifiedTaskItem, action: "claim" | "start" | "dismiss") => {
      setBusyId(item.id);
      try {
        const res = await copilotApiFetch("/api/copilot/tasks/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stableKey: item.stableKey, action }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo actualizar la recomendación." });
          return;
        }
        const message =
          action === "dismiss"
            ? "Recomendación descartada por hoy."
            : action === "start"
              ? "Tarea iniciada."
              : "Tarea tomada.";
        setFeedback({ tone: "ok", message });
        await load({ silent: true });
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const patchTask = useCallback(
    async (task: DailyTask, patch: Record<string, unknown>, okMsg: string) => {
      setBusyId(task.id);
      try {
        const res = await copilotApiFetch(`/api/copilot/daily-tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo actualizar." });
          return;
        }
        setFeedback({ tone: "ok", message: okMsg });
        if (selectedId === task.id) setDetailRefreshKey((key) => key + 1);
        await load({ silent: true });
      } finally {
        setBusyId(null);
      }
    },
    [load, selectedId]
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
        assigned_to_user_id: isAdmin ? form.assigned_to_user_id || null : viewerId,
      };
      const res = await copilotApiFetch("/api/copilot/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setFeedback({ tone: "error", message: json?.error ?? "No se pudo crear la tarea." });
        return;
      }
      setForm(null);
      setFeedback({ tone: "ok", message: "Tarea creada." });
      await load({ silent: true });
    } finally {
      setSubmitting(false);
    }
  }, [form, isAdmin, load, viewerId]);

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

      {loading ? (
        <SkeletonMetricGrid count={isAdmin ? 6 : 5} />
      ) : summary ? (
        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${isAdmin ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          <CopilotKpiCard size="compact" eyebrow="Pendientes" value={summary.pending} />
          <CopilotKpiCard size="compact" eyebrow="En progreso" value={summary.inProgress} />
          <CopilotKpiCard size="compact" tone="danger" eyebrow="Atrasadas" value={summary.overdue} />
          <CopilotKpiCard size="compact" tone="warning" eyebrow="Para hoy" value={summary.dueToday} />
          <CopilotKpiCard size="compact" tone="positive" eyebrow="Recomendadas" value={summary.recommended} />
          {isAdmin ? <CopilotKpiCard size="compact" eyebrow="Sin asignar" value={summary.unassigned ?? 0} /> : null}
        </div>
      ) : null}

      <div role="tablist" aria-label="Vistas de tareas" className="flex gap-1.5 overflow-x-auto pb-0.5">
        {tabs.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              type="button"
              onClick={() => setTab(t)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)]/10 text-[var(--copilot-accent)]"
                  : "border-[var(--copilot-border)] text-[var(--copilot-muted)] hover:bg-[var(--copilot-hover-bg)]"
              }`}
            >
              {UNIFIED_TASK_TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FilterBar
          className="flex-1"
          values={filters as unknown as FilterValues}
          onClear={() => setFilters({})}
        >
          <FilterField label="Buscar" htmlFor="task-search" className="min-w-[180px] flex-1">
            <FilterSearchInput
              id="task-search"
              value={filters.search ?? ""}
              onChange={(search) => setFilters((current) => ({ ...current, search }))}
              placeholder="Buscar tarea o cliente…"
            />
          </FilterField>
          <FilterField label="Módulo" htmlFor="task-module">
            <FilterSelect
              id="task-module"
              value={filters.module ?? "all"}
              onChange={(module) => setFilters((current) => ({ ...current, module }))}
              options={[
                { value: "all", label: "Todos" },
                ...MANUAL_MODULE_CHOICES.map((key) => ({ value: key, label: MODULE_LABELS[key] ?? key })),
              ]}
            />
          </FilterField>
          <FilterField label="Origen" htmlFor="task-source">
            <FilterSelect
              id="task-source"
              value={filters.source ?? "all"}
              onChange={(source) => setFilters((current) => ({ ...current, source }))}
              options={[
                { value: "all", label: "Todos" },
                { value: "recommendation", label: "Recomendadas" },
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
                onChange={(assignee) => setFilters((current) => ({ ...current, assignee }))}
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
        <TaskCreateForm
          form={form}
          isAdmin={isAdmin}
          users={users}
          viewerId={viewerId}
          submitting={submitting}
          priorityOptions={priorityOptions}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSubmit={submitForm}
        />
      ) : null}

      {loading ? (
        <section className={copilotCardStandardClass} role="status" aria-label="Cargando tareas">
          <SkeletonText lines={6} />
        </section>
      ) : error ? (
        <EmptyState
          title="No pudimos cargar tus tareas"
          description="Reintentá para recuperar tu bandeja de trabajo."
          action={
            <button type="button" onClick={() => void load()} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              Reintentar
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={filters.search || filters.module ? "No encontramos tareas con estos filtros" : "Estás al día. No hay tareas prioritarias."}
          description={filters.search || filters.module ? "Probá limpiar filtros o crear una tarea nueva." : "Cuando haya tareas asignadas o recomendaciones relevantes, van a aparecer acá."}
        />
      ) : (
        <div role="tabpanel" aria-live="polite" className="grid gap-2">
          {items.map((item) => (
            <UnifiedTaskCard
              key={`${item.kind}:${item.id}`}
              item={item}
              assigneeName={userName(item.assignedToUserId)}
              busy={busyId === item.id}
              onOpenTask={(task) => setSelectedId(task.id)}
              onStartTask={(task) => void patchTask(task, { status: "in_progress" }, "Tarea iniciada.")}
              onCompleteTask={(task) => void patchTask(task, { status: "done" }, "Tarea completada.")}
              onReopenTask={(task) => void patchTask(task, { status: "pending" }, "Tarea reabierta.")}
              onClaimRecommendation={(rec) => void runRecommendationAction(rec, "claim")}
              onStartRecommendation={(rec) => void runRecommendationAction(rec, "start")}
              onDismissRecommendation={(rec) => void runRecommendationAction(rec, "dismiss")}
            />
          ))}
        </div>
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
          onEdit={() => setFeedback({ tone: "error", message: "Editá esta tarea desde Nueva tarea si necesitás cambiar campos." })}
          onDelete={() => setFeedback({ tone: "error", message: "La eliminación se gestiona desde la vista administrativa de tareas." })}
          onComplete={() => void patchTask(selectedTask, { status: "done" }, "Tarea completada.")}
          onReopen={() => void patchTask(selectedTask, { status: "pending" }, "Tarea reabierta.")}
        />
      ) : null}
    </div>
  );
}

function UnifiedTaskCard({
  item,
  assigneeName,
  busy,
  onOpenTask,
  onStartTask,
  onCompleteTask,
  onReopenTask,
  onClaimRecommendation,
  onStartRecommendation,
  onDismissRecommendation,
}: {
  item: UnifiedTaskItem;
  assigneeName: string;
  busy: boolean;
  onOpenTask: (task: DailyTask) => void;
  onStartTask: (task: DailyTask) => void;
  onCompleteTask: (task: DailyTask) => void;
  onReopenTask: (task: DailyTask) => void;
  onClaimRecommendation: (item: UnifiedTaskItem) => void;
  onStartRecommendation: (item: UnifiedTaskItem) => void;
  onDismissRecommendation: (item: UnifiedTaskItem) => void;
}) {
  const task = item.task;
  const isClosed = item.status === "completed" || item.status === "cancelled";
  const ghost = copilotButtonClassName({ variant: "ghost", size: "sm" });
  return (
    <article className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={item.kind === "recommendation" ? "warning" : "neutral"}>{item.sourceLabel}</StatusBadge>
            <StatusBadge tone="neutral">{item.moduleLabel}</StatusBadge>
            <StatusBadge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</StatusBadge>
            {item.kind === "task" && task ? (
              <StatusBadge tone={statusTone(task.status)} dot>
                {statusLabel(task.status)}
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning" dot>
                Recomendada
              </StatusBadge>
            )}
            <span className="text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
              {item.urgencyLabel}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">{item.title}</h3>
          {item.reason || item.description ? (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
              {item.reason ?? item.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--copilot-ink-muted)]">
            {item.dueDate ? <span>Vence: {item.dueDate}</span> : <span>Sin vencimiento</span>}
            <span>Responsable: {assigneeName}</span>
            {item.entityLabel ? <span>Entidad: {item.entityLabel}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-[var(--copilot-muted)]" aria-hidden /> : null}
          {item.actionUrl ? (
            <a href={item.actionUrl} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Abrir contexto
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
          {item.kind === "recommendation" ? (
            <>
              <button type="button" disabled={busy} onClick={() => onClaimRecommendation(item)} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
                Tomar tarea
              </button>
              <button type="button" disabled={busy} onClick={() => onStartRecommendation(item)} className={ghost}>
                <Play className="mr-1 h-3.5 w-3.5" aria-hidden />
                Iniciar
              </button>
              <button type="button" disabled={busy} onClick={() => onDismissRecommendation(item)} className={ghost}>
                Descartar
              </button>
            </>
          ) : task ? (
            <>
              <button type="button" disabled={busy} onClick={() => onOpenTask(task)} className={ghost}>
                Abrir
              </button>
              {!isClosed && task.status !== "in_progress" ? (
                <button type="button" disabled={busy} onClick={() => onStartTask(task)} className={ghost}>
                  <Play className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Iniciar
                </button>
              ) : null}
              {!isClosed ? (
                <button type="button" disabled={busy} onClick={() => onCompleteTask(task)} className={ghost}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Completar
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => onReopenTask(task)} className={ghost}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Reabrir
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TaskCreateForm({
  form,
  isAdmin,
  users,
  viewerId,
  submitting,
  priorityOptions,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  isAdmin: boolean;
  users: AssignableUser[];
  viewerId: string;
  submitting: boolean;
  priorityOptions: readonly DailyTaskPriority[];
  onChange: (form: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Nueva tarea</h3>
        <button type="button" onClick={onCancel} aria-label="Cerrar formulario" className="rounded-lg p-1 text-[var(--copilot-muted)] hover:bg-[var(--copilot-hover-bg)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Título</span>
          <input
            type="text"
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
            className={copilotInputClass}
            maxLength={200}
            required
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Descripción</span>
          <textarea
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
            className={copilotInputClass}
            rows={2}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Módulo</span>
          <select
            value={form.module_key}
            onChange={(event) => onChange({ ...form, module_key: event.target.value as ModuleKey })}
            className={copilotInputClass}
          >
            {MANUAL_MODULE_CHOICES.filter((key) => (MODULE_KEYS as readonly string[]).includes(key)).map((key) => (
              <option key={key} value={key}>
                {MODULE_LABELS[key] ?? key}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Prioridad</span>
          <select
            value={form.priority}
            onChange={(event) => onChange({ ...form, priority: event.target.value as DailyTaskPriority })}
            className={copilotInputClass}
          >
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {DAILY_TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Responsable</span>
          <select
            value={form.assigned_to_user_id}
            disabled={!isAdmin}
            onChange={(event) => onChange({ ...form, assigned_to_user_id: event.target.value })}
            className={copilotInputClass}
          >
            {isAdmin ? <option value="">Sin asignar</option> : null}
            {isAdmin ? (
              users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name || user.email || "Usuario"}
                  {user.active ? "" : " (inactivo)"}
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
            onChange={(event) => onChange({ ...form, visibility: event.target.value as DailyTaskVisibility })}
            className={copilotInputClass}
          >
            {DAILY_TASK_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {DAILY_TASK_VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Vencimiento</span>
          <input
            type="date"
            value={form.due_date}
            onChange={(event) => onChange({ ...form, due_date: event.target.value })}
            className={copilotInputClass}
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
