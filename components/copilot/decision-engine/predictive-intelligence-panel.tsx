"use client";

import { useCallback, useEffect, useState } from "react";
import { LineChart, Loader2, RefreshCw, Target, TrendingDown, Users } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { PredictiveBundle } from "@/lib/decision-engine/predictive/predictive-types";
import type {
  DeteriorationBand,
  RecoveryLikelihoodBand,
  SLAStressBand,
} from "@/lib/decision-engine/predictive/predictive-types";

const DETERIORATION_CLASS: Record<DeteriorationBand, string> = {
  stable: "bg-emerald-50 text-emerald-800 border-emerald-200",
  watch: "bg-amber-50 text-amber-800 border-amber-200",
  deteriorating: "bg-orange-50 text-orange-800 border-orange-200",
  severe: "bg-rose-50 text-rose-800 border-rose-200",
};

const SLA_CLASS: Record<SLAStressBand, string> = {
  normal: "bg-emerald-50 text-emerald-800 border-emerald-200",
  elevated: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-orange-50 text-orange-800 border-orange-200",
  critical: "bg-rose-50 text-rose-800 border-rose-200",
};

const LIKELIHOOD_CLASS: Record<RecoveryLikelihoodBand, string> = {
  high: "text-emerald-700",
  medium: "text-amber-700",
  low: "text-orange-700",
  very_low: "text-rose-700",
};

type PredictiveResponse =
  | {
      ok: true;
      predictive: PredictiveBundle;
      cached: boolean;
      generated_at: string;
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

export function PredictiveIntelligencePanel() {
  const [predictive, setPredictive] = useState<PredictiveBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const qs = force ? "?force=true" : "";
      const res = await copilotApiFetch(`/api/copilot/decision-engine/predictive${qs}`);
      const json = (await res.json()) as PredictiveResponse;
      if (!json.ok) {
        setError(json.message ?? "No se pudo cargar predicciones");
        return;
      }
      setPredictive(json.predictive);
      setCached(json.cached);
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

  if (loading && !predictive) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-4 py-4">
        <div className="flex items-center gap-2 text-xs text-[var(--copilot-text-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Calculando forecast operativo…
        </div>
      </div>
    );
  }

  if (error && !predictive) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3">
        <p className="text-xs text-rose-800">{error}</p>
      </div>
    );
  }

  if (!predictive) return null;

  const pf30 = predictive.portfolio_forecasts.find((f) => f.horizon_days === 30);
  const sla7 = predictive.sla_forecasts.find((f) => f.horizon_days === 7);
  const topOpps = predictive.recovery_opportunities.slice(0, 4);
  const atRiskOps = predictive.operator_load_forecasts
    .filter((o) => o.overload_probability_pct >= 55)
    .slice(0, 3);

  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-gradient-to-br from-[var(--copilot-surface)] to-teal-50/25 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)]/70 px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
            <LineChart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
              Forecast predictivo
            </h3>
            <p className="text-[10px] text-[var(--copilot-text-muted)] mt-0.5">
              Determinístico · {formatRelativeTime(predictive.generated_at)}
              {cached && <span className="ml-1 opacity-60">(caché)</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Recalculando…" : "Recalcular"}
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-xs leading-relaxed text-[var(--copilot-text)] font-medium">
          {predictive.executive_prediction_summary}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Recup. media
            </p>
            <p className="text-base font-bold tabular-nums text-teal-700">
              {predictive.metrics.avg_recovery_likelihood_pct}%
            </p>
          </div>
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Críticos proj.
            </p>
            <p className="text-base font-bold tabular-nums text-rose-700">
              {predictive.metrics.predicted_critical_cases}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              SLA proj. 7d
            </p>
            <p className="text-base font-bold tabular-nums text-amber-700">
              {predictive.metrics.projected_sla_breaches_7d}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2 py-1.5">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Oportunidades
            </p>
            <p className="text-base font-bold tabular-nums text-[var(--copilot-text)]">
              {predictive.metrics.recovery_opportunities_count}
            </p>
          </div>
        </div>

        {pf30 && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Riesgo futuro cartera (30d)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${DETERIORATION_CLASS[pf30.deterioration_band]}`}
              >
                {pf30.deterioration_band}
              </span>
              <span className="text-[11px] text-[var(--copilot-text-secondary)]">
                +{pf30.projected_risk_delta_pct}% riesgo · ~$
                {pf30.projected_overdue_amount.toLocaleString("es-UY")} vencido proj.
              </span>
            </div>
            {pf30.drivers[0] && (
              <p className="text-[10px] text-[var(--copilot-text-muted)] mt-1">{pf30.drivers[0]}</p>
            )}
          </div>
        )}

        {sla7 && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5">
              SLA stress (7d)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${SLA_CLASS[sla7.stress_band]}`}
              >
                {sla7.stress_band}
              </span>
              <span className="text-[11px] text-[var(--copilot-text-secondary)]">
                ~{sla7.projected_sla_breaches} incumplimientos proyectados
              </span>
            </div>
            {sla7.recommended_actions[0] && (
              <p className="text-[10px] text-[var(--copilot-text-muted)] mt-1">
                {sla7.recommended_actions[0]}
              </p>
            )}
          </div>
        )}

        {topOpps.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Recuperación rápida
            </p>
            <ul className="space-y-1">
              {topOpps.map((o) => (
                <li
                  key={o.customer_id}
                  className="rounded border border-teal-100 bg-teal-50/50 px-2 py-1 text-[11px] text-[var(--copilot-text-secondary)]"
                >
                  <span className="font-semibold text-[var(--copilot-text)]">{o.customer_name}</span>
                  {" — "}
                  {o.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {atRiskOps.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Operadores en riesgo de sobrecarga
            </p>
            <ul className="space-y-1">
              {atRiskOps.map((o) => (
                <li
                  key={o.user_id}
                  className="rounded border border-amber-100 bg-amber-50/50 px-2 py-1 text-[11px]"
                >
                  <span className="font-semibold">{o.display_name}</span>
                  <span className="text-[var(--copilot-text-muted)]">
                    {" "}
                    — {o.overload_probability_pct}% prob. sobrecarga · {o.projected_critical_cases}{" "}
                    críticos proj.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {predictive.recovery_likelihoods.length > 0 && (
          <p className="text-[10px] text-[var(--copilot-text-muted)]">
            Bandas de recuperación en cola:{" "}
            {(["high", "medium", "low", "very_low"] as const)
              .map((b) => {
                const n = predictive.recovery_likelihoods.filter((r) => r.band === b).length;
                return n > 0 ? (
                  <span key={b} className={`font-semibold ${LIKELIHOOD_CLASS[b]}`}>
                    {n} {b}{" "}
                  </span>
                ) : null;
              })
              .filter(Boolean)}
          </p>
        )}
      </div>
    </section>
  );
}
