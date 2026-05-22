"use client";

import type { CockpitHero } from "@/lib/copilot-hoy-cockpit-view";
import { HOY_COCKPIT } from "@/lib/copilot-hoy-ui-contract";
import type { PulseStatus } from "@/lib/copilot-today-business-pulse";

const STATUS_THEME: Record<
  PulseStatus,
  { dot: string; labelClass: string; panel: string; border: string }
> = {
  healthy: {
    dot: "bg-emerald-500 ring-4 ring-emerald-100/80",
    labelClass: "text-emerald-800",
    panel: "bg-white",
    border: "border-[var(--copilot-border)]",
  },
  attention: {
    dot: "bg-amber-400 ring-4 ring-amber-100/80",
    labelClass: "text-amber-800",
    panel: "bg-amber-50/30",
    border: "border-amber-200/60",
  },
  critical: {
    dot: "bg-rose-500 ring-4 ring-rose-100/80",
    labelClass: "text-rose-800",
    panel: "bg-rose-50/35",
    border: "border-rose-200/60",
  },
};

export function HoyCompactHero({
  hero,
  onViewCriticalClients,
}: {
  hero: CockpitHero;
  onViewCriticalClients?: () => void;
}) {
  const t = STATUS_THEME[hero.status];

  return (
    <section
      className={`w-full rounded-2xl border p-4 shadow-sm sm:p-5 ${t.panel} ${t.border}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${t.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${t.labelClass}`}>
            {hero.statusLabel}
          </p>
          <p className="mt-1.5 text-base font-semibold leading-snug text-slate-800 sm:text-lg">
            {hero.headline}
          </p>
          {hero.metricsLine ? (
            <p className="mt-1 text-sm leading-snug text-slate-600">{hero.metricsLine}</p>
          ) : null}
          {onViewCriticalClients ? (
            <button
              type="button"
              onClick={onViewCriticalClients}
              className="mt-3 inline-flex items-center rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm transition-colors hover:bg-amber-100/90"
            >
              {HOY_COCKPIT.viewCriticalClients}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
