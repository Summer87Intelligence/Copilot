"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Brain, Loader2, RefreshCw, Sparkles, Users } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { AIInsightSeverity, AIIntelligenceBundle } from "@/lib/decision-engine/ai/ai-types";

const SEVERITY_CLASS: Record<AIInsightSeverity, string> = {
  low: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]/80 text-[var(--copilot-ink)]",
  medium: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/80 text-[var(--copilot-warning-text-strong)]",
  high: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/80 text-[var(--copilot-warning-text-strong)]",
  critical: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)]/90 text-[var(--copilot-danger-text-strong)]",
};

type BriefingResponse =
  | {
      ok: true;
      intelligence: AIIntelligenceBundle;
      cached: boolean;
      generated_at: string;
      expires_at: string | null;
    }
  | { ok: false; message?: string };

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace menos de un minuto";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

export function OperationalIntelligencePanel() {
  const [intelligence, setIntelligence] = useState<AIIntelligenceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const qs = force ? "?force=true" : "";
      const res = await copilotApiFetch(`/api/copilot/decision-engine/ai-briefing${qs}`);
      const json = (await res.json()) as BriefingResponse;
      if (!json.ok) {
        setError(json.message ?? "No se pudo cargar inteligencia operacional");
        return;
      }
      setIntelligence(json.intelligence);
      setCached(json.cached);
      setGeneratedAt(json.generated_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  if (loading && !intelligence) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-gradient-to-br from-[var(--copilot-surface)] to-[var(--copilot-surface-alt)] px-4 py-4">
        <div className="flex items-center gap-2 text-xs text-[var(--copilot-text-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generando inteligencia operacional…
        </div>
      </div>
    );
  }

  if (error && !intelligence) {
    return (
      <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)]/50 px-4 py-3">
        <p className="text-xs text-[var(--copilot-danger-text-strong)]">{error}</p>
      </div>
    );
  }

  if (!intelligence) return null;

  const { briefing, anomalies, operator_insights, metrics } = intelligence;
  const topAnomalies = anomalies.slice(0, 4);
  const topInsights = operator_insights.slice(0, 3);
  const topPriorities = briefing.operational_priorities.slice(0, 4);

  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-gradient-to-br from-[var(--copilot-surface)] via-[var(--copilot-surface)] to-indigo-50/30 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)]/70 px-4 py-3 bg-[var(--copilot-surface)]/80">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <Brain className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--copilot-text)] tracking-tight">
              Inteligencia operacional
            </h3>
            <p className="text-[10px] text-[var(--copilot-text-muted)] mt-0.5">
              Copiloto determinístico ·{" "}
              {generatedAt ? formatRelativeTime(generatedAt) : "—"}
              {cached && <span className="ml-1 opacity-60">(caché)</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)] shrink-0"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-600 mt-0.5" />
            <p className="text-xs leading-relaxed text-[var(--copilot-text)] font-medium">
              {briefing.summary}
            </p>
          </div>
          {briefing.key_points.length > 0 && (
            <ul className="mt-2 space-y-1 pl-5 list-disc text-[11px] text-[var(--copilot-text-secondary)]">
              {briefing.key_points.map((pt, i) => (
                <li key={i} className="leading-snug">
                  {pt.replace(/^•\s*/, "")}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Anomalías
            </p>
            <p className="text-base font-bold tabular-nums text-[var(--copilot-text)]">
              {metrics.anomalies_detected}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Insights críticos
            </p>
            <p className="text-base font-bold tabular-nums text-[var(--copilot-danger-text-strong)]">
              {metrics.critical_insights}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Alertas carga
            </p>
            <p className="text-base font-bold tabular-nums text-[var(--copilot-warning-text-strong)]">
              {metrics.workload_alerts}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Gen. (ms)
            </p>
            <p className="text-base font-bold tabular-nums text-[var(--copilot-text-muted)]">
              {metrics.generation_ms}
            </p>
          </div>
        </div>

        {briefing.emerging_risks.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Riesgos emergentes
            </p>
            <ul className="space-y-1">
              {briefing.emerging_risks.slice(0, 3).map((r, i) => (
                <li
                  key={i}
                  className="text-[11px] text-[var(--copilot-text-secondary)] rounded border border-rose-100 bg-[var(--copilot-tone-danger-bg)]/50 px-2 py-1"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {topAnomalies.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5">
              Anomalías detectadas
            </p>
            <ul className="space-y-1">
              {topAnomalies.map((a) => (
                <li
                  key={a.id}
                  className={`rounded border px-2 py-1 text-[11px] ${SEVERITY_CLASS[a.severity]}`}
                >
                  <span className="font-semibold">{a.title}</span>
                  <span className="opacity-80"> — {a.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {topPriorities.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5">
              Prioridades recomendadas
            </p>
            <ol className="space-y-1">
              {topPriorities.map((p) => (
                <li
                  key={p.customer_id}
                  className="flex gap-2 text-[11px] rounded border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1"
                >
                  <span className="font-bold text-indigo-600 tabular-nums shrink-0">{p.rank}.</span>
                  <span className="min-w-0">
                    <span className="font-semibold text-[var(--copilot-text)]">{p.customer_name}</span>
                    <span className="text-[var(--copilot-text-muted)]"> — {p.label}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {topInsights.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Insights operadores
            </p>
            <ul className="space-y-1">
              {topInsights.map((ins) => (
                <li
                  key={`${ins.user_id}-${ins.kind}`}
                  className={`rounded border px-2 py-1 text-[11px] ${SEVERITY_CLASS[ins.severity]}`}
                >
                  {ins.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {briefing.workload_warnings.length > 0 && (
          <p className="text-[10px] text-[var(--copilot-warning-text-strong)] bg-[var(--copilot-tone-warning-bg)] border border-[var(--copilot-warning-border)] rounded px-2 py-1">
            {briefing.workload_warnings[0]}
          </p>
        )}
      </div>
    </section>
  );
}
