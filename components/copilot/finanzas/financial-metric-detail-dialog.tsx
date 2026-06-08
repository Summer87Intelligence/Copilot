"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { CopilotGhostLink } from "@/components/copilot/copilot-ui";
import type { FinancialMetricDetail } from "@/lib/copilot-financial-panorama-details";

/** Altura de CopilotEnvironmentHealthStrip — drawer arranca debajo. */
const COPILOT_TOPBAR_HEIGHT_PX = 56;

function rowToneClass(tone?: FinancialMetricDetail["rows"][number]["tone"]): string {
  if (tone === "positive") return "text-emerald-800";
  if (tone === "warning") return "text-amber-900";
  if (tone === "danger") return "text-rose-800";
  return "text-[var(--copilot-ink)]";
}

export function FinancialMetricDetailDialog({
  detail,
  isOpen,
  onClose,
}: {
  detail: FinancialMetricDetail | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen || !detail) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-[rgba(19,23,22,0.32)]"
        style={{ top: COPILOT_TOPBAR_HEIGHT_PX }}
      />
      <aside
        className="fixed right-0 z-[70] flex w-full max-w-lg flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl"
        style={{
          top: COPILOT_TOPBAR_HEIGHT_PX,
          height: `calc(100dvh - ${COPILOT_TOPBAR_HEIGHT_PX}px)`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-metric-detail-title"
      >
        <div className="shrink-0 border-b border-[var(--copilot-border)] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <h3 id="financial-metric-detail-title" className="text-lg font-semibold text-[var(--copilot-ink)]">
                {detail.title}
              </h3>
              <p className="text-sm text-[var(--copilot-ink-muted)]">{detail.subtitle}</p>
              {detail.periodLabel ? (
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  Período: {detail.periodLabel}
                  {detail.currency ? ` · Moneda: ${detail.currency}` : ""}
                </p>
              ) : detail.currency ? (
                <p className="text-xs text-[var(--copilot-ink-muted)]">Moneda: {detail.currency}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-border)] text-[var(--copilot-ink-muted)] hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {detail.formula ? (
            <div className="mb-4 rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Fórmula
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--copilot-ink)]">{detail.formula}</p>
            </div>
          ) : null}

          {detail.explanation ? (
            <p className="mb-4 text-sm leading-relaxed text-[var(--copilot-ink)]">{detail.explanation}</p>
          ) : null}

          <div className="mb-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Composición
            </p>
            <dl className="space-y-3">
              {detail.rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 text-sm">
                  <dt className="text-[var(--copilot-ink-muted)]">{row.label}</dt>
                  <dd className={`text-right font-medium tabular-nums ${rowToneClass(row.tone)}`}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Fuente del dato
            </p>
            <p className="mt-1 text-sm text-[var(--copilot-ink)]">{detail.sourceLabel}</p>
            {detail.updatedAtLabel ? (
              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                Última actualización: {detail.updatedAtLabel}
              </p>
            ) : null}
          </div>

          {detail.footnote ? (
            <p className="mt-4 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">{detail.footnote}</p>
          ) : null}
        </div>

        {detail.cta ? (
          <div className="shrink-0 border-t border-[var(--copilot-border)] bg-[var(--copilot-card)] px-5 py-4 sm:px-6">
            <CopilotGhostLink href={detail.cta.href} className="w-full justify-center">
              {detail.cta.label}
            </CopilotGhostLink>
          </div>
        ) : null}
      </aside>
    </>
  );
}
