"use client";

import type { CockpitHero } from "@/lib/copilot-hoy-cockpit-view";
import type { PulseStatus } from "@/lib/copilot-today-business-pulse";

const STATUS_DOT: Record<PulseStatus, string> = {
  healthy: "bg-[var(--copilot-status-ok-dot)]",
  attention: "bg-[var(--copilot-status-warn-dot)]",
  critical: "bg-[var(--copilot-status-critical-dot)]",
};

const STATUS_LABEL: Record<PulseStatus, string> = {
  healthy: "text-[var(--copilot-success-text)]",
  attention: "text-[var(--copilot-warning-text)]",
  critical: "text-[var(--copilot-danger-text)]",
};

export function HoyCompactHero({ hero }: { hero: CockpitHero }) {
  const dotClass = STATUS_DOT[hero.status];
  const labelClass = STATUS_LABEL[hero.status];

  return (
    <div className="flex items-start gap-2.5 px-0.5">
      <span
        className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dotClass}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${labelClass}`}>
          {hero.statusLabel}
        </p>
        <p className="mt-0.5 text-sm font-medium leading-snug text-[var(--copilot-ink)]">
          {hero.headline}
        </p>
        {hero.metricsLine ? (
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            {hero.metricsLine}
          </p>
        ) : null}
      </div>
    </div>
  );
}
