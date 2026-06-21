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
    labelClass: "text-[var(--copilot-success-text-strong)]",
    cardBorder: "border-[var(--copilot-success-border)]/70 bg-[var(--copilot-tone-positive-bg)]/35",
  },
  attention: {
    labelClass: "text-[var(--copilot-warning-text-strong)]",
    cardBorder: "border-[var(--copilot-warning-border)]/70 bg-[var(--copilot-tone-warning-bg)]/35",
  },
  critical: {
    labelClass: "text-[var(--copilot-danger-text-strong)]",
    cardBorder: "border-[var(--copilot-danger-border)]/70 bg-[var(--copilot-tone-danger-bg)]/35",
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
        Estado del negocio
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SeverityList
              label="Críticas"
              items={semaphore.criticalItems}
              empty="Ninguna"
            />
            <SeverityList label="Alertas altas" items={semaphore.highItems} empty="Ninguna" />
            <SeverityList
              label="Alertas medias"
              items={semaphore.mediumItems}
              empty="Ninguna"
            />
            {semaphore.operativeItems.length > 0 ? (
              <SeverityList label="Señales operativas" items={semaphore.operativeItems} empty="" />
            ) : null}
          </div>
          <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
            {semaphore.counterLine}
          </p>
        </>
      )}
    </CopilotCard>
    </div>
  );
}
