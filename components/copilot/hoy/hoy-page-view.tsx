"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, XCircle } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { ClientCompanyDetail, ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import { resolveCanonicalActiveDebt, resolveCanonicalOverdueDebt } from "@/lib/financial/canonical-debt-metrics";
import {
  buildCockpitView,
  topDebtorRowsPerCurrency,
} from "@/lib/copilot-hoy-cockpit-view";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
import { HOY_COPY, HOY_UI } from "@/lib/copilot-hoy-ui-contract";
import {
  buildTodayBusinessPulse,
  type AttentionClientsSummary,
  type BusinessPulseGate,
} from "@/lib/copilot-today-business-pulse";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type {
  TreasuryOutflowSummary,
  TreasuryScheduledPayment,
} from "@/lib/treasury/treasury-scheduled-payments";
import { HoyCashCurrentSection } from "./hoy-cash-current-section";
import { HoyMonthEndProjectionSection } from "./hoy-month-end-projection-section";

import { AttentionClientsDrawer } from "./hoy-attention-clients-drawer";
import { CollectionAgendaHoyCard } from "./collection-agenda-hoy-card";
import { HoyAdvancedDetail } from "./hoy-advanced-detail";
import { ClientsWithDebtSection } from "./hoy-clients-with-debt-section";
import {
  HoyCockpitCardDrawer,
  type HoyCockpitCardId,
} from "./hoy-cockpit-card-drawer";
import { HoyExecutiveSummaryCard } from "./hoy-executive-summary-card";
import { HoyCurrentStateSection } from "./hoy-current-state-section";
import { HoyMoneyCards } from "./hoy-money-cards";
import { HoyPeriodActivitySection } from "./hoy-period-activity-section";
import { HoyPeriodBar } from "./hoy-period-bar";
import { HoyProjection30dSection } from "./hoy-projection-30d-section";
import { HOY_PAGE_SHELL } from "./hoy-layout";
import { HoyQuickInsights } from "./hoy-quick-insights";
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import { CopilotDataProvenanceStrip } from "@/components/copilot/copilot-data-provenance-strip";
import { HoyRecommendedActionsSection } from "./hoy-recommended-actions-section";

export type HoySectionErrors = {
  hub?: string;
  carteraCurrentRecon?: string;
  carteraPeriodRecon?: string;
  treasury?: string;
  cashPosition?: string;
  manualMovements?: string;
};

type HoyPageViewProps = {
  loading: boolean;
  today: string;
  snapshot: FinancialSnapshotApiV1 | null;
  portfolioRows: ClientPortfolioLoad["rows"] | null;
  portfolioDetails?: Record<string, ClientCompanyDetail>;
  gate: BusinessPulseGate;
  carteraAgingOverdue?: CarteraCurrencyTotals;
  carteraAgingCurrent?: CarteraCurrencyTotals;
  carteraCollectedToDate?: CarteraCurrencyTotals;
  outstandingReportCurrencies?: unknown;
  periodReportCurrencies: unknown;
  manualCashMovements: readonly ManualCashMovement[];
  confirmedPeriod: HoyPeriodRange;
  draftFrom: string;
  draftTo: string;
  hasPendingPeriodChanges: boolean;
  onDraftFromChange: (v: string) => void;
  onDraftToChange: (v: string) => void;
  onConfirmPeriod: () => void;
  onMonthToDate: () => void;
  onLast30Days: () => void;
  treasuryOutflowSummaries?: TreasuryOutflowSummary[];
  treasuryScheduledPayments?: TreasuryScheduledPayment[];
  treasuryCashPositions?: CashPositionByCurrency[];
  error: string | null;
  sectionErrors?: HoySectionErrors;
  onRefresh: () => void;
};

type DrawerState =
  | { kind: "closed" }
  | { kind: "attention"; data: AttentionClientsSummary };

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[rgba(44,40,37,0.07)] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className={HOY_PAGE_SHELL}>
      <Skeleton className="h-14 w-full" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="min-h-[200px]" />
        <Skeleton className="min-h-[200px]" />
        <Skeleton className="min-h-[200px]" />
        <Skeleton className="min-h-[200px]" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function SectionErrorStrip({
  sectionErrors,
  onRefresh,
}: {
  sectionErrors: HoySectionErrors;
  onRefresh: () => void;
}) {
  const failed = [
    sectionErrors.carteraCurrentRecon,
    sectionErrors.carteraPeriodRecon,
    sectionErrors.treasury,
    sectionErrors.cashPosition,
    sectionErrors.manualMovements,
  ].filter(Boolean);

  if (failed.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
      <span className="flex-1">
        {failed.length === 1
          ? failed[0]
          : `${failed.length} secciones no se pudieron cargar: ${failed.map((m) => m!.replace(/^No se pudo cargar /, "").replace(/\.$/, "")).join(", ")}.`}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-[var(--copilot-card-bg)]/70 px-2.5 py-1 font-medium text-amber-700 hover:bg-[var(--copilot-panel-bg)]"
      >
        <RefreshCw className="h-3 w-3" aria-hidden />
        Reintentar
      </button>
    </div>
  );
}

