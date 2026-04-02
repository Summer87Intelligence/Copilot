"use client";

import { useMemo } from "react";

import { CopilotAlertsProvider, useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import { COPILOT_NAV_GROUPS } from "@/components/copilot/copilot-nav-config";
import { HealthIndicator } from "@/components/copilot/HealthIndicator";
import { CopilotModuleShell } from "@/components/copilot/module-shell";

/** Preferencia de sidebar del módulo Copilot (1 = colapsado, 0 = expandido). */
export const COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY = "copilot_sidebar_collapsed";

/** @deprecated Usar COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY */
export const COPILOT_PROTOTYPE_STORAGE_KEY = COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY;

function CopilotGlobalHealthBar() {
  const { items, loading } = useCopilotAlerts();
  const alerts = useMemo(
    () =>
      items.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.priority,
      })),
    [items]
  );
  return <HealthIndicator alerts={alerts} loading={loading} />;
}

export function CopilotShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotAlertsProvider>
      <CopilotModuleShell
        navItemGroups={COPILOT_NAV_GROUPS}
        basePath="/copilot"
        storageKey={COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY}
        brandTitle="Summer87 Copilot"
        brandSubtitle="Prototipo operativo"
        topBar={<CopilotGlobalHealthBar />}
        autoCollapseWhenPathIncludes="/copilot/atencion-prioritaria"
      >
        {children}
      </CopilotModuleShell>
    </CopilotAlertsProvider>
  );
}
