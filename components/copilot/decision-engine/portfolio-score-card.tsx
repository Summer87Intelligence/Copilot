"use client";

import type { PortfolioScore } from "@/lib/decision-engine/de-types";

type Props = {
  score: PortfolioScore;
};

const BAND_CONFIG = {
  saludable:       { label: "Saludable",        pill: "bg-emerald-50 text-emerald-700 border border-emerald-200", ring: "text-emerald-600" },
  atencion:        { label: "Requiere atención", pill: "bg-amber-50 text-amber-700 border border-amber-200",     ring: "text-amber-500"   },
  riesgo_moderado: { label: "Riesgo moderado",   pill: "bg-orange-50 text-orange-700 border border-orange-200",  ring: "text-orange-500"  },
  critico:         { label: "Crítico",            pill: "bg-rose-50 text-rose-700 border border-rose-200",        ring: "text-rose-600"    },
} as const;

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" :
    value >= 60 ? "bg-amber-400"   :
    value >= 40 ? "bg-orange-400"  :
                  "bg-rose-500";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 text-[var(--copilot-text-muted)]">{label}</span>
      <div className="flex-1 h-1.5 bg-[var(--copilot-surface-alt)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums text-[var(--copilot-text-secondary)] text-xs">{value}</span>
    </div>
  );
}

export function PortfolioScoreCard({ score }: Props) {
  const cfg = BAND_CONFIG[score.band];

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--copilot-text-muted)] uppercase tracking-wide font-medium">Score de cartera</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-4xl font-bold tabular-nums ${cfg.ring}`}>{score.score}</span>
            <span className="text-[var(--copilot-text-muted)] text-sm">/100</span>
          </div>
        </div>
        <span className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cfg.pill}`}>
          {cfg.label}
        </span>
      </div>

      <div className="space-y-2">
        <ScoreBar label="Efectividad" value={score.effectiveness_score} />
        <ScoreBar label="Calidad aging" value={score.aging_score} />
        <ScoreBar label="Concentración" value={score.concentration_score} />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--copilot-border)]">
        <div>
          <p className="text-xs text-[var(--copilot-text-muted)]">Pendiente UYU</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--copilot-text)]">
            {score.total_pending_uyu.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--copilot-text-muted)]">Pendiente USD</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--copilot-text)]">
            {score.total_pending_usd.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--copilot-text-muted)]">Deudores activos</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--copilot-text)]">{score.active_debtors_count}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--copilot-text-muted)]">Efectividad 90d</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--copilot-text)]">{score.effectiveness_pct}%</p>
        </div>
      </div>
    </div>
  );
}
