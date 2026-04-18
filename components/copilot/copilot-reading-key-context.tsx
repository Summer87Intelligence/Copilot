"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import type { CopilotReadingKeyEntry } from "@/lib/copilot-reading-keys";
import { getCopilotReadingKeyForPath } from "@/lib/copilot-reading-keys";

export type CopilotReadingKeyOverride =
  | { kind: "auto" }
  | { kind: "hidden" }
  | { kind: "custom"; entry: CopilotReadingKeyEntry };

type ContextValue = {
  override: CopilotReadingKeyOverride;
  setReadingKeyOverride: (next: CopilotReadingKeyOverride) => void;
};

const CopilotReadingKeyContext = createContext<ContextValue | null>(null);

export function CopilotReadingKeyProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [override, setOverride] = useState<CopilotReadingKeyOverride>({ kind: "auto" });

  /**
   * Al cambiar la ruta, volver a modo automático para no arrastrar overrides de otras pantallas.
   * Debe ejecutarse después del commit (useEffect), no en layout: actualizar estado del padre
   * en useLayoutEffect puede disparar avisos de React 19 si el subárbol aún no terminó de montar.
   */
  useEffect(() => {
    setOverride({ kind: "auto" });
  }, [pathname]);

  const setReadingKeyOverride = useCallback((next: CopilotReadingKeyOverride) => {
    setOverride(next);
  }, []);

  const value = useMemo(
    () => ({ override, setReadingKeyOverride }),
    [override, setReadingKeyOverride]
  );

  return (
    <CopilotReadingKeyContext.Provider value={value}>{children}</CopilotReadingKeyContext.Provider>
  );
}

export function useCopilotReadingKeyOverride(): ContextValue {
  const ctx = useContext(CopilotReadingKeyContext);
  if (!ctx) {
    throw new Error("useCopilotReadingKeyOverride debe usarse dentro de CopilotReadingKeyProvider");
  }
  return ctx;
}

export function resolveCopilotReadingKey(
  pathname: string,
  override: CopilotReadingKeyOverride
): CopilotReadingKeyEntry | null {
  if (override.kind === "hidden") {
    return null;
  }
  if (override.kind === "custom") {
    return override.entry;
  }
  return getCopilotReadingKeyForPath(pathname);
}
