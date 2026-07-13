"use client";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { CopilotNotificationBell } from "@/components/copilot/copilot-notification-bell";
import { CurrencyHeaderPill } from "@/components/copilot/currency-display-toggle";
import { CopilotZetaSyncCompactPill } from "@/components/copilot/copilot-zeta-sync-compact-pill";
import { TodayDateDisplay } from "@/components/copilot/copilot-today-date";
import { OperationalSemaphoreIndicator } from "@/components/copilot/operational-semaphore-indicator";
import { useCopilotOperationalPulse } from "@/components/copilot/copilot-operational-pulse-context";

/**
 * USER-ACCESS-LANDING-PERMISSIONS-001: sin badge global de "Modo lectura" /
 * "Solo lectura" — no debe parecer una demo o un sistema limitado. Las
 * restricciones reales se siguen aplicando (permisos server-side intactos);
 * la señal visual de "esto no lo podés hacer" vive en el botón puntual
 * (ver PermissionButton), no en un rótulo permanente del header.
 */
export function CopilotEnvironmentHealthStrip({
  sessionPreview = null,
}: {
  sessionPreview?: CopilotSessionPreview | null;
}) {
  const { loading: pulseLoading } = useCopilotOperationalPulse();

  return (
    <div className="relative z-[50] flex h-[52px] min-w-0 items-center justify-between gap-x-1.5 border-b border-[var(--copilot-border)] bg-[var(--copilot-header-bg)] px-3 sm:gap-x-3 sm:px-6 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
        <TodayDateDisplay />
        {!pulseLoading ? <CopilotZetaSyncCompactPill className="hidden xl:inline-block" /> : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-x-1.5 sm:gap-x-4">
        <CurrencyHeaderPill />
        <CopilotNotificationBell />
        <CopilotUserBar sessionPreview={sessionPreview} />
        <OperationalSemaphoreIndicator />
      </div>
    </div>
  );
}
