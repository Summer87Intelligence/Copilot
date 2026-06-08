"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { HoyPageView, type HoySectionErrors } from "@/components/copilot/hoy/hoy-page-view";
import type { ClientCompanyDetail, ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
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

function devWarn(section: string, reason: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[Hoy] ${section} load failed`, reason);
  }
}

export default function CopilotHoyPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultPeriod = useMemo(() => defaultHoyPeriodRange(today), [today]);

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioLoad["rows"] | null>(null);
  const [portfolioDetails, setPortfolioDetails] = useState<Record<string, ClientCompanyDetail> | null>(null);
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
  const [sectionErrors, setSectionErrors] = useState<HoySectionErrors>({});
  const loadAbortRef = useRef<AbortController | null>(null);

  const [draftFrom, setDraftFrom] = useState(defaultPeriod.from);
  const [draftTo, setDraftTo] = useState(defaultPeriod.to);
  const [confirmedPeriod, setConfirmedPeriod] = useState<HoyPeriodRange>(defaultPeriod);

  const hasPendingPeriodChanges =
    normalizeDateInput(draftFrom) !== normalizeDateInput(confirmedPeriod.from) ||
    normalizeDateInput(draftTo) !== normalizeDateInput(confirmedPeriod.to);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);
    setSectionErrors({});
    const period = confirmedPeriod;

    const periodQuery = new URLSearchParams({
      mode: "period_only",
      period_start: period.from,
      period_end: period.to,
    });

    // Each fetch is independent — a single failure must not block the others.
    const [hubResult, reconCurrentResult, reconPeriodResult, treasuryResult, cashResult, manualResult] =
      await Promise.allSettled([
        copilotApiFetch("/api/copilot/rutas-hub", { signal }),
        copilotApiFetch("/api/copilot/financial-reconciliation?mode=all_outstanding", { signal }),
        copilotApiFetch(`/api/copilot/financial-reconciliation?${periodQuery.toString()}`, { signal }),
        copilotApiFetch(
          "/api/copilot/treasury/scheduled-payments?include_summary=1&horizon_days=30",
          { signal }
        ),
        copilotApiFetch("/api/copilot/treasury/cash-position", { signal }),
        copilotApiFetch("/api/copilot/treasury/manual-cash-movements", { signal }),
      ]);

    if (signal.aborted) return;

    const newErrors: HoySectionErrors = {};

    // ── Hub (panorama principal + portfolio) ────────────────────────────────
    if (hubResult.status === "fulfilled") {
      const json = (await hubResult.value.json().catch(() => null)) as Record<string, unknown> | null;
      const hub = json ?? {};
      const meta = toRutasGateMeta(hub);
      setSnapshot((hub.snapshot as FinancialSnapshotApiV1 | null) ?? null);
      const hubPortfolio = (hub.portfolio as ClientPortfolioLoad | null) ?? null;
      setPortfolioRows(hubPortfolio?.rows ?? null);
      setPortfolioDetails(hubPortfolio?.details ?? null);
      setGate({
        confidence: meta.confidence,
        coverage: meta.coverage,
        recommendations_enabled: meta.recommendations_enabled,
      });
    } else {
      devWarn("hub", hubResult.reason);
      newErrors.hub = "No se pudo cargar el panorama principal.";
      setSnapshot(null);
      setPortfolioRows(null);
      setPortfolioDetails(null);
      setGate(DEFAULT_GATE);
    }

    // ── Cartera — estado actual (vencido, cobrado) ──────────────────────────
    if (reconCurrentResult.status === "fulfilled") {
      const reconCurrentJson = (await reconCurrentResult.value.json().catch(() => null)) as {
        ok?: boolean;
        report?: FinancialConsistencyReport;
      } | null;
      if (reconCurrentResult.value.ok && reconCurrentJson?.ok && reconCurrentJson.report) {
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
    } else {
      devWarn("cartera-current-recon", reconCurrentResult.reason);
      newErrors.carteraCurrentRecon = "No se pudo cargar el estado de cartera vencida.";
      setCarteraAgingOverdue(undefined);
      setCarteraAgingCurrent(undefined);
      setCarteraCollectedToDate(undefined);
    }

    // ── Cartera — actividad del período ─────────────────────────────────────
    if (reconPeriodResult.status === "fulfilled") {
      const reconPeriodJson = (await reconPeriodResult.value.json().catch(() => null)) as {
        ok?: boolean;
        report?: FinancialConsistencyReport;
      } | null;
      if (reconPeriodResult.value.ok && reconPeriodJson?.ok && reconPeriodJson.report) {
        setPeriodReportCurrencies(reconPeriodJson.report.currencies);
      } else {
        setPeriodReportCurrencies([]);
      }
    } else {
      devWarn("cartera-period-recon", reconPeriodResult.reason);
      newErrors.carteraPeriodRecon = "No se pudo cargar la actividad del período.";
      setPeriodReportCurrencies([]);
    }

    // ── Tesorería — pagos programados ───────────────────────────────────────
    if (treasuryResult.status === "fulfilled") {
      const treasuryJson = (await treasuryResult.value.json().catch(() => null)) as {
        ok?: boolean;
        data?: { summary?: TreasuryOutflowSummary[] };
      } | null;
      if (treasuryResult.value.ok && treasuryJson?.ok && treasuryJson.data?.summary) {
        setTreasuryOutflowSummaries(treasuryJson.data.summary);
      } else {
        setTreasuryOutflowSummaries([]);
      }
    } else {
      devWarn("treasury-scheduled-payments", treasuryResult.reason);
      newErrors.treasury = "No se pudo cargar los pagos programados.";
      setTreasuryOutflowSummaries([]);
    }

    // ── Tesorería — posición de caja ────────────────────────────────────────
    if (cashResult.status === "fulfilled") {
      const cashJson = (await cashResult.value.json().catch(() => null)) as {
        ok?: boolean;
        data?: { positions?: CashPositionByCurrency[] };
      } | null;
      if (cashResult.value.ok && cashJson?.ok && cashJson.data?.positions) {
        setTreasuryCashPositions(cashJson.data.positions);
      } else {
        setTreasuryCashPositions([]);
      }
    } else {
      devWarn("treasury-cash-position", cashResult.reason);
      newErrors.cashPosition = "No se pudo cargar la posición de caja.";
      setTreasuryCashPositions([]);
    }

    // ── Movimientos manuales ────────────────────────────────────────────────
    if (manualResult.status === "fulfilled") {
      const manualJson = (await manualResult.value.json().catch(() => null)) as {
        ok?: boolean;
        data?: { items?: ManualCashMovement[] };
      } | null;
      if (manualResult.value.ok && manualJson?.ok && manualJson.data?.items) {
        setManualCashMovements(manualJson.data.items);
      } else {
        setManualCashMovements([]);
      }
    } else {
      devWarn("treasury-manual-movements", manualResult.reason);
      newErrors.manualMovements = "No se pudo cargar los movimientos manuales.";
      setManualCashMovements([]);
    }

    setSectionErrors(newErrors);

    // Only set global error if the primary data source (hub) failed —
    // secondary section failures are communicated via sectionErrors.
    if (newErrors.hub) {
      setError("No se pudo cargar el resumen del negocio. Intentá de nuevo.");
    }

    setLoading(false);
  }, [confirmedPeriod]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
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
        title={HOY_PAGE.title}
        description={HOY_PAGE.description}
      />
      <HoyPageView
        loading={loading}
        today={today}
        snapshot={snapshot}
        portfolioRows={portfolioRows}
        portfolioDetails={portfolioDetails ?? undefined}
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
        sectionErrors={sectionErrors}
        onRefresh={load}
      />
    </div>
  );
}
