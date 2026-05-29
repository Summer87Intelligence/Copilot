"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, XCircle } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import {
  buildCockpitView,
  sortDebtorRowsForCockpit,
  topDebtorRowsPerCurrency,
} from "@/lib/copilot-hoy-cockpit-view";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
import { HOY_COCKPIT, HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import {
  buildTodayBusinessPulse,
  type AttentionClientsSummary,
  type BusinessPulseGate,
} from "@/lib/copilot-today-business-pulse";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

import { AttentionClientsDrawer } from "./hoy-attention-clients-drawer";
import { CollectionAgendaHoyCard } from "./collection-agenda-hoy-card";
import { HoyAdvancedDetail } from "./hoy-advanced-detail";
import {
  ClientsWithDebtSection,
  formatMoneySymbolOnly,
} from "./hoy-clients-with-debt-section";
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
  gate: BusinessPulseGate;
  carteraAgingOverdue?: CarteraCurrencyTotals;
  carteraAgingCurrent?: CarteraCurrencyTotals;
  carteraCollectedToDate?: CarteraCurrencyTotals;
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
        <Skeleton className="min-h-[190px]" />
        <Skeleton className="min-h-[190px]" />
        <Skeleton className="min-h-[190px]" />
        <Skeleton className="min-h-[190px]" />
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
        className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-white/70 px-2.5 py-1 font-medium text-amber-700 hover:bg-white"
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
  gate,
  carteraAgingOverdue,
  carteraAgingCurrent,
  carteraCollectedToDate,
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
  treasuryCashPositions,
  error,
  sectionErrors,
  onRefresh,
}: HoyPageViewProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });
  const [cockpitCard, setCockpitCard] = useState<HoyCockpitCardId | null>(null);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setAdvancedExpanded(false);
  }, [pathname]);

  const [debtorsExpanded, setDebtorsExpanded] = useState(false);
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
        periodRange: confirmedPeriod,
        periodReportCurrencies,
        manualCashMovements,
        treasuryOutflowSummaries,
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
      confirmedPeriod,
      periodReportCurrencies,
      manualCashMovements,
      treasuryOutflowSummaries,
      treasuryCashPositions,
      today,
    ]
  );

  const cockpit = useMemo(
    () => buildCockpitView(pulse, carteraAgingOverdue),
    [pulse, carteraAgingOverdue]
  );

  const sortedDebtorRows = useMemo(
    () => sortDebtorRowsForCockpit(pulse.allDebtorRows),
    [pulse.allDebtorRows]
  );

  const scrollToCriticalClients = () => {
    document.getElementById("clientes-criticos")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const topCriticalClients = useMemo(
    () => topDebtorRowsPerCurrency(sortedDebtorRows, 5),
    [sortedDebtorRows]
  );

  const openAttentionDrawer = () => {
    if (pulse.attentionClients.total > 0) {
      setDrawer({ kind: "attention", data: pulse.attentionClients });
    }
  };

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
            className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-rose-700"
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
        <HoyExecutiveSummaryCard
          hero={cockpit.hero}
          attentionClientsCount={pulse.clientCounts.attentionClients}
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

        {sectionErrors && (
          <SectionErrorStrip sectionErrors={sectionErrors} onRefresh={onRefresh} />
        )}

        <HoyQuickInsights insights={cockpit.insights} />

        <CollectionAgendaHoyCard />

        <CopilotCard className="w-full !p-3">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                Clientes que explican el riesgo
              </h2>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {pulse.clientCounts.attentionClients > 0
                  ? `${pulse.clientCounts.debtorClients} con deuda · ${pulse.clientCounts.attentionClients} requieren seguimiento`
                  : HOY_COPY.debtorsSectionSubtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {portfolioRows && portfolioRows.length > 0 ? (
                <DebtorsReportTrigger
                  portfolioRows={portfolioRows}
                  defaultFilters={{ status: "overdue", currency: "all", overdueDays: "all" }}
                  hint="Descargá un reporte filtrado de clientes con deuda."
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--copilot-ink)] hover:bg-white"
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

          {sortedDebtorRows.slice(0, 3).length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {sortedDebtorRows.slice(0, 3).map((row) => (
                <div
                  key={`${row.company_id}-${row.currency}`}
                  className="flex items-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs"
                >
                  <span className="max-w-[120px] truncate font-semibold text-[var(--copilot-ink)]">
                    {row.name}
                  </span>
                  <span className={`tabular-nums ${(row.vencido?.amount ?? 0) > 0 ? "text-rose-700 font-semibold" : "text-amber-700"}`}>
                    {formatMoneySymbolOnly(row.deuda)}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--copilot-ink-muted)]">
                    {row.currency}
                  </span>
                  {(row.vencido?.amount ?? 0) > 0 && (
                    <span className="rounded-full bg-rose-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                      Vencido
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-2">
            <ClientsWithDebtSection
              sectionRef={debtorsSectionRef}
              allRows={sortedDebtorRows}
              counts={pulse.clientCounts}
              expanded={debtorsExpanded}
              onExpandedChange={setDebtorsExpanded}
              highlightRisk
            />
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
            setDebtorsExpanded(true);
            setDrawer({ kind: "closed" });
            debtorsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      ) : null}
    </>
  );
}
