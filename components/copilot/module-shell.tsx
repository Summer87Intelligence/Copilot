"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
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
  navItemGroups,
  basePath,
  storageKey,
  brandTitle,
  brandSubtitle,
  headerStrip,
  autoCollapseWhenPathIncludes,
}: {
  children: React.ReactNode;
  /** Una o más secciones; entre grupos se muestra separador en el sidebar. */
  navItemGroups: CopilotNavItem[][];
  basePath: string;
  storageKey: string;
  brandTitle: string;
  brandSubtitle: string;
  /** Franja superior (entorno + salud, etc.). */
  headerStrip?: ReactNode;
  /**
   * Reservado por compatibilidad con llamadas existentes. Sin clave en
   * localStorage el sidebar arranca colapsado en todas las rutas.
   */
  autoCollapseWhenPathIncludes?: string;
}) {
  void autoCollapseWhenPathIncludes;

  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    const pref = readSidebarPreference(storageKey);
    if (pref !== null) {
      setCollapsed(pref);
    } else {
      setCollapsed(true);
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

  return (
    <div
      className="flex min-h-screen bg-[var(--copilot-canvas)] text-[var(--copilot-ink)] antialiased"
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
      }}
    >
      <CopilotModuleSidebar
        collapsed={hydrated ? collapsed : true}
        onToggleCollapsed={toggleCollapsed}
        groups={navItemGroups}
        basePath={basePath}
        brandTitle={brandTitle}
        brandSubtitle={brandSubtitle}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-visible">
        {headerStrip != null ? (
          <div className="overflow-visible">{headerStrip}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
