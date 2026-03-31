"use client";

import { useCallback, useEffect, useState } from "react";

import { EnvironmentBanner } from "@/components/copilot/environment-banner";
import { CopilotModuleSidebar } from "@/components/copilot/module-sidebar";
import type { CopilotNavItem } from "@/components/copilot/copilot-nav-config";

export function CopilotModuleShell({
  children,
  variant,
  navItemGroups,
  basePath,
  storageKey,
  brandTitle,
  brandSubtitle,
}: {
  children: React.ReactNode;
  variant: "demo" | "prototype";
  /** Una o más secciones; entre grupos se muestra separador en el sidebar. */
  navItemGroups: CopilotNavItem[][];
  basePath: string;
  storageKey: string;
  brandTitle: string;
  brandSubtitle: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  const rootClass =
    variant === "demo"
      ? "demo-module flex min-h-screen text-[var(--copilot-ink)] antialiased"
      : "flex min-h-screen bg-[var(--copilot-canvas)] text-[var(--copilot-ink)] antialiased";

  return (
    <div
      className={rootClass}
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
      }}
    >
      <CopilotModuleSidebar
        collapsed={hydrated ? collapsed : false}
        onToggleCollapsed={toggleCollapsed}
        groups={navItemGroups}
        basePath={basePath}
        variant={variant}
        brandTitle={brandTitle}
        brandSubtitle={brandSubtitle}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <EnvironmentBanner variant={variant === "demo" ? "demo" : "prototype"} />
        {children}
      </div>
    </div>
  );
}
