"use client";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { TodayDateDisplay } from "@/components/copilot/copilot-today-date";
import { OperationalSemaphoreIndicator } from "@/components/copilot/operational-semaphore-indicator";

/**
 * Franja superior del módulo: fecha actual (izq.) · avatar usuario + semáforo (der.).
 */
export function CopilotEnvironmentHealthStrip({
  sessionPreview = null,
}: {
  sessionPreview?: CopilotSessionPreview | null;
}) {
  return (
    <div className="relative z-[50] flex h-[56px] items-center justify-between gap-x-4 border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.80)] px-4 sm:px-6">
      <TodayDateDisplay />
      <div className="flex shrink-0 items-center justify-end gap-x-3 sm:gap-x-4">
        <CopilotUserBar sessionPreview={sessionPreview} />
        <OperationalSemaphoreIndicator />
      </div>
    </div>
  );
}
