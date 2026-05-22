"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { HoyPageView } from "@/components/copilot/hoy/hoy-page-view";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { FinancialConsistencyReport } from "@/lib/copilot-financial-reconciliation";
import { sumCarteraAgingCurrent } from "@/lib/copilot-cartera-aging-totals";
import {
  defaultHoyPeriodRange,
  last30DaysPeriodRange,
  monthToDatePeriodRange,
  type HoyPeriodRange,
} from "@/lib/copilot-hoy-period";
import {
  carteraAgingOverdueFromReport,
  carteraCollectedToDateFromReport,
  type BusinessPulseGate,
} from "@/lib/copilot-today-business-pulse";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import { toRutasGateMeta } from "@/lib/copilot-rutas-gate";
import { HOY_PAGE } from "@/lib/copilot-hoy-ui-contract";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

const DEFAULT_GATE: BusinessPulseGate = {
  confidence: "low",
  coverage: "insufficient",
  recommendations_enabled: false,
};

function normalizeDateInput(value: string): string {
  return value.slice(0, 10);
}

export default function CopilotHoyPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultPeriod = useMemo(() => defaultHoyPeriodRange(today), [today]);

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioLoad["rows"] | null>(null);
  const [gate, setGate] = useState<BusinessPulseGate>(DEFAULT_GATE);
  const [carteraAgingOverdue, setCarteraAgingOverdue] = useState<CarteraCurrencyTotals | undefined>(
    undefined
  );
  const [carteraCollectedToDate, setCarteraCollectedToDate] = useState<
    CarteraCurrencyTotals | undefined
  >(undefined);
  const [carteraAgingCurrent, setCarteraAgingCurrent] = useState<
    CarteraCurrencyTotals | undefined
  >(undefined);
  const [periodReportCurrencies, setPeriodReportCurrencies] = useState<unknown>([]);
  const [manualCashMovements, setManualCashMovements] = useState<ManualCashMovement[]>([]);
  const [treasuryOutflowSummaries, setTreasuryOutflowSummaries] = useState<
    TreasuryOutflowSummary[] | undefined
  >(undefined);
  const [treasuryCashPositions, setTreasuryCashPositions] = useState<
    CashPositionByCurrency[] | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);

  const [draftFrom, setDraftFrom] = useState(defaultPeriod.from);
  const [draftTo, setDraftTo] = useState(defaultPeriod.to);
  const [confirmedPeriod, setConfirmedPeriod] = useState<HoyPeriodRange>(defaultPeriod);

  const hasPendingPeriodChanges =
    normalizeDateInput(draftFrom) !== normalizeDateInput(confirmedPeriod.from) ||
    normalizeDateInput(draftTo) !== normalizeDateInput(confirmedPeriod.to);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const period = confirmedPeriod;
    try {
      const periodQuery = new URLSearchParams({
        mode: "period_only",
        period_start: period.from,
        period_end: period.to,
      });
      const [hubRes, reconCurrentRes, reconPeriodRes, treasuryRes, cashRes, manualRes] =
        await Promise.all([
          copilotApiFetch("/api/copilot/rutas-hub"),
          copilotApiFetch("/api/copilot/financial-reconciliation?mode=all_outstanding"),
          copilotApiFetch(`/api/copilot/financial-reconciliation?${periodQuery.toString()}`),
          copilotApiFetch(
            "/api/copilot/treasury/scheduled-payments?include_summary=1&horizon_days=30"
          ),
          copilotApiFetch("/api/copilot/treasury/cash-position"),
          copilotApiFetch("/api/copilot/treasury/manual-cash-movements"),
        ]);
      const json = (await hubRes.json().catch(() => null)) as Record<string, unknown> | null;
      const hub = json ?? {};
      const meta = toRutasGateMeta(hub);
      setSnapshot((hub.snapshot as FinancialSnapshotApiV1 | null) ?? null);
      setPortfolioRows(((hub.portfolio as ClientPortfolioLoad | null)?.rows) ?? null);
      setGate({
        confidence: meta.confidence,
        coverage: meta.coverage,
        recommendations_enabled: meta.recommendations_enabled,
      });

      const reconCurrentJson = (await reconCurrentRes.json().catch(() => null)) as {
        ok?: boolean;
        report?: FinancialConsistencyReport;
      } | null;
      if (reconCurrentRes.ok && reconCurrentJson?.ok && reconCurrentJson.report) {
        setCarteraAgingOverdue(
          carteraAgingOverdueFromReport(reconCurrentJson.report.agingByCurrency)
        );
        setCarteraAgingCurrent(sumCarteraAgingCurrent(reconCurrentJson.report.agingByCurrency));
        setCarteraCollectedToDate(
          carteraCollectedToDateFromReport(reconCurrentJson.report.currencies)
        );
      } else {
        setCarteraAgingOverdue(undefined);
        setCarteraAgingCurrent(undefined);
        setCarteraCollectedToDate(undefined);
      }

      const reconPeriodJson = (await reconPeriodRes.json().catch(() => null)) as {
        ok?: boolean;
        report?: FinancialConsistencyReport;
      } | null;
      if (reconPeriodRes.ok && reconPeriodJson?.ok && reconPeriodJson.report) {
        setPeriodReportCurrencies(reconPeriodJson.report.currencies);
      } else {
        setPeriodReportCurrencies([]);
      }

      const treasuryJson = (await treasuryRes.json().catch(() => null)) as {
        ok?: boolean;
        data?: { summary?: TreasuryOutflowSummary[] };
      } | null;
      if (treasuryRes.ok && treasuryJson?.ok && treasuryJson.data?.summary) {
        setTreasuryOutflowSummaries(treasuryJson.data.summary);
      } else {
        setTreasuryOutflowSummaries([]);
      }

      const cashJson = (await cashRes.json().catch(() => null)) as {
        ok?: boolean;
        data?: { positions?: CashPositionByCurrency[] };
      } | null;
      if (cashRes.ok && cashJson?.ok && cashJson.data?.positions) {
        setTreasuryCashPositions(cashJson.data.positions);
      } else {
        setTreasuryCashPositions([]);
      }

      const manualJson = (await manualRes.json().catch(() => null)) as {
        ok?: boolean;
        data?: { items?: ManualCashMovement[] };
      } | null;
      if (manualRes.ok && manualJson?.ok && manualJson.data?.items) {
        setManualCashMovements(manualJson.data.items);
      } else {
        setManualCashMovements([]);
      }
    } catch {
      setError("No se pudo cargar el resumen del negocio. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [confirmedPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPeriod(range: HoyPeriodRange) {
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setConfirmedPeriod(range);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        dense
        surfaceId="copilot.hoy"
        title={HOY_PAGE.title}
        description={HOY_PAGE.description}
        right={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white/80 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-white disabled:opacity-50"
            aria-label="Actualizar datos"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Actualizar
          </button>
        }
      />
      <HoyPageView
        loading={loading}
        today={today}
        snapshot={snapshot}
        portfolioRows={portfolioRows}
        gate={gate}
        carteraAgingOverdue={carteraAgingOverdue}
        carteraAgingCurrent={carteraAgingCurrent}
        carteraCollectedToDate={carteraCollectedToDate}
        periodReportCurrencies={periodReportCurrencies}
        manualCashMovements={manualCashMovements}
        confirmedPeriod={confirmedPeriod}
        draftFrom={draftFrom}
        draftTo={draftTo}
        hasPendingPeriodChanges={hasPendingPeriodChanges}
        onDraftFromChange={setDraftFrom}
        onDraftToChange={setDraftTo}
        onConfirmPeriod={() => {
          if (draftFrom && draftTo && draftFrom <= draftTo) {
            setConfirmedPeriod({ from: draftFrom, to: draftTo });
          }
        }}
        onMonthToDate={() => applyPeriod(monthToDatePeriodRange(today))}
        onLast30Days={() => applyPeriod(last30DaysPeriodRange(today))}
        treasuryOutflowSummaries={treasuryOutflowSummaries}
        treasuryCashPositions={treasuryCashPositions}
        error={error}
        onRefresh={load}
      />
    </div>
  );
}
