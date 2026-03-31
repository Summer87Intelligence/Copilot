"use client";

import { DEMO_NAV_ITEMS } from "@/components/copilot/demo-nav-config";
import { CopilotModuleShell } from "@/components/copilot/module-shell";

export const DEMO_MODULE_STORAGE_KEY = "summer87-demo-sidebar-collapsed";

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotModuleShell
      variant="demo"
      navItemGroups={[DEMO_NAV_ITEMS]}
      basePath="/demo"
      storageKey={DEMO_MODULE_STORAGE_KEY}
      brandTitle="Summer87 Copilot"
      brandSubtitle="Demostración"
    >
      {children}
    </CopilotModuleShell>
  );
}
