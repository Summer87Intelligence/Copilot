"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

import type { PulseStatus } from "@/lib/copilot-today-business-pulse";

type StatusStyle = { dot: string; bg: string; border: string; label: string; labelClass: string };

function statusStyle(s: PulseStatus): StatusStyle {
  if (s === "critical")
    return {
      dot: "bg-rose-500",
      bg: "bg-rose-50/50",
      border: "border-rose-200/60",
      label: "Crítico",
      labelClass: "text-rose-700",
    };
  if (s === "attention")
    return {
      dot: "bg-amber-400",
      bg: "bg-amber-50/40",
      border: "border-amber-200/60",
      label: "Requiere atención",
      labelClass: "text-amber-800",
    };
  return {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50/30",
    border: "border-emerald-200/50",
    label: "Saludable",
    labelClass: "text-emerald-700",
  };
}

export function PulseHero({
  status,
  headline,
  subline,
  dataWarning,
  dataStaleNote,
  operacionalHref = "/copilot/operacional",
  onRefresh,
}: {
  status: PulseStatus;
  headline: string;
  subline?: string | null;
  dataWarning: string | null;
  dataStaleNote: string | null;
  operacionalHref?: string;
  onRefresh: () => void;
}) {
  const s = statusStyle(status);
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${s.bg} ${s.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white/60 ${s.dot}`}
            aria-hidden
          />
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${s.labelClass}`}>
              {s.label}
            </p>
            <p className="mt-1 text-base font-semibold leading-snug text-[var(--copilot-ink)] sm:text-lg">
              {headline}
            </p>
            {subline ? (
              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{subline}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] shadow-sm hover:bg-[rgba(44,40,37,0.02)]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Actualizar
        </button>
      </div>

      {dataWarning || dataStaleNote ? (
        <div className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5">
          {dataWarning ? (
            <div className="flex items-start gap-2 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              <span>{dataWarning}</span>
            </div>
          ) : null}
          {dataStaleNote ? (
            <p className={`text-[11px] text-amber-800/90 ${dataWarning ? "mt-1.5" : ""}`}>
              {dataStaleNote}
            </p>
          ) : null}
          <Link
            href={operacionalHref}
            className="mt-2 inline-block text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Ver estado operacional →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function AttentionFollowUpStrip({
  count,
  totalDebtors,
  onClick,
}: {
  count: number;
  totalDebtors: number;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/40 px-4 py-3 text-left transition hover:bg-amber-50/70"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">
          {count} {count === 1 ? "requiere" : "requieren"} seguimiento prioritario
        </p>
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
          Deuda vencida, cobro lento o datos pendientes — no son todos los deudores (
          {totalDebtors} con deuda activa).
        </p>
      </div>
      <span className="text-xs font-semibold text-[var(--copilot-accent)]">Ver lista →</span>
    </button>
  );
}
