"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActivitySquare,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Gauge,
  RefreshCw,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type {
  ActionEffectivenessRow,
  AutomationNoiseLevel,
  AutomationRuleEffectivenessRow,
  ForecastCalibrationSegment,
  OperatorEffectivenessRow,
  StrategyRecommendation,
  StrategyRecommendationCategory,
  StrategyRecommendationConfidence,
  StrategicLearningBundle,
} from "@/lib/decision-engine/learning/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIDENCE_CLASS: Record<StrategyRecommendationConfidence, string> = {
  high:   "bg-emerald-100 text-emerald-800 border border-emerald-300",
  medium: "bg-amber-100 text-amber-800 border border-amber-200",
  low:    "bg-slate-100 text-slate-700 border border-slate-200",
};

const CONFIDENCE_LABELS: Record<StrategyRecommendationConfidence, string> = {
  high:   "Alta",
  medium: "Media",
  low:    "Baja",
};

const CATEGORY_ICONS: Record<StrategyRecommendationCategory, React.ReactNode> = {
  action:     <Target className="h-3.5 w-3.5" />,
  operator:   <Users className="h-3.5 w-3.5" />,
  automation: <Zap className="h-3.5 w-3.5" />,
  forecast:   <ActivitySquare className="h-3.5 w-3.5" />,
  portfolio:  <Brain className="h-3.5 w-3.5" />,
};

const NOISE_CLASS: Record<AutomationNoiseLevel, string> = {
  low:      "bg-emerald-50 text-emerald-800 border-emerald-200",
  medium:   "bg-amber-50 text-amber-800 border-amber-200",
  high:     "bg-orange-50 text-orange-800 border-orange-200",
  critical: "bg-rose-50 text-rose-800 border-rose-200",
};

const NOISE_LABELS: Record<AutomationNoiseLevel, string> = {
  low:      "Eficiente",
  medium:   "Moderado",
  high:     "Ruidoso",
  critical: "Crítico",
};

function calibrationColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-rose-600";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-[var(--copilot-text-muted)]">{icon}</span>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
        {title}
      </h4>
    </div>
  );
}

