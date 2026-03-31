"use client";

import { DemoIaSubnav } from "@/components/copilot/demo-ia-subnav";

export function DemoIaModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--copilot-canvas)]">
      <DemoIaSubnav />
      {children}
    </div>
  );
}
