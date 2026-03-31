"use client";

import { COPILOT_NAV_GROUPS } from "@/components/copilot/copilot-nav-config";
import { CopilotModuleShell } from "@/components/copilot/module-shell";

export const COPILOT_PROTOTYPE_STORAGE_KEY = "summer87-copilot-sidebar-collapsed";

export function CopilotShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotModuleShell
      variant="prototype"
      navItemGroups={COPILOT_NAV_GROUPS}
      basePath="/copilot"
      storageKey={COPILOT_PROTOTYPE_STORAGE_KEY}
      brandTitle="Summer87 Copilot"
      brandSubtitle="Prototipo operativo"
    >
      {children}
    </CopilotModuleShell>
  );
}
