"use client";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { CopilotNotificationBell } from "@/components/copilot/copilot-notification-bell";
import { TodayDateDisplay } from "@/components/copilot/copilot-today-date";
import { OperationalSemaphoreIndicator } from "@/components/copilot/operational-semaphore-indicator";

export function CopilotEnvironmentHealthStrip({
  sessionPreview = null,
  readOnlyLabel = null,
}: {
  sessionPreview?: CopilotSessionPreview | null;
  readOnlyLabel?: string | null;
}) {
  return (
    <div className="relative z-[50] flex h-[56px] items-center justify-between gap-x-4 border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.80)] px-4 sm:px-6">
      <TodayDateDisplay />
      <div className="flex shrink-0 items-center justify-end gap-x-3 sm:gap-x-4">
        {readOnlyLabel && (
          <span className="hidden items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 sm:flex">
            {readOnlyLabel}
          </span>
        )}
        <CopilotNotificationBell />
        <CopilotUserBar sessionPreview={sessionPreview} />
        <OperationalSemaphoreIndicator />
      </div>
    </div>
  );
}
