"use client";

export type SummaryMetric = {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "warning" | "danger" | "neutral";
};

const TONE_CLASSES: Record<NonNullable<SummaryMetric["tone"]>, string> = {
  positive: "border-emerald-100 bg-emerald-50/60",
  warning: "border-amber-100 bg-amber-50/60",
  danger: "border-rose-100 bg-rose-50/60",
  neutral: "border-[var(--copilot-border)] bg-white/60",
};

type Props = {
  metrics: SummaryMetric[];
};

export function ReportSummaryCards({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <div
          key={i}
          className={`rounded-xl border px-3 py-2.5 ${TONE_CLASSES[m.tone ?? "neutral"]}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {m.label}
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums text-[var(--copilot-ink)]">
            {m.value}
          </p>
          {m.sub ? (
            <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{m.sub}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
