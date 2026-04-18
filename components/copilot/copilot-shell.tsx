"use client";

import { useEffect, useMemo } from "react";

import { CopilotAlertsProvider } from "@/components/copilot/copilot-alerts-context";
import { buildCopilotNavItemGroups } from "@/components/copilot/copilot-nav-config";
import { CopilotEnvironmentHealthStrip } from "@/components/copilot/copilot-environment-health-strip";
import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotModuleShell } from "@/components/copilot/module-shell";

/** Preferencia de sidebar del módulo Copilot (1 = colapsado, 0 = expandido). */
export const COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY = "copilot_sidebar_collapsed";

/** @deprecated Usar COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY */
export const COPILOT_PROTOTYPE_STORAGE_KEY = COPILOT_SIDEBAR_COLLAPSED_STORAGE_KEY;

export function CopilotShell({
  children,
  isSuperadmin,
  sessionPreview = null,
}: {
  children: React.ReactNode;
  /** Cookie `copilot_session` válida ⇒ superadmin en menú (paso inicial). */
  isSuperadmin: boolean;
  /** Opcional: datos fijos desde layout para la barra de usuario sin `/api/copilot/me`. */
  sessionPreview?: CopilotSessionPreview | null;
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
        headerStrip={
          <CopilotEnvironmentHealthStrip sessionPreview={sessionPreview} />
        }
        autoCollapseWhenPathIncludes="/copilot/atencion-prioritaria"
      >
        {children}
      </CopilotModuleShell>
    </CopilotAlertsProvider>
  );
}
