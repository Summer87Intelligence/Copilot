"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, RefreshCw, XCircle } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import { buildCockpitView, sortDebtorRowsForCockpit } from "@/lib/copilot-hoy-cockpit-view";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
import { HOY_COCKPIT, HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import {
  buildTodayBusinessPulse,
  type AttentionClientsSummary,
  type BusinessPulseGate,
  type DebtorCollectionRow,
} from "@/lib/copilot-today-business-pulse";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

import { AttentionClientsDrawer } from "./hoy-attention-clients-drawer";
import { HoyAdvancedDetail } from "./hoy-advanced-detail";
import { ClientsWithDebtSection } from "./hoy-clients-with-debt-section";
import { HoyCompactHero } from "./hoy-compact-hero";
import { HoyDrawer } from "./hoy-drawer";
import { HoyCurrentStateSection } from "./hoy-current-state-section";
import { HoyMoneyCards } from "./hoy-money-cards";
import { HoyPeriodActivitySection } from "./hoy-period-activity-section";
import { HoyPeriodBar } from "./hoy-period-bar";
import { HoyProjection30dSection } from "./hoy-projection-30d-section";
import { HOY_PAGE_SHELL } from "./hoy-layout";
import { HoyQuickInsights } from "./hoy-quick-insights";

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
  onRefresh: () => void;
};

type DrawerState =
  | { kind: "closed" }
  | { kind: "attention"; data: AttentionClientsSummary }
  | { kind: "client"; row: DebtorCollectionRow };

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
  onRefresh,
}: HoyPageViewProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });
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

  const dataNotice = pulse.dataWarning ?? null;

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
        <HoyCompactHero hero={cockpit.hero} dataNotice={dataNotice} />

        <HoyMoneyCards
          moneyAvailable={cockpit.moneyAvailable}
          payments={cockpit.payments}
          afterPayments={cockpit.afterPayments}
          receivables={cockpit.receivables}
        />

        <HoyQuickInsights insights={cockpit.insights} />

        <CopilotCard className="w-full !p-3">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                {HOY_COCKPIT.criticalClients}
              </h2>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {pulse.clientCounts.attentionClients > 0
                  ? `${pulse.clientCounts.attentionClients} con riesgo elevado · ordenados por severidad`
                  : HOY_COPY.debtorsSectionSubtitle}
              </p>
            </div>
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
          <div className="mt-2">
            <ClientsWithDebtSection
              sectionRef={debtorsSectionRef}
              allRows={sortedDebtorRows}
              counts={pulse.clientCounts}
              expanded={debtorsExpanded}
              onExpandedChange={setDebtorsExpanded}
              onRowClick={(row) => setDrawer({ kind: "client", row })}
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
      {drawer.kind === "client" ? (
        <HoyDrawer
          title={drawer.row.name}
          onClose={() => setDrawer({ kind: "closed" })}
          footer={
            <Link
              href={drawer.row.deepLink}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Abrir ficha 360
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Moneda:</span> {drawer.row.currency}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Por cobrar:</span>{" "}
              <span className="font-semibold text-amber-700">{drawer.row.deuda.formatted}</span>
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Vencido:</span>{" "}
              {drawer.row.vencido ? (
                <span className="font-semibold text-rose-700">{drawer.row.vencido.formatted}</span>
              ) : (
                <span className="font-semibold text-emerald-700">Al día</span>
              )}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Antigüedad:</span> {drawer.row.antiguedad}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Motivo:</span> {drawer.row.motivo}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Acción:</span> {drawer.row.accion}
            </p>
          </div>
        </HoyDrawer>
      ) : null}
    </>
  );
}
