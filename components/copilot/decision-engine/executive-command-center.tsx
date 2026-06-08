"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Target,
} from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type {
  ExecutiveDecision,
  ExecutiveDecisionBrief,
  ExecutiveDecisionUrgency,
} from "@/lib/decision-engine/executive-decision-engine";
import { ExecutiveTimeline } from "./executive-timeline";
import type { ExecutiveTimelineEvent } from "@/lib/decision-engine/executive-timeline-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BriefResponse =
  | {
      ok: true;
      brief: ExecutiveDecisionBrief;
      cached: boolean;
      generated_at: string;
      expires_at: string | null;
    }
  | { ok: false; code: string; message: string };

// ---------------------------------------------------------------------------
// Urgency styles
// ---------------------------------------------------------------------------

const URGENCY_LEFT_BORDER: Record<ExecutiveDecisionUrgency, string> = {
  critical: "border-l-rose-500",
  high:     "border-l-amber-500",
  medium:   "border-l-blue-400",
  low:      "border-l-slate-300",
};

const URGENCY_BADGE: Record<ExecutiveDecisionUrgency, string> = {
  critical: "bg-rose-100 text-rose-700 border border-rose-200",
  high:     "bg-amber-100 text-amber-700 border border-amber-200",
  medium:   "bg-blue-50 text-blue-700 border border-blue-200",
  low:      "bg-slate-100 text-slate-600 border border-slate-200",
};

const URGENCY_LABELS: Record<ExecutiveDecisionUrgency, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Medio",
  low:      "Bajo",
};

// ---------------------------------------------------------------------------
// Decision Card
// ---------------------------------------------------------------------------

