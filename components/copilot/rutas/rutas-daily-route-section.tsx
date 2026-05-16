"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Check } from "lucide-react";

import { CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import { compareWorkflowPriority } from "@/lib/copilot-operational-workflow-scoring";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

type DailyStep = {
  id: string;
  index: number;
  title: string;
  description: string;
  estimatedTime: string;
  href: string | null;
};

function estimatedTimeForWorkflow(workflow: OperationalWorkflowExecution): string {
  if (workflow.status === "blocked") return "5–10 min";
  const remaining = workflow.steps.filter(
    (s) => s.status === "pending" || s.status === "active"
  ).length;
  if (remaining <= 1) return "15–20 min";
  if (remaining <= 2) return "30–45 min";
  return "45–60 min";
}

function descriptionForWorkflow(workflow: OperationalWorkflowExecution): string {
  if (workflow.status === "blocked") {
    const reason = workflow.steps.find((s) => s.blockedReason)?.blockedReason;
    return reason ? `Bloqueado: ${reason}` : "Necesita revisión para continuar.";
  }
  if (workflow.currentStepTitle) return `Paso actual: ${workflow.currentStepTitle}`;
  if (workflow.progressPercent === 0) return "Sin iniciar — primer paso pendiente.";
  return `${workflow.progressPercent}% completado.`;
}

export function RutasDailyRouteSection() {
  const { workflows, recommendations, executiveBriefing, loading } =
    useRutasOperationalFeedSnapshot();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const steps = useMemo((): DailyStep[] => {
    const result: DailyStep[] = [];

    // Priority 1: briefing doFirst items (up to 2)
    if (executiveBriefing) {
      for (const item of executiveBriefing.doFirst.slice(0, 2)) {
        result.push({
          id: `briefing-${item.title}`,
          index: result.length + 1,
          title: item.title,
          description: item.reason,
          estimatedTime: "15–30 min",
          href: item.href ?? null,
        });
      }
    }

    // Priority 2: blocked or active workflows by priority order
    if (result.length < 4) {
      const activeWorkflows = workflows
        .filter((w) => w.status === "active" || w.status === "blocked")
        .sort(compareWorkflowPriority);

      for (const w of activeWorkflows) {
        if (result.length >= 4) break;
        const alreadyListed = result.some((s) => s.title === w.title);
        if (alreadyListed) continue;
        result.push({
          id: `workflow-${w.id}`,
          index: result.length + 1,
          title: w.title,
          description: descriptionForWorkflow(w),
          estimatedTime: estimatedTimeForWorkflow(w),
          href: "/copilot/rutas",
        });
      }
    }

    // Priority 3: fill with top recommendations
    if (result.length < 4 && recommendations.length > 0) {
      for (const rec of recommendations.slice(0, 4 - result.length)) {
        result.push({
          id: `rec-${rec.id}`,
          index: result.length + 1,
          title: rec.title,
          description: rec.rationale,
          estimatedTime: "10–15 min",
          href: rec.cta?.href ?? null,
        });
      }
    }

    return result.slice(0, 4);
  }, [executiveBriefing, recommendations, workflows]);

  const toggleDone = (id: string) => {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && steps.length === 0) return null;
  if (!loading && steps.length === 0) return null;

  const doneCount = steps.filter((s) => doneIds.has(s.id)).length;
  const total = steps.length;

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Ruta del día"
        subtitle="Seguí estos pasos para cerrar las prioridades de hoy."
        action={
          <span className="text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            {doneCount}/{total}
          </span>
        }
      />

      {/* progress bar */}
      <div className="mb-3 h-1 rounded-full bg-[var(--copilot-border)]/30">
        <div
          className="h-1 rounded-full bg-[var(--copilot-accent)] transition-all"
          style={{ width: total > 0 ? `${(doneCount / total) * 100}%` : "0%" }}
        />
      </div>

      <ol className="space-y-2">
        {steps.map((step) => {
          const done = doneIds.has(step.id);
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                done
                  ? "border-emerald-200/60 bg-emerald-50/30 opacity-70"
                  : "border-[var(--copilot-border)]/70 bg-white/80"
              }`}
            >
              <button
                type="button"
                aria-label={done ? "Marcar como pendiente" : "Marcar como hecho"}
                onClick={() => toggleDone(step.id)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                  done
                    ? "border-emerald-400 bg-emerald-400 text-white"
                    : "border-[var(--copilot-border)] bg-white hover:border-[var(--copilot-accent)]"
                }`}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : (
                  <span className="text-[9px] font-bold text-[var(--copilot-ink-muted)]">
                    {step.index}
                  </span>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-[12px] font-semibold leading-snug ${
                    done ? "text-[var(--copilot-ink-muted)] line-through decoration-1" : "text-[var(--copilot-ink)]"
                  }`}
                >
                  {step.title}
                </p>
                {!done ? (
                  <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                    {step.description}
                  </p>
                ) : null}
                {!done ? (
                  <p className="mt-1 text-[10px] text-[var(--copilot-ink-muted)]">
                    Tiempo estimado: {step.estimatedTime}
                  </p>
                ) : null}
              </div>

              {!done && step.href ? (
                <Link
                  href={step.href}
                  className="shrink-0 rounded-lg bg-[var(--copilot-accent)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent)]/20"
                >
                  Ir
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
