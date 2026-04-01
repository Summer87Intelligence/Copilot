"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { EnvironmentBanner } from "@/components/copilot/environment-banner";
import { CopilotModuleSidebar } from "@/components/copilot/module-sidebar";
import type { CopilotNavItem } from "@/components/copilot/copilot-nav-config";

function readSidebarPreference(storageKey: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function CopilotModuleShell({
  children,
  variant,
  navItemGroups,
  basePath,
  storageKey,
  brandTitle,
  brandSubtitle,
  topBar,
  autoCollapseWhenPathIncludes,
}: {
  children: React.ReactNode;
  variant: "demo" | "prototype";
  /** Una o más secciones; entre grupos se muestra separador en el sidebar. */
  navItemGroups: CopilotNavItem[][];
  basePath: string;
  storageKey: string;
  brandTitle: string;
  brandSubtitle: string;
  /** Barra opcional bajo el banner de entorno (p. ej. salud global). */
  topBar?: ReactNode;
  /**
   * Si el usuario nunca guardó preferencia en localStorage, colapsar al entrar
   * a rutas que contengan este substring (p. ej. atención prioritaria).
   */
  autoCollapseWhenPathIncludes?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    const pref = readSidebarPreference(storageKey);
    if (pref !== null) {
      setCollapsed(pref);
    } else if (
      autoCollapseWhenPathIncludes &&
      pathname.includes(autoCollapseWhenPathIncludes)
    ) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
    setHydrated(true);
  }, [storageKey, pathname, autoCollapseWhenPathIncludes]);

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
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-visible">
        <EnvironmentBanner variant={variant === "demo" ? "demo" : "prototype"} />
        {topBar != null ? (
          <div className="overflow-visible border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.45)] px-6 py-2 backdrop-blur-sm">
            {topBar}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