function ActionEffectivenessTable({ rows }: { rows: ActionEffectivenessRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--copilot-text-muted)]">Sin acciones con datos suficientes.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--copilot-border)]">
            <th className="text-left font-medium text-[var(--copilot-text-muted)] pb-1 pr-3">Acción</th>
            <th className="text-right font-medium text-[var(--copilot-text-muted)] pb-1 pr-3">Total</th>
            <th className="text-right font-medium text-[var(--copilot-text-muted)] pb-1 pr-3">Efectividad</th>
            <th className="text-right font-medium text-[var(--copilot-text-muted)] pb-1">Días prom.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.action_type}
              className="border-b border-[var(--copilot-border)]/40 last:border-0"
            >
              <td className="py-1 pr-3 font-medium text-[var(--copilot-text)]">{row.action_label}</td>
              <td className="py-1 pr-3 text-right text-[var(--copilot-text-muted)]">{row.total_actions}</td>
              <td className="py-1 pr-3 text-right">
                <span
                  className={
                    row.effectiveness_pct >= 50
                      ? "text-emerald-600 font-semibold"
                      : row.effectiveness_pct >= 25
                      ? "text-amber-600 font-semibold"
                      : "text-rose-600 font-semibold"
                  }
                >
                  {row.effectiveness_pct}%
                </span>
              </td>
              <td className="py-1 text-right text-[var(--copilot-text-muted)]">
                {row.avg_days_to_payment != null ? `${row.avg_days_to_payment}d` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperatorEffectivenessTable({ rows }: { rows: OperatorEffectivenessRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--copilot-text-muted)]">Sin operadores con datos suficientes.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--copilot-border)]">
            <th className="text-left font-medium text-[var(--copilot-text-muted)] pb-1 pr-3">Operador</th>
            <th className="text-right font-medium text-[var(--copilot-text-muted)] pb-1 pr-3">Casos</th>
            <th className="text-right font-medium text-[var(--copilot-text-muted)] pb-1 pr-3">Recuperados</th>
            <th className="text-right font-medium text-[var(--copilot-text-muted)] pb-1">SLA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.user_id}
              className="border-b border-[var(--copilot-border)]/40 last:border-0"
            >
              <td className="py-1 pr-3 font-medium text-[var(--copilot-text)]">{row.display_name}</td>
              <td className="py-1 pr-3 text-right text-[var(--copilot-text-muted)]">{row.total_cases_handled}</td>
              <td className="py-1 pr-3 text-right">
                <span className={row.recovery_rate_pct >= 50 ? "text-emerald-600 font-semibold" : "text-[var(--copilot-text-muted)]"}>
                  {row.recovery_rate_pct}%
                </span>
              </td>
              <td className="py-1 text-right">
                <span className={row.sla_compliance_pct < 80 ? "text-rose-600 font-semibold" : "text-[var(--copilot-text-muted)]"}>
                  {Math.round(row.sla_compliance_pct)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AutomationRuleRow({ rule }: { rule: AutomationRuleEffectivenessRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--copilot-border)]/40 last:border-0 py-1.5">
      <button
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[11px] font-medium text-[var(--copilot-text)] truncate flex-1">
          {rule.rule_label}
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${NOISE_CLASS[rule.noise_level]}`}
        >
          {NOISE_LABELS[rule.noise_level]}
        </span>
        <span className="text-[var(--copilot-text-muted)]">
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 pl-1 space-y-0.5 text-[10px] text-[var(--copilot-text-muted)]">
          <p>Disparadas: {rule.total_triggered} — Ejecutadas: {rule.executed_count} — Dedup: {Math.round(rule.dedupe_ratio * 100)}%</p>
          <p className="italic">{rule.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function CalibrationSegmentRow({ seg }: { seg: ForecastCalibrationSegment }) {
  const deltaLabel = seg.delta_pct > 0 ? `+${seg.delta_pct}pp` : `${seg.delta_pct}pp`;
  const deltaClass =
    seg.direction === "accurate"
      ? "text-emerald-600"
      : seg.direction === "overestimated"
      ? "text-rose-600"
      : "text-amber-600";
  return (
    <div className="flex items-center gap-2 py-1 border-b border-[var(--copilot-border)]/40 last:border-0 text-[11px]">
      <span className="flex-1 text-[var(--copilot-text)] truncate">{seg.segment}</span>
      <span className="text-[var(--copilot-text-muted)]">{seg.actual_pct}% real</span>
      <span className={`font-semibold ${deltaClass}`}>{deltaLabel}</span>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: StrategyRecommendation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-2.5">
      <button
        className="w-full flex items-start gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mt-0.5 text-[var(--copilot-text-muted)] shrink-0">
          {CATEGORY_ICONS[rec.category]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[var(--copilot-text)] leading-tight">
            {rec.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${CONFIDENCE_CLASS[rec.confidence]}`}
            >
              Confianza {CONFIDENCE_LABELS[rec.confidence]}
            </span>
            {rec.actionable && (
              <span className="text-[9px] text-emerald-600 font-medium">Accionable</span>
            )}
          </div>
        </div>
        <span className="text-[var(--copilot-text-muted)] shrink-0">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div className="mt-2 pl-5 space-y-1">
          <p className="text-[11px] text-[var(--copilot-text-muted)]">{rec.reason}</p>
          {rec.evidence.length > 0 && (
            <ul className="space-y-0.5">
              {rec.evidence.map((e, i) => (
                <li
                  key={i}
                  className="text-[10px] text-[var(--copilot-text-muted)] flex items-start gap-1"
                >
                  <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-[var(--copilot-text-muted)]/50" />
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type Props = {
  workspaceCompanyId?: string;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: StrategicLearningBundle; cached: boolean }
  | { status: "error"; message: string };

export function StrategicLearningPanel(props: Props) {
  void props;
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [detectingOutcomes, setDetectingOutcomes] = useState(false);
  const [detectResult, setDetectResult] = useState<{ count: number; inserted: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"recommendations" | "actions" | "operators" | "automation" | "calibration">("recommendations");

  const load = useCallback(async (force = false) => {
    setState({ status: "loading" });
    try {
      const url = `/api/copilot/decision-engine/strategic-learning${force ? "?force=true" : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setState({ status: "loaded", data: json.data, cached: json.cached });
      } else {
        setState({ status: "error", message: json.message ?? "Error al cargar datos." });
      }
    } catch {
      setState({ status: "error", message: "Error de red al cargar aprendizaje estratégico." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDetectOutcomes = async () => {
    setDetectingOutcomes(true);
    setDetectResult(null);
    try {
      const res = await fetch("/api/copilot/decision-engine/detect-outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: false }),
      });
      const json = await res.json();
      if (json.ok) {
        setDetectResult({ count: json.detected_count, inserted: json.inserted_count });
        // Reload with fresh data
        await load(true);
      }
    } catch {
      // silent fail
    } finally {
      setDetectingOutcomes(false);
    }
  };

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--copilot-text-muted)]">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        <span className="text-xs">Analizando aprendizaje estratégico…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2 text-rose-600 text-xs py-4">
        <AlertTriangle className="h-4 w-4" />
        <span>{state.message}</span>
      </div>
    );
  }

  const { data } = state;
  const { action_effectiveness, operator_effectiveness, automation_effectiveness, forecast_calibration, strategy_recommendations, metrics, outcomes_total } = data;

  const TABS = [
    { id: "recommendations" as const, label: "Recomendaciones" },
    { id: "actions" as const, label: "Acciones" },
    { id: "operators" as const, label: "Operadores" },
    { id: "automation" as const, label: "Automatización" },
    { id: "calibration" as const, label: "Calibración" },
  ];

  return (
    <div className="space-y-3">
      {/* Header KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">Outcomes</p>
          <p className="text-lg font-bold text-[var(--copilot-text)] tabular-nums">{outcomes_total}</p>
          <p className="text-[9px] text-[var(--copilot-text-muted)]">{metrics.positive_outcomes} positivos</p>
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">Calibración</p>
          <p className={`text-lg font-bold tabular-nums ${calibrationColor(metrics.calibration_score)}`}>
            {metrics.calibration_score}
          </p>
          <p className="text-[9px] text-[var(--copilot-text-muted)]">/ 100</p>
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">Reglas ruidosas</p>
          <p className={`text-lg font-bold tabular-nums ${metrics.noisy_rules > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {metrics.noisy_rules}
          </p>
          <p className="text-[9px] text-[var(--copilot-text-muted)]">de {automation_effectiveness.total_rules_evaluated}</p>
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">Recomend.</p>
          <p className="text-lg font-bold text-[var(--copilot-text)] tabular-nums">{strategy_recommendations.length}</p>
          <p className="text-[9px] text-[var(--copilot-text-muted)]">estratégicas</p>
        </div>
      </div>

      {/* Detect outcomes bar */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-[var(--copilot-text-muted)]" />
          <span className="text-[11px] text-[var(--copilot-text-muted)]">
            {detectResult
              ? `${detectResult.count} detectados, ${detectResult.inserted} nuevos registrados`
              : "Detectar y registrar outcomes desde datos actuales"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {detectResult && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <button
            onClick={handleDetectOutcomes}
            disabled={detectingOutcomes}
            className="text-[10px] font-semibold px-2 py-1 rounded border border-[var(--copilot-border)] bg-[var(--copilot-surface)] hover:bg-[var(--copilot-surface-hover)] text-[var(--copilot-text)] disabled:opacity-50 flex items-center gap-1"
          >
            {detectingOutcomes && <RefreshCw className="h-3 w-3 animate-spin" />}
            {detectingOutcomes ? "Detectando…" : "Detectar outcomes"}
          </button>
          <button
            onClick={() => load(true)}
            className="p-1 rounded border border-[var(--copilot-border)] text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)] hover:bg-[var(--copilot-surface-hover)]"
            title="Recalcular"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-[var(--copilot-border)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-[10px] font-medium px-2.5 py-1.5 border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[var(--copilot-accent)] text-[var(--copilot-accent)]"
                : "border-transparent text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "recommendations" && (
          <div className="space-y-2">
            {strategy_recommendations.length === 0 ? (
              <p className="text-xs text-[var(--copilot-text-muted)] py-2">
                Sin recomendaciones estratégicas detectadas.
              </p>
            ) : (
              strategy_recommendations.map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))
            )}
          </div>
        )}

        {activeTab === "actions" && (
          <div>
            <SectionHeader icon={<Target className="h-3.5 w-3.5" />} title="Efectividad por acción" />
            <p className="text-[10px] text-[var(--copilot-text-muted)] mb-2 italic">
              {action_effectiveness.insight}
            </p>
            <ActionEffectivenessTable rows={action_effectiveness.by_action_type} />
            <p className="text-[9px] text-[var(--copilot-text-muted)] mt-1">
              Fuente: {action_effectiveness.data_source === "outcomes" ? "outcomes formales" : action_effectiveness.data_source === "proxy" ? "métricas proxy" : "datos insuficientes"}
            </p>
          </div>
        )}

        {activeTab === "operators" && (
          <div>
            <SectionHeader icon={<Users className="h-3.5 w-3.5" />} title="Efectividad por operador" />
            <p className="text-[10px] text-[var(--copilot-text-muted)] mb-2 italic">
              {operator_effectiveness.insight}
            </p>
            <OperatorEffectivenessTable rows={operator_effectiveness.by_operator} />
          </div>
        )}

        {activeTab === "automation" && (
          <div>
            <SectionHeader icon={<Zap className="h-3.5 w-3.5" />} title="Ruido por regla de automatización" />
            <p className="text-[10px] text-[var(--copilot-text-muted)] mb-2 italic">
              {automation_effectiveness.insight}
            </p>
            {automation_effectiveness.all_rules.length === 0 ? (
              <p className="text-xs text-[var(--copilot-text-muted)]">Sin datos de automatización.</p>
            ) : (
              <div>
                {automation_effectiveness.all_rules.map((rule) => (
                  <AutomationRuleRow key={rule.rule_key} rule={rule} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "calibration" && (
          <div>
            <SectionHeader icon={<Gauge className="h-3.5 w-3.5" />} title="Calibración del modelo predictivo" />
            <p className="text-[10px] text-[var(--copilot-text-muted)] mb-2 italic">
              {forecast_calibration.insight}
            </p>
            {forecast_calibration.all_segments.length === 0 ? (
              <p className="text-xs text-[var(--copilot-text-muted)]">Sin segmentos evaluados.</p>
            ) : (
              <div className="mb-2">
                {forecast_calibration.all_segments.map((seg) => (
                  <CalibrationSegmentRow key={seg.segment} seg={seg} />
                ))}
              </div>
            )}
            {forecast_calibration.recommended_weight_adjustments.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold text-[var(--copilot-text-muted)] mb-1">Ajustes sugeridos:</p>
                <ul className="space-y-0.5">
                  {forecast_calibration.recommended_weight_adjustments.map((adj, i) => (
                    <li key={i} className="text-[10px] text-[var(--copilot-text-muted)] flex items-start gap-1">
                      <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                      {adj}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {state.cached && (
        <p className="text-[9px] text-[var(--copilot-text-muted)] text-right">
          Datos en caché · {data.expires_at ? `expira ${new Date(data.expires_at).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
      )}
    </div>
  );
}
