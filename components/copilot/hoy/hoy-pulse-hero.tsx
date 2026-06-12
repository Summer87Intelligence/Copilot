"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import type { PulseStatus } from "@/lib/copilot-today-business-pulse";

type StatusStyle = { dot: string; bg: string; border: string; label: string; labelClass: string };

function statusStyle(s: PulseStatus): StatusStyle {
  // Hero neutro (bg de card normal) con dot semáforo coherente con el resto del producto.
  if (s === "critical")
    return {
      dot: "bg-[var(--copilot-status-critical-dot)]",
      bg: "bg-[var(--copilot-card-bg)]",
      border: "border-[var(--copilot-danger-border)]/40",
      label: "Atención urgente",
      labelClass: "text-[var(--copilot-danger-text)]",
    };
  if (s === "attention")
    return {
      dot: "bg-[var(--copilot-status-warn-dot)]",
      bg: "bg-[var(--copilot-card-bg)]",
      border: "border-[var(--copilot-border)]",
      label: "Requiere atención",
      labelClass: "text-[var(--copilot-warning-text-strong)]",
    };
  return {
    dot: "bg-[var(--copilot-status-ok-dot)]",
    bg: "bg-[var(--copilot-card-bg)]",
    border: "border-[var(--copilot-border)]",
    label: "Saludable",
    labelClass: "text-[var(--copilot-success-text)]",
  };
}

export function PulseHero({
  status,
  headline,
  subline,
  dataNotice,
  operacionalHref = "/copilot/alertas",
  onRefresh,
}: {
  status: PulseStatus;
  headline: string;
  subline?: string | null;
  /** Aviso compacto; no bloquea la lectura financiera. */
  dataNotice?: string | null;
  operacionalHref?: string;
  onRefresh: () => void;
}) {
  const s = statusStyle(status);
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${s.bg} ${s.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white/80 ${s.dot}`}
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
          className="flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] shadow-sm hover:bg-[rgba(44,40,37,0.02)]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Actualizar
        </button>
      </div>

      {dataNotice ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {dataNotice}{" "}
          <Link href={operacionalHref} className="font-semibold text-[var(--copilot-accent)] hover:underline">
            Ver alertas
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function AttentionFollowUpStrip({
  attentionCount,
  debtorTotal,
  onClick,
}: {
  attentionCount: number;
  debtorTotal: number;
  onClick: () => void;
}) {
  if (attentionCount <= 0) return null;
  const total = debtorTotal > 0 ? debtorTotal : attentionCount;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3 text-left shadow-sm transition hover:bg-[rgba(44,40,37,0.02)]"
    >
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
        {attentionCount} de {total} deudores tienen atraso o señales de demora
      </p>
      <span className="shrink-0 text-xs font-semibold text-[var(--copilot-accent)]">
        {HOY_COPY.attentionStripCta}
      </span>
    </button>
  );
}