function DecisionCard({
  decision,
  onGoToQueue,
}: {
  decision: ExecutiveDecision;
  onGoToClient?: (id: string) => void;
  onGoToQueue?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] border-l-[3px] ${URGENCY_LEFT_BORDER[decision.urgency]} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`inline-flex rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${URGENCY_BADGE[decision.urgency]}`}
              >
                {URGENCY_LABELS[decision.urgency]}
              </span>
              <span className="text-[9px] text-[var(--copilot-text-muted)] font-medium uppercase tracking-wide">
                #{decision.rank}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-[var(--copilot-text)] leading-snug">
              {decision.title}
            </h4>
          </div>
        </div>

        {/* Reason */}
        <p className="mt-1 text-[11px] text-[var(--copilot-text-secondary)] leading-snug">
          {decision.reason}
        </p>

        {/* Recommended action */}
        <div className="mt-2 flex items-start gap-1.5">
          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-[var(--copilot-accent)]" />
          <p className="text-[11px] font-medium text-[var(--copilot-text)] leading-snug">
            {decision.recommended_action}
          </p>
        </div>

        {/* Impact row */}
        {(decision.expected_impact.cash_recovery != null ||
          decision.expected_impact.risk_reduction != null) && (
          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-[var(--copilot-text-muted)]">
            {decision.expected_impact.cash_recovery != null && (
              <span className="flex items-center gap-1">
                <span className="font-medium text-emerald-700">
                  +{decision.expected_impact.cash_recovery.toLocaleString("es-UY")}
                </span>
                <span>recuperación estimada</span>
              </span>
            )}
            {decision.expected_impact.risk_reduction != null && (
              <span>
                Reducción de riesgo:{" "}
                <span className="font-medium">{decision.expected_impact.risk_reduction}</span>
              </span>
            )}
            {decision.expected_impact.sla_improvement != null && (
              <span>SLA: {decision.expected_impact.sla_improvement}</span>
            )}
          </div>
        )}

        {/* Client link if available */}
        {decision.linked_customer_id && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--copilot-text-muted)]">
            <Building2 className="h-2.5 w-2.5 shrink-0" />
            <span className="font-medium text-[var(--copilot-text-secondary)]">
              {decision.linked_customer_name}
            </span>
          </div>
        )}
      </div>

      {/* Expandable evidence */}
      {decision.evidence.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)] bg-[var(--copilot-surface-alt)]/60 border-t border-[var(--copilot-border)]/60 transition-colors"
          >
            <span>{expanded ? "Ocultar evidencia" : "Ver evidencia"}</span>
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {expanded && (
            <ul className="px-3 pb-2.5 space-y-0.5 border-t border-[var(--copilot-border)]/40 pt-1.5">
              {decision.evidence.map((ev, i) => (
                <li
                  key={i}
                  className="text-[10px] text-[var(--copilot-text-secondary)] before:content-['·'] before:mr-1"
                >
                  {ev}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* CTAs */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--copilot-border)]/60 bg-[var(--copilot-surface-alt)]/40">
        {decision.linked_customer_id && (
          <Link
            href={`/copilot/clientes/${encodeURIComponent(decision.linked_customer_id)}`}
            className="text-[10px] font-medium text-[var(--copilot-accent)] hover:underline"
          >
            Ver cliente
          </Link>
        )}
        {onGoToQueue && (
          <button
            type="button"
            onClick={onGoToQueue}
            className="text-[10px] font-medium text-[var(--copilot-text-secondary)] hover:text-[var(--copilot-text)]"
          >
            Ir a cola
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  timelineEvents?: ExecutiveTimelineEvent[];
  onGoToQueue?: () => void;
};

export function ExecutiveCommandCenter({ timelineEvents = [], onGoToQueue }: Props) {
  const [brief, setBrief] = useState<ExecutiveDecisionBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchBrief = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = force
        ? "/api/copilot/decision-engine/executive-brief?force=true"
        : "/api/copilot/decision-engine/executive-brief";
      const res = await copilotApiFetch(url);
      const json = (await res.json()) as BriefResponse;
      if (!json.ok) {
        setError(json.message ?? "Error al cargar el brief ejecutivo");
        return;
      }
      setBrief(json.brief);
      setCached(json.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBrief(false);
  }, [fetchBrief]);

  if (loading && !brief) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-4">
        <div className="flex items-center gap-2 text-[var(--copilot-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Analizando prioridades ejecutivas…</span>
        </div>
      </div>
    );
  }

  if (error && !brief) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">No se pudo cargar el brief ejecutivo</p>
          <button
            type="button"
            onClick={() => void fetchBrief(false)}
            className="mt-1 text-xs font-medium text-amber-700 hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!brief) return null;

  const visibleDecisions = showAll ? brief.top_decisions : brief.top_decisions.slice(0, 3);
  const hiddenCount = Math.max(0, brief.top_decisions.length - 3);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-[var(--copilot-border)]/60">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--copilot-accent)] shrink-0" />
              <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
                Prioridades ejecutivas de hoy
              </h3>
            </div>
            <p className="mt-1 text-[11px] text-[var(--copilot-text-secondary)] leading-snug">
              {brief.executive_summary}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {brief.confidence_pct < 80 && (
              <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-px font-medium">
                Confianza {brief.confidence_pct}%
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchBrief(true)}
              disabled={loading}
              className="text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)] transition-colors"
              title="Recalcular"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Decisions */}
      <div className="p-3 space-y-2">
        {visibleDecisions.length === 0 ? (
          <p className="text-[11px] text-[var(--copilot-text-muted)] text-center py-2">
            No hay decisiones urgentes en este momento.
          </p>
        ) : (
          visibleDecisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              onGoToQueue={onGoToQueue}
            />
          ))
        )}

        {hiddenCount > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full text-center text-[11px] font-medium text-[var(--copilot-accent)] hover:underline py-1"
          >
            Ver {hiddenCount} decisión(es) más
          </button>
        )}

        {showAll && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="w-full text-center text-[11px] font-medium text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)] py-1"
          >
            Ver menos
          </button>
        )}
      </div>

      {/* Footer: impact + focus */}
      <div className="border-t border-[var(--copilot-border)]/60 px-4 py-2.5 bg-[var(--copilot-surface-alt)]/30">
        <div className="space-y-0.5">
          <p className="text-[10px] text-[var(--copilot-text-muted)]">
            <span className="font-medium text-[var(--copilot-text-secondary)]">Impacto esperado:</span>{" "}
            {brief.expected_business_impact}
          </p>
          {cached && (
            <p className="text-[9px] text-[var(--copilot-text-muted)] opacity-60">
              Desde caché · TTL 15 min
            </p>
          )}
        </div>
      </div>

      {/* Timeline */}
      {timelineEvents.length > 0 && (
        <div className="px-4 pb-3 border-t border-[var(--copilot-border)]/40">
          <ExecutiveTimeline events={timelineEvents} />
        </div>
      )}
    </div>
  );
}
