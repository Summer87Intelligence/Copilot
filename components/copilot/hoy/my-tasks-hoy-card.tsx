"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ListChecks } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { TaskSummary } from "@/lib/tasks/task-summary";

/**
 * FASE 7 — Widget compacto de tareas para Hoy (§17). Solo tareas (sin monedas):
 * pendientes / para hoy / atrasadas del usuario, con CTA a Tareas. Se apoya en
 * /summary, que ya aplica la visibilidad del usuario. Silencioso si no hay nada.
 */
export function MyTasksHoyCard() {
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await copilotApiFetch("/api/copilot/daily-tasks/summary");
      const json = (await res.json().catch(() => null)) as { ok?: boolean; summary?: TaskSummary } | null;
      if (json?.ok && json.summary) setSummary(json.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !summary) return null;
  const active = summary.pending + summary.inProgress;
  if (active === 0 && summary.overdue === 0 && summary.dueToday === 0) return null;

  const chip = (label: string, value: number, danger = false) => (
    <div className="flex flex-col">
      <span
        className={`text-lg font-bold tabular-nums ${
          danger && value > 0 ? "text-[var(--copilot-danger-text-strong)]" : "text-[var(--copilot-ink)]"
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] text-[var(--copilot-ink-muted)]">{label}</span>
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <ListChecks className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
        <div className="flex gap-5">
          {chip("Pendientes", active)}
          {chip("Para hoy", summary.dueToday)}
          {chip("Atrasadas", summary.overdue, true)}
        </div>
      </div>
      <a
        href="/copilot/tareas-diarias"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-hover-bg)]"
      >
        Ver mis tareas
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}
