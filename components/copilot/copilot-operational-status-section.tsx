"use client";

import { useEffect } from "react";

import { useCopilotOperationalPulse } from "@/components/copilot/copilot-operational-pulse-context";
import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { OperationalSemaphoreLevel } from "@/lib/copilot-operational-semaphore";

const LEVEL_THEME: Record<
  OperationalSemaphoreLevel,
  { labelClass: string; cardBorder: string }
> = {
  ok: {
    labelClass: "text-emerald-900",
    cardBorder: "border-emerald-200/70 bg-emerald-50/35",
  },
  attention: {
    labelClass: "text-amber-950",
    cardBorder: "border-amber-200/70 bg-amber-50/35",
  },
  critical: {
    labelClass: "text-rose-950",
    cardBorder: "border-rose-200/70 bg-rose-50/35",
  },
};

function SeverityList({
  label,
  items,
  empty,
}: {
  label: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1.5 text-sm leading-snug text-[var(--copilot-ink)]">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[var(--copilot-ink-muted)]" aria-hidden>
                ·
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CopilotOperationalStatusSection({
  scrollIntoView,
}: {
  scrollIntoView?: boolean;
}) {
  const { semaphore, loading } = useCopilotOperationalPulse();
  const theme = LEVEL_THEME[semaphore.level];

  useEffect(() => {
    if (!scrollIntoView || loading) return;
    const t = window.setTimeout(() => {
      document
        .getElementById("estado-operacional")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [scrollIntoView, loading]);

  return (
    <div id="estado-operacional" className="scroll-mt-24">
    <CopilotCard className={theme.cardBorder}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Estado operacional
      </p>
      {loading ? (
        <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">Actualizando…</p>
      ) : (
        <>
          <p className={`mt-1 text-lg font-semibold ${theme.labelClass}`}>
            {semaphore.statusLabel}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            {semaphore.primaryReason}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SeverityList
              label="Críticas"
              items={semaphore.criticalItems}
              empty="Ninguna"
            />
            <SeverityList label="Altas" items={semaphore.highItems} empty="Ninguna" />
            <SeverityList
              label="Medias"
              items={semaphore.mediumItems}
              empty="Ninguna"
            />
          </div>
          <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
            {semaphore.counterLine}
            {semaphore.mediumCount > 0
              ? ` · ${semaphore.mediumCount} media${semaphore.mediumCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </>
      )}
    </CopilotCard>
    </div>
  );
}
