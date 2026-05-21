"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, XCircle } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import {
  buildTodayBusinessPulse,
  type AttentionClientsSummary,
  type BusinessPulseGate,
  type CarteraPeriodMetrics,
  type DebtorCollectionRow,
} from "@/lib/copilot-today-business-pulse";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";

import { AttentionClientsDrawer } from "./hoy-attention-clients-drawer";
import { ClientsWithDebtSection } from "./hoy-clients-with-debt-section";
import { CurrencyExecutiveCard } from "./hoy-currency-executive-card";
import { HoyDrawer } from "./hoy-drawer";
import { HoyCashCurrentSection } from "./hoy-cash-current-section";
import { HoyProjection30dSection } from "./hoy-projection-30d-section";
import { AttentionFollowUpStrip, PulseHero } from "./hoy-pulse-hero";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

type HoyPageViewProps = {
  loading: boolean;
  snapshot: FinancialSnapshotApiV1 | null;
  portfolioRows: ClientPortfolioLoad["rows"] | null;
  gate: BusinessPulseGate;
  carteraAgingOverdue?: CarteraCurrencyTotals;
  carteraAgingCurrent?: CarteraCurrencyTotals;
  carteraOpeningByCurrency?: CarteraCurrencyTotals;
  carteraPeriodMetrics?: CarteraPeriodMetrics;
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
    <div className="flex-1 space-y-5 overflow-auto px-6 py-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function HoyPageView({
  loading,
  snapshot,
  portfolioRows,
  gate,
  carteraAgingOverdue,
  carteraAgingCurrent,
  carteraOpeningByCurrency,
  carteraPeriodMetrics,
  treasuryOutflowSummaries,
  treasuryCashPositions,
  error,
  onRefresh,
}: HoyPageViewProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });
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
        carteraOpeningByCurrency,
        carteraPeriodMetrics,
        treasuryOutflowSummaries,
        treasuryCashPositions,
      }),
    [
      snapshot,
      portfolioRows,
      gate,
      carteraAgingOverdue,
      carteraAgingCurrent,
      carteraOpeningByCurrency,
      carteraPeriodMetrics,
      treasuryOutflowSummaries,
      treasuryCashPositions,
    ]
  );

  const dataNotice = pulse.dataWarning ?? null;

  const expandDebtorsOnPage = () => {
    setDebtorsExpanded(true);
    setDrawer({ kind: "closed" });
    requestAnimationFrame(() => {
      debtorsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex-1 px-6 py-6">
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
      <div className="flex-1 space-y-5 overflow-auto px-6 py-6">
        <PulseHero
          status={pulse.overallStatus}
          headline={pulse.headline}
          subline={pulse.heroSubline}
          dataNotice={dataNotice}
          onRefresh={onRefresh}
        />

        {pulse.currencyBlocks.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {pulse.currencyBlocks.map((block) => (
              <CurrencyExecutiveCard key={block.currency} block={block} />
            ))}
          </div>
        ) : (
          <CopilotCard>
            <p className="text-sm text-[var(--copilot-ink-muted)]">
              Sin actividad financiera por moneda para mostrar.
            </p>
          </CopilotCard>
        )}

        <HoyCashCurrentSection blocks={pulse.cashPositionBlocks} />

        <HoyProjection30dSection
          blocks={pulse.currencyBlocks}
          cashBlocks={pulse.cashPositionBlocks}
          alerts={pulse.treasuryAlerts}
          configured={pulse.treasuryOutflowsConfigured}
        />

        {pulse.attentionClients.total > 0 ? (
          <AttentionFollowUpStrip
            count={pulse.attentionClients.total}
            onClick={() => setDrawer({ kind: "attention", data: pulse.attentionClients })}
          />
        ) : null}

        <CopilotCard>
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
            {HOY_COPY.debtorsSectionTitle}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            {HOY_COPY.debtorsSectionSubtitle}
          </p>
          <div className="mt-4">
            <ClientsWithDebtSection
              sectionRef={debtorsSectionRef}
              allRows={pulse.allDebtorRows}
              counts={pulse.clientCounts}
              expanded={debtorsExpanded}
              onExpandedChange={setDebtorsExpanded}
              onRowClick={(row) => setDrawer({ kind: "client", row })}
            />
          </div>
        </CopilotCard>

      </div>

      {drawer.kind === "attention" ? (
        <AttentionClientsDrawer
          data={drawer.data}
          onClose={() => setDrawer({ kind: "closed" })}
          onViewAllDebtors={expandDebtorsOnPage}
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
