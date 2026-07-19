"use client";

import type { ReactNode } from "react";

/**
 * Badges de revisión bancaria. Color NEUTRO (slate/índigo tenue) — nunca rojo ni
 * verde — para distinguir el ámbito histórico/audit sin sugerir aprobado/rechazado.
 */

const NEUTRAL =
  "inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-600/60 dark:bg-slate-700/40 dark:text-slate-300";

const INDIGO =
  "inline-flex items-center gap-1 rounded-md border border-indigo-300/70 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300";

export function HistoricalBadge() {
  return <span className={INDIGO}>Histórico</span>;
}

export function AuditOnlyBadge() {
  return <span className={NEUTRAL}>Audit only</span>;
}

export function NeverAutoBadge() {
  return <span className={NEUTRAL}>Nunca AUTO</span>;
}

export function HistoricalBadges() {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <HistoricalBadge />
      <AuditOnlyBadge />
      <NeverAutoBadge />
    </span>
  );
}

/** Chip de confidence con escala neutra (sin semáforo). */
export function ConfidenceChip({ value }: { value: number }) {
  const tone =
    value >= 50
      ? "border-slate-400/70 bg-slate-200/70 text-slate-700 dark:border-slate-500/60 dark:bg-slate-600/40 dark:text-slate-200"
      : value >= 25
        ? "border-slate-300/70 bg-slate-100 text-slate-600 dark:border-slate-600/60 dark:bg-slate-700/40 dark:text-slate-300"
        : "border-slate-200/70 bg-slate-50 text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-400";
  return (
    <span
      className={`inline-flex min-w-[2.25rem] justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
    >
      {value}
    </span>
  );
}

/** Chip de acción sugerida (Review / Unidentified). Neutro. */
export function ActionChip({ action }: { action: string }) {
  const label = action === "REVIEW" ? "Review" : action === "UNIDENTIFIED" ? "Unidentified" : action;
  return (
    <span className="inline-flex items-center rounded-md border border-slate-300/70 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/40 dark:text-slate-300">
      {label}
    </span>
  );
}

export function ReasonPills({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return <span className="text-[var(--copilot-ink-muted)]">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span
          key={r}
          className="inline-flex items-center rounded border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-1 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]"
        >
          {r.replace(/_/g, " ").toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </dt>
      <dd className="text-sm text-[var(--copilot-ink)] break-words">{children}</dd>
    </div>
  );
}
