"use client";

import { CopilotGhostLink } from "@/components/copilot/copilot-ui";
import type { FinancialMetricDetail } from "@/lib/copilot-financial-panorama-details";

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
  if (!isOpen || !detail) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-[rgba(19,23,22,0.28)]"
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl">
        <div className="border-b border-[var(--copilot-border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">{detail.title}</h3>
              <p className="text-sm text-[var(--copilot-ink-muted)]">{detail.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--copilot-ink-muted)] hover:bg-slate-100"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {detail.formula ? (
            <div className="mb-5 rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Fórmula
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--copilot-ink)]">{detail.formula}</p>
            </div>
          ) : null}

          <dl className="space-y-3 border-b border-[var(--copilot-border)] pb-5">
            {detail.rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-4 text-sm">
                <dt className="text-[var(--copilot-ink-muted)]">{row.label}</dt>
                <dd className={`text-right font-medium tabular-nums ${rowToneClass(row.tone)}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Fuente del dato
            </p>
            <p className="mt-1 text-sm text-[var(--copilot-ink)]">{detail.sourceLabel}</p>
          </div>
        </div>

        {detail.cta ? (
          <div className="border-t border-[var(--copilot-border)] px-6 py-4">
            <CopilotGhostLink href={detail.cta.href} className="w-full justify-center">
              {detail.cta.label}
            </CopilotGhostLink>
          </div>
        ) : null}
      </aside>
    </>
  );
}
