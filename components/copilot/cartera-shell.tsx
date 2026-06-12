"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { AlertOctagon, Info, X } from "lucide-react";
import {
  formatPeriodPresetLabel,
  getCurrentMonthToTodayRange,
  resolveCarteraPeriodPresetRange,
  type CarteraPeriodPreset,
} from "@/lib/copilot-date-range-defaults";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { formatCarteraMoney, formatCarteraPeriodRange } from "@/lib/copilot-cartera-format";
import {
  dangerFinancialCardClass,
  neutralFinancialCardClass,
  softCalloutClass,
  subtleLabelClass,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";

import { useFinancialReconciliation } from "@/hooks/use-financial-reconciliation";
import { FinancialControlBar } from "@/components/copilot/financial-control-bar";
import { CarteraCompactKpiGrid } from "@/components/copilot/cartera-compact-kpi-grid";
import { AgingAnalytics } from "@/components/copilot/aging-analytics";
import { ClientDebtExplorer } from "@/components/copilot/client-debt-explorer";
import { CollapsibleSection } from "@/components/copilot/collapsible-section";
import { CopilotDataProvenanceStrip } from "@/components/copilot/copilot-data-provenance-strip";
import { CopilotPremiumEmptyState } from "@/components/copilot/copilot-premium-empty-state";

function normalizeDateInput(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{subtitle}</p>
      ) : null}
    </header>
  );
}

export function CarteraShell() {
  const searchParams = useSearchParams();
  const overdueFilter = searchParams.get("filter") === "overdue";

  const initialMonthRange = useMemo(() => getCurrentMonthToTodayRange(), []);
  const [periodPreset, setPeriodPreset] = useState<CarteraPeriodPreset>("current_month");
  const [periodStart, setPeriodStart] = useState<string | null>(initialMonthRange.from);
  const [periodEnd, setPeriodEnd] = useState<string | null>(initialMonthRange.to);
  const [draftStart, setDraftStart] = useState(initialMonthRange.from);
  const [draftEnd, setDraftEnd] = useState(initialMonthRange.to);
  const [confirmedDraftStart, setConfirmedDraftStart] = useState(initialMonthRange.from);
  const [confirmedDraftEnd, setConfirmedDraftEnd] = useState(initialMonthRange.to);
  const [dismissedPreSyncPeriod, setDismissedPreSyncPeriod] = useState<string | null>(null);
  const [dismissedRowCapPeriod, setDismissedRowCapPeriod] = useState<string | null>(null);

  const { report, meta, loading, error, refetch } = useFinancialReconciliation({
    mode: "period_only",
    periodStart,
    periodEnd,
    enabled: Boolean(periodStart && periodEnd),
  });

  const applyRange = useCallback((from: string, to: string) => {
    const nextStart = normalizeDateInput(from);
    const nextEnd = normalizeDateInput(to);
    if (!nextStart || !nextEnd || nextStart > nextEnd) return;
    setPeriodStart(nextStart);
    setPeriodEnd(nextEnd);
    setDraftStart(nextStart);
    setDraftEnd(nextEnd);
    setConfirmedDraftStart(nextStart);
    setConfirmedDraftEnd(nextEnd);
  }, []);

  const handlePeriodPresetChange = useCallback(
    (preset: CarteraPeriodPreset) => {
      setPeriodPreset(preset);
      const range = resolveCarteraPeriodPresetRange(preset);
      if (range) applyRange(range.from, range.to);
    },
    [applyRange]
  );

  const isPreSync = !!periodStart && periodStart < COPILOT_OPERATIONAL_START_DATE;
  const confirmedPeriodKey =
    periodStart && periodEnd ? `${periodStart}|${periodEnd}` : null;
  const preSyncDismissed =
    dismissedPreSyncPeriod !== null && dismissedPreSyncPeriod === confirmedPeriodKey;
  const rowCapDismissed =
    dismissedRowCapPeriod !== null && dismissedRowCapPeriod === confirmedPeriodKey;
  const isTruncated = meta?.truncated === true;

  const structuralGaps = useMemo(() => {
    if (!report || !isPreSync) return [] as Array<{ currency: "UYU" | "USD"; amount: number }>;
    const index = buildCurrencyIndex(report.currencies);
    const result: Array<{ currency: "UYU" | "USD"; amount: number }> = [];
    for (const code of ["UYU", "USD"] as const) {
      const m = index.get(code);
      if (!m) continue;
      const gap =
        Math.round((m.issuedInPeriod - m.collectedInPeriod - m.pendingAtCutoff) * 100) / 100;
      if (gap > 1) result.push({ currency: code, amount: gap });
    }
    return result;
  }, [report, isPreSync]);

  const hasPendingChanges =
    normalizeDateInput(draftStart) !== normalizeDateInput(confirmedDraftStart) ||
    normalizeDateInput(draftEnd) !== normalizeDateInput(confirmedDraftEnd);

  const handleConfirmDraft = useCallback(() => {
    applyRange(draftStart, draftEnd);
  }, [applyRange, draftStart, draftEnd]);

  const initialLoading = loading && report === null && error === null;
  const showError = error !== null && report === null;

  const periodRangeLabel =
    periodStart && periodEnd ? formatCarteraPeriodRange(periodStart, periodEnd) : undefined;
  const periodLabel =
    periodStart && periodEnd
      ? formatPeriodPresetLabel(periodStart, periodEnd)
      : "Período";

  return (
    <>
      <FinancialControlBar
        periodLabel={periodLabel}
        periodPreset={periodPreset}
        onPeriodPresetChange={handlePeriodPresetChange}
        draftStart={draftStart}
        draftEnd={draftEnd}
        onDraftStartChange={setDraftStart}
        onDraftEndChange={setDraftEnd}
        hasPendingChanges={hasPendingChanges}
        onConfirmDraft={handleConfirmDraft}
        onRefresh={refetch}
        loading={loading}
        canRefresh={Boolean(periodStart && periodEnd)}
        syncStates={report?.syncStates}
      />

      {periodStart && periodEnd ? (
        <CopilotDataProvenanceStrip
          syncStates={report?.syncStates}
          periodFrom={periodStart}
          periodTo={periodEnd}
          className="mb-2"
        />
      ) : null}

      <div className="space-y-4">
        {initialLoading ? (
          <>
            <EmptySummaryPlaceholders shimmer />
            <EmptyAgingPlaceholder shimmer />
          </>
        ) : showError ? (
          <ErrorBlock message={error ?? "Error desconocido"} onRetry={refetch} />
        ) : report ? (
          <>
            {isPreSync && !preSyncDismissed && (
              <PreSyncBanner
                onDismiss={() =>
                  confirmedPeriodKey && setDismissedPreSyncPeriod(confirmedPeriodKey)
                }
              />
            )}
            {isTruncated && !rowCapDismissed && (
              <RowCapBanner
                onDismiss={() =>
                  confirmedPeriodKey && setDismissedRowCapPeriod(confirmedPeriodKey)
                }
              />
            )}

            <section aria-label="Ventas del período">
              <SectionHeading title="Ventas del período" subtitle={periodRangeLabel} />
              <CarteraCompactKpiGrid
                report={report}
                variant="ventas"
                periodRangeLabel={periodRangeLabel}
                isPreSync={isPreSync}
              />
            </section>

            <section aria-label="Resumen financiero">
              <SectionHeading title="Resumen financiero" />
              <CarteraCompactKpiGrid
                report={report}
                variant="resumen"
                isPreSync={isPreSync}
              />
              <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
                {FINANCIAL_UX_COPY.carteraResumenFinancieroHelp}
              </p>
            </section>

            <section aria-label="Antigüedad de cartera">
              <SectionHeading
                title="Antigüedad de cartera"
                subtitle="Estado actual · 0-30 no es crítico · +90 es prioridad"
              />
              <AgingAnalytics report={report} selectedCurrency="all" compact />
            </section>

            <section aria-label="Cobranza">
              <SectionHeading title="Cobranza" />
              <CarteraCompactKpiGrid report={report} variant="cobranza" />
              {structuralGaps.length > 0 && <HistoricalGapNote gaps={structuralGaps} />}
            </section>

            <CollapsibleSection
              id="explorador"
              title="Explorador de deuda"
              subtitle="Lista detallada — duplica Clientes"
              defaultOpen={overdueFilter}
              variant="primary"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  Para gestión diaria, usá la vista de Clientes.
                </p>
                <Link
                  href="/copilot/clientes"
                  className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Ver clientes con deuda →
                </Link>
              </div>
              <ClientDebtExplorer
                report={report}
                selectedCurrency="all"
                initialFilterChip={overdueFilter ? "overdue" : "all"}
              />
            </CollapsibleSection>
          </>
        ) : null}
      </div>
    </>
  );
}

