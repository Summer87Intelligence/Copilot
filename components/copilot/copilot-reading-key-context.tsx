"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import type { CopilotReadingKeyEntry } from "@/lib/copilot-reading-keys";
import {
  getCopilotReadingKeyForPath,
  isCopilotReadingKeySuppressed,
} from "@/lib/copilot-reading-keys";

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
  const [overridePathname, setOverridePathname] = useState(pathname);

  if (pathname !== overridePathname) {
    setOverridePathname(pathname);
    setOverride({ kind: "auto" });
  }

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
  if (isCopilotReadingKeySuppressed(pathname)) {
    return null;
  }
  return getCopilotReadingKeyForPath(pathname);
}