export function HoyPageView({
  loading,
  today,
  snapshot,
  portfolioRows,
  portfolioDetails,
  gate,
  carteraAgingOverdue,
  carteraAgingCurrent,
  carteraCollectedToDate,
  outstandingReportCurrencies,
  periodReportCurrencies,
  manualCashMovements,
  confirmedPeriod,
  draftFrom,
  draftTo,
  hasPendingPeriodChanges,
  onDraftFromChange,
  onDraftToChange,
  onConfirmPeriod,
  onMonthToDate,
  onLast30Days,
  treasuryOutflowSummaries,
  treasuryScheduledPayments,
  treasuryCashPositions,
  error,
  sectionErrors,
  onRefresh,
}: HoyPageViewProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });
  const [monthEndDrawerOpen, setMonthEndDrawerOpen] = useState(false);
  const [cockpitCard, setCockpitCard] = useState<HoyCockpitCardId | null>(null);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const pathname = usePathname();
  const [advancedPathname, setAdvancedPathname] = useState(pathname);

  if (pathname !== advancedPathname) {
    setAdvancedPathname(pathname);
    setAdvancedExpanded(false);
  }

  const debtorsSectionRef = useRef<HTMLElement>(null);

  const pulse = useMemo(
    () =>
      buildTodayBusinessPulse({
        snapshot,
        portfolioRows: portfolioRows ?? [],
        gate,
        carteraAgingOverdue,
        carteraAgingCurrent,
        carteraCollectedToDate,
        outstandingReportCurrencies,
        periodRange: confirmedPeriod,
        periodReportCurrencies,
        manualCashMovements,
        treasuryOutflowSummaries,
        treasuryScheduledPayments: treasuryScheduledPayments ?? [],
        treasuryCashPositions,
        today,
      }),
    [
      snapshot,
      portfolioRows,
      gate,
      carteraAgingOverdue,
      carteraAgingCurrent,
      carteraCollectedToDate,
      outstandingReportCurrencies,
      confirmedPeriod,
      periodReportCurrencies,
      manualCashMovements,
      treasuryOutflowSummaries,
      treasuryScheduledPayments,
      treasuryCashPositions,
      today,
    ]
  );

  const canonicalDebtTotals = useMemo(() => {
    const rows = portfolioRows ?? [];
    return {
      active: resolveCanonicalActiveDebt({
        outstandingReportCurrencies,
        portfolioRows: rows,
      }),
      overdue: resolveCanonicalOverdueDebt({ portfolioRows: rows }),
    };
  }, [outstandingReportCurrencies, portfolioRows]);

  const cockpit = useMemo(
    () =>
      buildCockpitView(
        pulse,
        canonicalDebtTotals.overdue,
        carteraAgingOverdue ?? { UYU: 0, USD: 0 }
      ),
    [pulse, canonicalDebtTotals.overdue, carteraAgingOverdue]
  );

  const riskDebtorRows = pulse.allDebtorRows;

  const scrollToCriticalClients = () => {
    document.getElementById("clientes-criticos")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const topCriticalClients = useMemo(
    () => topDebtorRowsPerCurrency(pulse.allDebtorRows, 5),
    [pulse.allDebtorRows]
  );

  const openAttentionDrawer = () => {
    if (pulse.attentionClients.total > 0) {
      setDrawer({ kind: "attention", data: pulse.attentionClients });
    }
  };

  const dataLoadedAt = useMemo(() => (loading ? null : new Date()), [loading]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className={HOY_PAGE_SHELL}>
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
          <XCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          {error}
          <button
            type="button"
            onClick={onRefresh}
            className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs font-medium text-rose-700"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={HOY_PAGE_SHELL}>
        <CopilotDataProvenanceStrip
          updatedAt={dataLoadedAt}
          periodFrom={confirmedPeriod.from}
          periodTo={confirmedPeriod.to}
          className="-mt-1 mb-1"
        />

        <HoyExecutiveSummaryCard
          hero={cockpit.hero}
          attentionClientsCount={pulse.clientCounts.attentionClients}
          debtorClientsCount={pulse.clientCounts.debtorClients}
          cashAfterPaymentsCritical={
            cockpit.afterPayments.afterPaymentsAccent === "critical" ||
            pulse.projection30dBlocks.some(
              (b) => b.hasConfiguredPayments && b.safeCash30d < 0
            )
          }
          onScrollToCriticalClients={scrollToCriticalClients}
        />

        <HoyMoneyCards
          moneyAvailable={cockpit.moneyAvailable}
          payments={cockpit.payments}
          afterPayments={cockpit.afterPayments}
          receivables={cockpit.receivables}
          onCardClick={setCockpitCard}
          activeCard={cockpitCard}
        />

        <HoyCashCurrentSection blocks={pulse.cashPositionBlocks} />

        <HoyMonthEndProjectionSection
          scenarioProjections={pulse.monthEndScenarioProjections}
          drawerOpen={monthEndDrawerOpen}
          onOpenDrawer={() => setMonthEndDrawerOpen(true)}
          onCloseDrawer={() => setMonthEndDrawerOpen(false)}
        />

        {sectionErrors && (
          <SectionErrorStrip sectionErrors={sectionErrors} onRefresh={onRefresh} />
        )}

        <HoyQuickInsights insights={cockpit.insights} />

        {HOY_UI.showRecommendedActions && pulse.recommendedActions.length > 0 ? (
          <HoyRecommendedActionsSection actions={pulse.recommendedActions} />
        ) : null}

        <CollectionAgendaHoyCard />

        <CopilotCard className="w-full !p-3">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                {HOY_COPY.debtorsSectionTitle}
              </h2>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {HOY_COPY.debtorsSectionRiskSubtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {portfolioRows && portfolioRows.length > 0 ? (
                <DebtorsReportTrigger
                  portfolioRows={portfolioRows}
                  defaultFilters={{ status: "overdue", currency: "all", overdueDays: "all" }}
                  hint="Descargá un reporte filtrado de clientes con deuda."
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-2.5 py-1 text-xs font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-panel-bg)]"
                />
              ) : null}
              {pulse.attentionClients.total > 0 ? (
                <button
                  type="button"
                  onClick={openAttentionDrawer}
                  className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  {HOY_COPY.attentionStripCta}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-2">
            {riskDebtorRows.length > 0 ? (
              <ClientsWithDebtSection
                sectionRef={debtorsSectionRef}
                allRows={riskDebtorRows}
                highlightRisk
                portfolioDetails={portfolioDetails}
                canonicalTotals={canonicalDebtTotals}
              />
            ) : (
              <p className="py-4 text-center text-sm text-[var(--copilot-ink-muted)]">
                Sin clientes con deuda activa.
              </p>
            )}
          </div>
        </CopilotCard>

        <HoyAdvancedDetail expanded={advancedExpanded} onExpandedChange={setAdvancedExpanded}>
          <HoyPeriodBar
            draftFrom={draftFrom}
            draftTo={draftTo}
            confirmed={confirmedPeriod}
            onDraftFromChange={onDraftFromChange}
            onDraftToChange={onDraftToChange}
            hasPendingChanges={hasPendingPeriodChanges}
            onConfirm={onConfirmPeriod}
            onMonthToDate={onMonthToDate}
            onLast30Days={onLast30Days}
            onRefresh={onRefresh}
            loading={loading}
          />
          <HoyCurrentStateSection blocks={pulse.currentStateBlocks} />
          <HoyPeriodActivitySection
            blocks={pulse.periodActivityBlocks}
            periodRange={pulse.periodRange}
          />
          <HoyProjection30dSection
            blocks={pulse.projection30dBlocks}
            alerts={pulse.treasuryAlerts}
            configured={pulse.treasuryOutflowsConfigured}
            overdueCritical30={carteraAgingOverdue}
          />
        </HoyAdvancedDetail>
      </div>

      {cockpitCard ? (
        <HoyCockpitCardDrawer
          cardId={cockpitCard}
          cockpit={cockpit}
          cashPositionBlocks={pulse.cashPositionBlocks}
          projectionBlocks={pulse.projection30dBlocks}
          currentStateBlocks={pulse.currentStateBlocks}
          treasurySummaries={treasuryOutflowSummaries}
          manualMovements={manualCashMovements}
          topCriticalClients={topCriticalClients}
          onClose={() => setCockpitCard(null)}
          onScrollToCriticalClients={() => {
            setCockpitCard(null);
            scrollToCriticalClients();
          }}
        />
      ) : null}

      {drawer.kind === "attention" ? (
        <AttentionClientsDrawer
          data={drawer.data}
          onClose={() => setDrawer({ kind: "closed" })}
          onViewAllDebtors={() => {
            setDrawer({ kind: "closed" });
            debtorsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      ) : null}
    </>
  );
}