function EmptySummaryPlaceholders({ shimmer = false }: { shimmer?: boolean }) {
  return (
    <section
      aria-label="Cargando cartera"
      className="grid grid-cols-2 gap-2 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`h-16 rounded-xl border ${neutralFinancialCardClass}`}
        >
          {shimmer ? <PlaceholderShimmer /> : null}
        </div>
      ))}
    </section>
  );
}

function EmptyAgingPlaceholder({ shimmer = false }: { shimmer?: boolean }) {
  return (
    <section className={`rounded-xl border ${neutralFinancialCardClass}`}>
      <div className="space-y-2 p-3">
        {["0-30", "31-60", "61-90", "+90"].map((label) => (
          <div key={label} className="h-8 rounded-lg bg-[var(--copilot-soft-bg)]/60">
            {shimmer ? <PlaceholderShimmer /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function PlaceholderShimmer() {
  const reduce = useReducedMotion();
  return reduce ? null : (
    <motion.div
      className="h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
      animate={{ x: ["-100%", "100%"] }}
      transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
    />
  );
}

function PreSyncBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)] ${warningFinancialCardClass}`}
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{FINANCIAL_UX_COPY.preSyncBannerTitle}</p>
          <p className="text-[11px] opacity-90">{FINANCIAL_UX_COPY.preSyncBannerBody}</p>
        </div>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Cerrar" className="shrink-0">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function RowCapBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${warningFinancialCardClass}`}
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{FINANCIAL_UX_COPY.rowCapWarningTitle}</p>
          <p className="text-[11px] opacity-90">{FINANCIAL_UX_COPY.rowCapWarningBody}</p>
        </div>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Cerrar" className="shrink-0">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function HistoricalGapNote({
  gaps,
}: {
  gaps: Array<{ currency: "UYU" | "USD"; amount: number }>;
}) {
  return (
    <div className={`${softCalloutClass} mt-2 flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[10px] text-[var(--copilot-ink-muted)]`}>
      {gaps.map(({ currency, amount }) => (
        <span key={currency}>
          Δ {currency}: {formatCarteraMoney(currency, amount)}
        </span>
      ))}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${dangerFinancialCardClass}`}
    >
      <div className="flex items-start gap-2">
        <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="text-sm">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
      >
        Reintentar
      </button>
    </div>
  );
}
