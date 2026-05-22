"use client";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { EnvironmentBannerLeft } from "@/components/copilot/environment-banner";
import { OperationalSemaphoreIndicator } from "@/components/copilot/operational-semaphore-indicator";

/**
 * Primera fila del módulo: badge PROTOTIPO + copy (izq.); sesión + semáforo operacional (der.).
 */
export function CopilotEnvironmentHealthStrip({
  sessionPreview = null,
}: {
  sessionPreview?: CopilotSessionPreview | null;
}) {
  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[rgba(31,107,74,0.22)] bg-[var(--copilot-accent-soft)] px-4 py-2.5 text-sm text-[var(--copilot-ink)] sm:px-6 sm:py-3"
      >
        <div className="min-w-0 flex-1">
          <EnvironmentBannerLeft />
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:gap-x-4">
          <CopilotUserBar sessionPreview={sessionPreview} />
          <OperationalSemaphoreIndicator />
        </div>
      </div>
    </>
  );
}
