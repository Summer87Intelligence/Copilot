"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Zap } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type {
  AutomationActionRow,
  AutomationActionType,
  AutomationRunRow,
} from "@/lib/decision-engine/de-types";

const ACTION_BADGE: Record<AutomationActionType, { label: string; className: string }> = {
  create_follow_up: { label: "AUTOMÁTICO", className: "bg-blue-50 text-blue-800 border-blue-200" },
  escalate_case: { label: "ESCALADO", className: "bg-rose-50 text-rose-800 border-rose-200" },
  auto_assign: { label: "AUTO-ASIGNADO", className: "bg-violet-50 text-violet-800 border-violet-200" },
  increase_priority: { label: "SLA", className: "bg-amber-50 text-amber-800 border-amber-200" },
  create_operational_alert: { label: "ALERTA", className: "bg-orange-50 text-orange-800 border-orange-200" },
  mark_overdue: { label: "SLA", className: "bg-amber-50 text-amber-800 border-amber-200" },
  suggest_payment_plan: { label: "AUTOMÁTICO", className: "bg-slate-50 text-slate-700 border-slate-200" },
  trigger_manual_review: { label: "ESCALADO", className: "bg-rose-50 text-rose-800 border-rose-200" },
};

type RunResponse =
  | {
      ok: true;
      run: AutomationRunRow;
      preview: { rule_key: string; action_type: AutomationActionType; customer_id: string; reason: string }[];
      metrics: {
        actions_generated: number;
        actions_executed: number;
        actions_deduped: number;
      };
    }
  | { ok: false; message?: string };

export function OperationalAutomationPanel() {
  const [runs, setRuns] = useState<AutomationRunRow[]>([]);
  const [actions, setActions] = useState<AutomationActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPreview, setLastPreview] = useState<RunResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsRes, actionsRes] = await Promise.all([
        copilotApiFetch("/api/copilot/decision-engine/automation-runs?limit=10"),
        copilotApiFetch("/api/copilot/decision-engine/automation-actions?limit=30"),
      ]);
      const runsJson = (await runsRes.json()) as { ok: boolean; runs?: AutomationRunRow[]; message?: string };
      const actionsJson = (await actionsRes.json()) as {
        ok: boolean;
        actions?: AutomationActionRow[];
        message?: string;
      };
      if (runsJson.ok && runsJson.runs) setRuns(runsJson.runs);
      if (actionsJson.ok && actionsJson.actions) setActions(actionsJson.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar automatizaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAutomation = useCallback(
    async (dryRun: boolean) => {
      setRunning(true);
      setError(null);
      try {
        const res = await copilotApiFetch("/api/copilot/decision-engine/run-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dry_run: dryRun, preview: dryRun }),
        });
        const json = (await res.json()) as RunResponse;
        if (!json.ok) {
          setError(json.message ?? "Error al ejecutar automatización");
          return;
        }
        if (dryRun) setLastPreview(json);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de conexión");
      } finally {
        setRunning(false);
      }
    },
    [load]
  );

  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--copilot-border)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-[var(--copilot-accent)] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--copilot-text)]">
              Automatizaciones operacionales
            </h2>
            <p className="text-[10px] text-[var(--copilot-text-muted)]">
              Reglas determinísticas · dedupe · audit trail
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            disabled={running}
            onClick={() => void runAutomation(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] px-2 py-1 text-[10px] font-medium hover:bg-[var(--copilot-surface-alt)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Dry-run
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => void runAutomation(false)}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--copilot-accent)] px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            <Play className="h-3 w-3" />
            Ejecutar
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {error && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            {error}
          </p>
        )}

        {lastPreview?.ok && (
          <div className="rounded-md border border-dashed border-[var(--copilot-border)] p-2">
            <p className="text-[10px] font-semibold text-[var(--copilot-text-muted)] uppercase">
              Preview dry-run
            </p>
            <p className="text-[11px] mt-1">
              {lastPreview.metrics.actions_generated} acciones ·{" "}
              {lastPreview.metrics.actions_deduped} deduplicadas
            </p>
            <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
              {lastPreview.preview.slice(0, 8).map((p, i) => (
                <li key={`${p.customer_id}-${p.rule_key}-${i}`} className="text-[10px] text-[var(--copilot-text-secondary)] truncate">
                  {p.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-[var(--copilot-text-muted)] flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
          </p>
        ) : (
          <>
            {runs.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase text-[var(--copilot-text-muted)] mb-1">
                  Últimas corridas
                </p>
                <ul className="space-y-1">
                  {runs.slice(0, 5).map((r) => (
                    <li
                      key={r.id}
                      className="text-[10px] flex justify-between gap-2 text-[var(--copilot-text-secondary)]"
                    >
                      <span>
                        {r.dry_run ? "Preview" : "Live"} · {r.actions_generated} gen ·{" "}
                        {r.actions_executed} ejec
                      </span>
                      <span className={r.status === "failed" ? "text-rose-600" : ""}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {actions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase text-[var(--copilot-text-muted)] mb-1">
                  Acciones generadas
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {actions.slice(0, 15).map((a) => {
                    const badge = ACTION_BADGE[a.action_type] ?? ACTION_BADGE.create_follow_up;
                    return (
                      <li
                        key={a.id}
                        className="flex items-start gap-1.5 text-[10px] border-b border-[var(--copilot-border)]/40 pb-1"
                      >
                        <span
                          className={`shrink-0 rounded border px-1 py-px text-[8px] font-bold uppercase ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[var(--copilot-text-secondary)] truncate flex-1">
                          {a.rule_key.replace(/_/g, " ")} · {a.customer_id.slice(0, 8)}…
                          {a.executed ? " ✓" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
