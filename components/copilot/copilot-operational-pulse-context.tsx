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

import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { carteraAgingOverdueFromReport } from "@/lib/copilot-today-business-pulse";
import type { FinancialConsistencyReport } from "@/lib/copilot-financial-reconciliation";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import {
  buildTodayBusinessPulse,
  type BusinessPulseGate,
  type TodayBusinessPulse,
} from "@/lib/copilot-today-business-pulse";
import {
  deriveOperationalSemaphore,
  type OperationalSemaphoreView,
} from "@/lib/copilot-operational-semaphore";
import { toRutasGateMeta } from "@/lib/copilot-rutas-gate";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";
import { getEndOfCurrentMonth } from "@/lib/copilot-operational-period";

type CopilotOperationalPulseContextValue = {
  pulse: TodayBusinessPulse | null;
  semaphore: OperationalSemaphoreView;
  loading: boolean;
  refresh: () => Promise<void>;
};

const CopilotOperationalPulseContext =
  createContext<CopilotOperationalPulseContextValue | null>(null);

export function CopilotOperationalPulseProvider({ children }: { children: ReactNode }) {
  const { items: alertItems, loading: alertsLoading } = useCopilotAlerts();
  const [pulse, setPulse] = useState<TodayBusinessPulse | null>(null);
  const [carteraAgingOverdue, setCarteraAgingOverdue] = useState<
    CarteraCurrencyTotals | undefined
  >(undefined);
  const [fetchLoading, setFetchLoading] = useState(true);

  const refresh = useCallback(async () => {
    setFetchLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [hubRes, reconRes, treasuryRes, cashRes] = await Promise.all([
        copilotApiFetch("/api/copilot/rutas-hub"),
        copilotApiFetch("/api/copilot/financial-reconciliation?mode=all_outstanding"),
        copilotApiFetch(
          `/api/copilot/treasury/scheduled-payments?include_summary=1&horizon_end_date=${getEndOfCurrentMonth()}`
        ),
        copilotApiFetch("/api/copilot/treasury/cash-position"),
      ]);

      const hubJson = (await hubRes.json().catch(() => null)) as Record<string, unknown> | null;
      const hub = hubJson ?? {};
      const meta = toRutasGateMeta(hub);
      const snapshot = (hub.snapshot as FinancialSnapshotApiV1 | null) ?? null;
      const portfolioRows =
        ((hub.portfolio as ClientPortfolioLoad | null)?.rows as ClientPortfolioLoad["rows"]) ??
        [];

      const gate: BusinessPulseGate = {
        confidence: meta.confidence,
        coverage: meta.coverage,
        recommendations_enabled: meta.recommendations_enabled,
      };

      let overdue: CarteraCurrencyTotals | undefined;
      const reconJson = (await reconRes.json().catch(() => null)) as {
        ok?: boolean;
        report?: FinancialConsistencyReport;
      } | null;
      if (reconRes.ok && reconJson?.ok && reconJson.report) {
        overdue = carteraAgingOverdueFromReport(reconJson.report.agingByCurrency);
      }
      setCarteraAgingOverdue(overdue);

      let treasurySummaries: TreasuryOutflowSummary[] | undefined;
      const treasuryJson = (await treasuryRes.json().catch(() => null)) as {
        ok?: boolean;
        data?: { summary?: TreasuryOutflowSummary[] };
      } | null;
      if (treasuryRes.ok && treasuryJson?.ok && Array.isArray(treasuryJson.data?.summary)) {
        treasurySummaries = treasuryJson.data?.summary;
      }

      let cashPositions: CashPositionByCurrency[] | undefined;
      const cashJson = (await cashRes.json().catch(() => null)) as {
        ok?: boolean;
        data?: { positions?: CashPositionByCurrency[] };
      } | null;
      if (cashRes.ok && cashJson?.ok && Array.isArray(cashJson.data?.positions)) {
        cashPositions = cashJson.data?.positions;
      }

      setPulse(
        buildTodayBusinessPulse({
          snapshot,
          portfolioRows,
          gate,
          carteraAgingOverdue: overdue,
          treasuryOutflowSummaries: treasurySummaries,
          treasuryCashPositions: cashPositions,
          today,
        })
      );
    } catch {
      setPulse(null);
      setCarteraAgingOverdue(undefined);
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const alerts = useMemo(
    () =>
      alertItems.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.priority,
      })),
    [alertItems]
  );

  const semaphore = useMemo(
    () =>
      deriveOperationalSemaphore({
        alerts,
        pulse,
        carteraAgingOverdue,
      }),
    [alerts, pulse, carteraAgingOverdue]
  );

  const loading = alertsLoading || fetchLoading;

  const value = useMemo(
    () => ({
      pulse,
      semaphore,
      loading,
      refresh,
    }),
    [pulse, semaphore, loading, refresh]
  );

  return (
    <CopilotOperationalPulseContext.Provider value={value}>
      {children}
    </CopilotOperationalPulseContext.Provider>
  );
}

export function useCopilotOperationalPulse(): CopilotOperationalPulseContextValue {
  const ctx = useContext(CopilotOperationalPulseContext);
  if (!ctx) {
    throw new Error(
      "useCopilotOperationalPulse debe usarse dentro de CopilotOperationalPulseProvider"
    );
  }
  return ctx;
}
