"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { CopilotModuleSidebar } from "@/components/copilot/module-sidebar";
import type { CopilotNavGroup } from "@/components/copilot/copilot-nav-config";

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
  /** Una o más secciones; entre grupos se muestra separador + título en el sidebar. */
  navItemGroups: CopilotNavGroup[];
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
    void Promise.resolve().then(() => {
      const pref = readSidebarPreference(storageKey);
      // First visit: open on desktop (>= 1024px), collapsed on mobile
      const defaultCollapsed = window.innerWidth < 1024;
      setCollapsed(pref !== null ? pref : defaultCollapsed);
      setHydrated(true);
    });
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
      className="flex min-h-0 w-full flex-1 bg-[var(--copilot-canvas)] font-[family-name:var(--font-geist-sans)] text-[var(--copilot-ink)] antialiased"
    >
      <CopilotModuleSidebar
        collapsed={hydrated ? collapsed : true}
        onToggleCollapsed={toggleCollapsed}
        groups={navItemGroups}
        basePath={basePath}
        brandTitle={brandTitle}
        brandSubtitle={brandSubtitle}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {headerStrip != null ? (
          <div className="shrink-0">{headerStrip}</div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
