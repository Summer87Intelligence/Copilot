"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getFinancialPredictiveAlerts } from "@/lib/copilot-financial-alerts";
import { getFiscalAlerts, type FiscalAlertItem } from "@/lib/copilot-tax-alerts";

const PRIORITY_ORDER: Record<FiscalAlertItem["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function sortCopilotAlerts(list: FiscalAlertItem[]): FiscalAlertItem[] {
  return [...list].sort((a, b) => {
    const d = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

type CopilotAlertsContextValue = {
  items: FiscalAlertItem[];
  loading: boolean;
  fiscalError: string | null;
  predictiveError: string | null;
  refresh: () => Promise<void>;
};

const CopilotAlertsContext = createContext<CopilotAlertsContextValue | null>(null);

export function CopilotAlertsProvider({ children }: { children: ReactNode }) {
  const [fiscalAlerts, setFiscalAlerts] = useState<FiscalAlertItem[]>([]);
  const [predictiveAlerts, setPredictiveAlerts] = useState<FiscalAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [predictiveError, setPredictiveError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      getFiscalAlerts(),
      getFinancialPredictiveAlerts(),
    ]);

    if (!isMountedRef.current) return;

    if (results[0].status === "fulfilled") {
      setFiscalAlerts(results[0].value);
      setFiscalError(null);
    } else {
      setFiscalAlerts([]);
      setFiscalError(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : "No se cargaron alertas fiscales."
      );
    }

    if (results[1].status === "fulfilled") {
      setPredictiveAlerts(results[1].value);
      setPredictiveError(null);
    } else {
      setPredictiveAlerts([]);
      setPredictiveError(
        results[1].reason instanceof Error
          ? results[1].reason.message
          : "No se cargaron alertas predictivas."
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  const items = useMemo(
    () => sortCopilotAlerts([...fiscalAlerts, ...predictiveAlerts]),
    [fiscalAlerts, predictiveAlerts]
  );

  const value = useMemo(
    () => ({
      items,
      loading,
      fiscalError,
      predictiveError,
      refresh,
    }),
    [items, loading, fiscalError, predictiveError, refresh]
  );

  return (
    <CopilotAlertsContext.Provider value={value}>{children}</CopilotAlertsContext.Provider>
  );
}

export function useCopilotAlerts(): CopilotAlertsContextValue {
  const ctx = useContext(CopilotAlertsContext);
  if (!ctx) {
    throw new Error("useCopilotAlerts debe usarse dentro de CopilotAlertsProvider");
  }
  return ctx;
}
