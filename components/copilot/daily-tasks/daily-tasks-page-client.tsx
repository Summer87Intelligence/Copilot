"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  DAILY_TASK_PRIORITY_LABELS,
  DAILY_TASK_STATUS_LABELS,
  type DailyTask,
} from "@/lib/daily-tasks/daily-tasks-types";

type TasksTab = "mis-tareas" | "por-modulo" | "completadas";

const TABS: Array<{ id: TasksTab; label: string }> = [
  { id: "mis-tareas", label: "Mis tareas" },
  { id: "por-modulo", label: "Por módulo" },
  { id: "completadas", label: "Completadas" },
];

type ListResponse = {
  ok: boolean;
  data?: DailyTask[];
  meta?: { total?: number; migration_pending?: boolean };
  message?: string;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function TaskList({ tasks, emptyText }: { tasks: DailyTask[]; emptyText: string }) {
  if (tasks.length === 0) {
    return <p className={`${copilotCaptionClass} mt-2`}>{emptyText}</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-[var(--copilot-border)] px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--copilot-text)]">{task.title}</p>
            {task.description ? (
              <p className={`${copilotCaptionClass} mt-0.5`}>{task.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-[var(--copilot-muted)]">
            <span>{DAILY_TASK_STATUS_LABELS[task.status]}</span>
            <span>Prioridad {DAILY_TASK_PRIORITY_LABELS[task.priority].toLowerCase()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DailyTasksPageClient() {
  const [tab, setTab] = useState<TasksTab>("mis-tareas");
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);

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

  const today = todayYmd();

  const counts = useMemo(() => {
    const pendingToday = tasks.filter(
      (t) => t.status === "pending" && (!t.due_date || t.due_date === today)
    ).length;
    const overdue = tasks.filter(
      (t) =>
        (t.status === "pending" || t.status === "in_progress") &&
        t.due_date != null &&
        t.due_date < today
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

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "pending" || t.status === "in_progress"),
    [tasks]
  );
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const tasksByModule = useMemo(() => {
    const groups = new Map<string, DailyTask[]>();
    for (const task of openTasks) {
      const list = groups.get(task.module_key) ?? [];
      list.push(task);
      groups.set(task.module_key, list);
    }
    return [...groups.entries()];
  }, [openTasks]);

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Tareas diarias"
        description="Tu lista operativa del día según tus permisos."
        right={
          <button
            type="button"
            disabled
            title="Actualizar tareas estará disponible en la siguiente fase."
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Actualizar tareas
          </button>
        }
      />

      <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
        {summaryCards.map((card) => (
          <div key={card.label} className={copilotCardStandardClass}>
            <p className={copilotMetricLabelClass}>{card.label}</p>
            <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
          </div>
        ))}
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm"
        aria-label="Secciones de tareas diarias"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={copilotButtonClassName({
              variant: tab === item.id ? "primary" : "ghost",
              size: "sm",
              className: tab === item.id ? "" : "!border-transparent",
            })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <p className={copilotCaptionClass}>
        Las tareas se generan según tus permisos y los módulos que podés ver. Usá Actualizar
        tareas para revisar pendientes del día.
      </p>

      {tab === "mis-tareas" ? (
        <section className={copilotCardStandardClass}>
          <h2 className={copilotSectionTitleClass}>Mis tareas</h2>
          <TaskList
            tasks={openTasks}
            emptyText={
              loading ? "Cargando tareas…" : "No tenés tareas pendientes para hoy."
            }
          />
        </section>
      ) : null}

      {tab === "por-modulo" ? (
        tasksByModule.length === 0 ? (
          <section className={copilotCardStandardClass}>
            <h2 className={copilotSectionTitleClass}>Por módulo</h2>
            <p className={`${copilotCaptionClass} mt-2`}>
              {loading ? "Cargando tareas…" : "No tenés tareas pendientes para hoy."}
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {tasksByModule.map(([moduleKey, moduleTasks]) => (
              <section key={moduleKey} className={copilotCardStandardClass}>
                <h2 className={copilotSectionTitleClass}>{moduleKey}</h2>
                <TaskList tasks={moduleTasks} emptyText="Sin tareas pendientes." />
              </section>
            ))}
          </div>
        )
      ) : null}

      {tab === "completadas" ? (
        <section className={copilotCardStandardClass}>
          <h2 className={copilotSectionTitleClass}>Completadas</h2>
          <TaskList
            tasks={doneTasks}
            emptyText={loading ? "Cargando tareas…" : "Todavía no completaste tareas hoy."}
          />
        </section>
      ) : null}
    </div>
  );
}
