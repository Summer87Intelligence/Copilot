"use client";

import { CopilotAlertsProvider } from "@/components/copilot/copilot-alerts-context";
import { COPILOT_NAV_GROUPS } from "@/components/copilot/copilot-nav-config";
import { CopilotEnvironmentHealthStrip } from "@/components/copilot/copilot-environment-health-strip";
import { CopilotModuleShell } from "@/components/copilot/module-shell";

/** Preferencia de sidebar del módulo Copilot (1 = colapsado, 0 = expandido). */
export const COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY = "copilot_sidebar_collapsed";

/** @deprecated Usar COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY */
export const COPILOT_PROTOTYPE_STORAGE_KEY = COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY;

export function CopilotShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotAlertsProvider>
      <CopilotModuleShell
        navItemGroups={COPILOT_NAV_GROUPS}
        basePath="/copilot"
        storageKey={COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY}
        brandTitle="Summer87 Copilot"
        brandSubtitle="Prototipo operativo"
        headerStrip={<CopilotEnvironmentHealthStrip />}
        autoCollapseWhenPathIncludes="/copilot/atencion-prioritaria"
      >
        {children}
      </CopilotModuleShell>
    </CopilotAlertsProvider>
  );
}
