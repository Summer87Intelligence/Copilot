"use client";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { CopilotNotificationBell } from "@/components/copilot/copilot-notification-bell";
import { TodayDateDisplay } from "@/components/copilot/copilot-today-date";
import { OperationalSemaphoreIndicator } from "@/components/copilot/operational-semaphore-indicator";
import { ThemeToggle } from "@/components/theme/theme-toggle";

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

  return (
    <div className="relative z-[50] flex h-[56px] min-w-0 items-center justify-between gap-x-2 border-b border-[var(--copilot-border)] bg-[var(--copilot-header-bg)] px-4 sm:gap-x-4 sm:px-6 backdrop-blur-sm">
      <TodayDateDisplay />
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-x-2 sm:gap-x-4">
        {readOnlyLabel && readOnlyShort ? (
          <span
            className="inline-flex max-w-[5.5rem] shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-800 sm:max-w-none sm:px-2.5 sm:text-xs"
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
