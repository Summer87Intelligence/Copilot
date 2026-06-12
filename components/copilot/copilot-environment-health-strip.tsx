"use client";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { CopilotNotificationBell } from "@/components/copilot/copilot-notification-bell";
import { CopilotZetaSyncCompactPill } from "@/components/copilot/copilot-zeta-sync-compact-pill";
import { TodayDateDisplay } from "@/components/copilot/copilot-today-date";
import { OperationalSemaphoreIndicator } from "@/components/copilot/operational-semaphore-indicator";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useCopilotOperationalPulse } from "@/components/copilot/copilot-operational-pulse-context";

function readOnlyBadgeShortLabel(label: string): string {
  if (label.toLowerCase().includes("demo")) return "Demo";
  return "Solo lectura";
}

export function CopilotEnvironmentHealthStrip({
  sessionPreview = null,
  readOnlyLabel = null,
}: {
  sessionPreview?: CopilotSessionPreview | null;
  readOnlyLabel?: string | null;
}) {
  const readOnlyShort =
    readOnlyLabel != null ? readOnlyBadgeShortLabel(readOnlyLabel) : null;
  const { loading: pulseLoading } = useCopilotOperationalPulse();

  return (
    <div className="relative z-[50] flex h-[52px] min-w-0 items-center justify-between gap-x-2 border-b border-[var(--copilot-border)] bg-[var(--copilot-header-bg)] px-4 sm:gap-x-3 sm:px-6 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2">
        <TodayDateDisplay />
        {!pulseLoading ? <CopilotZetaSyncCompactPill className="hidden lg:inline-block" /> : null}
      </div>
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-x-2 sm:gap-x-4">
        {readOnlyLabel && readOnlyShort ? (
          <span
            className="inline-flex max-w-[5.5rem] shrink-0 items-center rounded-full border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-2 py-0.5 text-[10px] font-semibold leading-tight text-[var(--copilot-warning-text-strong)] sm:max-w-none sm:px-2.5 sm:text-xs"
            title={readOnlyLabel}
          >
            <span className="truncate sm:hidden">{readOnlyShort}</span>
            <span className="hidden sm:inline">{readOnlyLabel}</span>
          </span>
        ) : null}
        <ThemeToggle />
        <CopilotNotificationBell />
        <CopilotUserBar sessionPreview={sessionPreview} />
        <OperationalSemaphoreIndicator />
      </div>
    </div>
  );
}
