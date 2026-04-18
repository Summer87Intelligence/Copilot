"use client";

import { useEffect, useMemo } from "react";

import { CopilotAlertsProvider } from "@/components/copilot/copilot-alerts-context";
import { buildCopilotNavItemGroups } from "@/components/copilot/copilot-nav-config";
import { CopilotEnvironmentHealthStrip } from "@/components/copilot/copilot-environment-health-strip";
import { CopilotModuleShell } from "@/components/copilot/module-shell";

/** Preferencia de sidebar del módulo Copilot (1 = colapsado, 0 = expandido). */
export const COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY = "copilot_sidebar_collapsed";

/** @deprecated Usar COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY */
export const COPILOT_PROTOTYPE_STORAGE_KEY = COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY;

export function CopilotShell({
  children,
  isSuperadmin,
}: {
  children: React.ReactNode;
  /** Resuelto en servidor (`app/copilot/layout.tsx`) con sesión + `app_users.role`. */
  isSuperadmin: boolean;
}) {
  const navItemGroups = useMemo(
    () => buildCopilotNavItemGroups(isSuperadmin),
    [isSuperadmin]
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const groupLabels = navItemGroups.map((g) => g.sectionTitle ?? "(sin título)");
    const itemLabels = navItemGroups.flatMap((g) =>
      g.items.map((i) => i.label)
    );
    console.debug("[CopilotShell]", {
      isSuperadmin,
      groupCount: navItemGroups.length,
      groupLabels,
      itemLabels,
    });
  }, [isSuperadmin, navItemGroups]);

  return (
    <CopilotAlertsProvider>
      <CopilotModuleShell
        navItemGroups={navItemGroups}
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
