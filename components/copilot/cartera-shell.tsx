"use client";

/**
 * CarteraShell
 * ------------
 * Cliente delgado que cablea:
 *  - useFinancialReconciliation (fetch del reporte real desde el backend).
 *  - FinancialControlBar (UI de control sticky).
 *  - ExecutiveSummaryCards + ReconciliationCenter (Bloques 3 y 4).
 *  - Placeholder temporal para Bloque 5+ (aging / explorer / explainability).
 *
 * No realiza ningún recálculo financiero. Solo:
 *  - Mantiene estado UI (rango confirmado, refresh tick).
 *  - Pasa el reporte intacto a los componentes hijos.
 *  - Muestra skeletons reales mientras `loading && !report`.
 *  - Si hay un reporte previo y se está re-fetcheando, mantiene el contenido y
 *    deja al control bar mostrar el spinner (evita flicker entre estados).
 *
 * Decisiones de UX (mayo 2026):
 *  - `mode` queda fijo en `period_only`. El selector visible "Todo el historial"
 *    fue removido porque año + rango de fechas cubren todos los casos operativos
 *    y la opción histórica generaba confusión.
 *  - La pantalla no hace fetch al montar. El usuario debe confirmar un rango
 *    Desde/Hasta para habilitar el hook y cargar el reporte.
 *  - Al montar, Desde/Hasta se precargan con mes actual â†’ hoy (calendario local).
 *    El fetch sigue requiriendo Confirmar; el usuario no debe tipear fechas.
 */

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { AlertOctagon, Info, X } from "lucide-react";
import { getCurrentMonthToTodayRange } from "@/lib/copilot-date-range-defaults";
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
import {
  ExecutiveSummaryCards,
  CreditNotesSection,
} from "@/components/copilot/executive-summary-cards";
import {
  AgingAnalytics,
} from "@/components/copilot/aging-analytics";
import { ClientDebtExplorer } from "@/components/copilot/client-debt-explorer";
import { CollapsibleSection } from "@/components/copilot/collapsible-section";
import { CopilotDataProvenanceStrip } from "@/components/copilot/copilot-data-provenance-strip";
import { CopilotPremiumEmptyState } from "@/components/copilot/copilot-premium-empty-state";

function normalizeDateInput(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

export function CarteraShell() {
  const searchParams = useSearchParams();
  const overdueFilter = searchParams.get("filter") === "overdue";

  const initialMonthRange = useMemo(() => getCurrentMonthToTodayRange(), []);
  const [periodStart, setPeriodStart] = useState<string | null>(initialMonthRange.from);
  const [periodEnd, setPeriodEnd] = useState<string | null>(initialMonthRange.to);
  const [draftStart, setDraftStart] = useState(initialMonthRange.from);
  const [draftEnd, setDraftEnd] = useState(initialMonthRange.to);
  const [confirmedDraftStart, setConfirmedDraftStart] = useState(initialMonthRange.from);
  const [confirmedDraftEnd, setConfirmedDraftEnd] = useState(initialMonthRange.to);
  const [hasConfirmedRange, setHasConfirmedRange] = useState(true);
  // Dismissal keyed por período confirmado: se resetea automáticamente al cambiar rango
  const [dismissedPreSyncPeriod, setDismissedPreSyncPeriod] = useState<string | null>(null);
  const [dismissedRowCapPeriod, setDismissedRowCapPeriod] = useState<string | null>(null);

  const { report, meta, loading, error, refetch } = useFinancialReconciliation({
    mode: "period_only",
    periodStart,
    periodEnd,
    enabled: hasConfirmedRange,
  });

  const isPreSync =
    !!periodStart && periodStart < COPILOT_OPERATIONAL_START_DATE;

  // Clave única del período confirmado para comparar dismissals
  const confirmedPeriodKey =
    periodStart && periodEnd ? `${periodStart}|${periodEnd}` : null;
  const preSyncDismissed =
    dismissedPreSyncPeriod !== null && dismissedPreSyncPeriod === confirmedPeriodKey;
  const rowCapDismissed =
    dismissedRowCapPeriod !== null && dismissedRowCapPeriod === confirmedPeriodKey;

  const isTruncated = meta?.truncated === true;

  // Gap estructural por moneda: emitido - cobrado - pendiente
  // Solo relevante cuando el período incluye facturas pre-sync sin recibos disponibles
  const structuralGaps = useMemo(() => {
    if (!report || !isPreSync) return [] as Array<{ currency: "UYU" | "USD"; amount: number }>;
    const index = buildCurrencyIndex(report.currencies);
    const result: Array<{ currency: "UYU" | "USD"; amount: number }> = [];
    for (const code of (["UYU", "USD"] as const)) {
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
    const nextStart = normalizeDateInput(draftStart);
    const nextEnd = normalizeDateInput(draftEnd);
    if (!nextStart || !nextEnd || nextStart > nextEnd) return;

    setPeriodStart(nextStart);
    setPeriodEnd(nextEnd);
    setConfirmedDraftStart(nextStart);
    setConfirmedDraftEnd(nextEnd);
    setHasConfirmedRange(true);
  }, [draftStart, draftEnd]);

  // Estado: primer fetch sin reporte previo â†’ skeletons reales.
  // Estado: error sin reporte previo â†’ bloque de error.
  // Estado: reporte ya cargado â†’ render principal (mantiene contenido en re-fetch).
  const initialLoading = loading && report === null && error === null;
  const showError = error !== null && report === null;

  const periodRangeLabel =
    periodStart && periodEnd ? formatCarteraPeriodRange(periodStart, periodEnd) : undefined;

  return (
    <>
      <FinancialControlBar
        draftStart={draftStart}
        draftEnd={draftEnd}
        onDraftStartChange={setDraftStart}
        onDraftEndChange={setDraftEnd}
        hasPendingChanges={hasPendingChanges}
        onConfirmDraft={handleConfirmDraft}
        onRefresh={refetch}
        loading={loading}
        canRefresh={hasConfirmedRange}
        syncStates={report?.syncStates}
      />

      {hasConfirmedRange && periodStart && periodEnd ? (
        <CopilotDataProvenanceStrip
          syncStates={report?.syncStates}
          periodFrom={periodStart}
          periodTo={periodEnd}
          className="mb-1"
        />
      ) : null}

      <div className="space-y-4">
        {!hasConfirmedRange ? (
          <>
            <EmptyPeriodState />
            <EmptySummaryPlaceholders />
            <EmptyAgingPlaceholder />
            <EmptyDebtExplorerPlaceholder />
          </>
        ) : initialLoading ? (
          <>
            <EmptySummaryPlaceholders shimmer />
            <EmptyAgingPlaceholder shimmer />
            <EmptyDebtExplorerPlaceholder shimmer />
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
            {/* Bloque A — Ventas del período (arriba, abierto por defecto) */}
            <CollapsibleSection
              id="ventas"
              title="Ventas del período"
              subtitle="Facturación y cobros del rango seleccionado"
              defaultOpen
            >
              <ExecutiveSummaryCards
                report={report}
                selectedCurrency="all"
                isPreSync={isPreSync}
                block="ventas"
                periodRangeLabel={periodRangeLabel}
              />
              <CreditNotesSection
                report={report}
                selectedCurrency="all"
                periodRangeLabel={periodRangeLabel}
              />
            </CollapsibleSection>

            {/* Bloque — Resumen financiero (cobrado aplicado + saldo pendiente) */}
            <CollapsibleSection
              id="summary"
              title="Resumen financiero"
              subtitle="Cobros aplicados y deuda actual total"
              defaultOpen
            >
              <ExecutiveSummaryCards
                report={report}
                selectedCurrency="all"
                isPreSync={isPreSync}
                block="executive"
                periodRangeLabel={periodRangeLabel}
              />
              <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
                {FINANCIAL_UX_COPY.carteraResumenFinancieroHelp}
              </p>
            </CollapsibleSection>

            {/* Bloque B — Cobranza y deuda activa */}
            <CollapsibleSection
              id="cobranza"
              title="Cobranza"
              subtitle="Deuda actual total, incluyendo saldos anteriores arrastrados"
              defaultOpen
            >
              <ExecutiveSummaryCards
                report={report}
                selectedCurrency="all"
                isPreSync={isPreSync}
                block="cobranza"
              />
              {structuralGaps.length > 0 && (
                <HistoricalGapNote gaps={structuralGaps} />
              )}
              <CollapsibleSection
                id="aging"
                title="Antigüedad de cartera"
                subtitle="Deuda viva agrupada por antigüedad · todos los saldos activos al día de hoy"
                defaultOpen={false}
                variant="secondary"
              >
                <AgingAnalytics report={report} selectedCurrency="all" />
              </CollapsibleSection>
              <CollapsibleSection
                id="explorador"
                title="Explorador de deuda"
                subtitle="Clientes con deuda activa al día de hoy · no limitado al rango seleccionado"
                defaultOpen={overdueFilter}
                variant="secondary"
              >
                <ClientDebtExplorer
                  report={report}
                  selectedCurrency="all"
                  initialFilterChip={overdueFilter ? "overdue" : "all"}
                />
              </CollapsibleSection>
            </CollapsibleSection>

          </>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyPeriodState() {
  const reduce = useReducedMotion();
  return (
    <motion.section
      aria-label="Seleccione un período"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <CopilotPremiumEmptyState
        title="Elegí un período para ver Cartera"
        why="Cartera muestra ventas, cobros y deuda del rango que confirmes arriba."
        whatToDo="Revisá Desde/Hasta y tocá Confirmar — ya precargamos el mes actual."
        whatHappens="Al confirmar, vas a ver KPIs, antigüedad de deuda y el explorador de clientes."
      />
    </motion.section>
  );
}

function EmptySummaryPlaceholders({ shimmer = false }: { shimmer?: boolean }) {
  const cards = [
    "Deuda actual UYU",
    "Deuda actual USD",
    "Ventas del período UYU",
    "Ventas del período USD",
    "% cobranza registrada UYU",
    "% cobranza registrada USD",
    "Clientes en riesgo",
    "Clientes por revisar",
  ];

  return (
    <section
      aria-label="Resumen ejecutivo sin datos"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((title) => (
        <article
          key={title}
          className={`rounded-2xl border p-5 shadow-[var(--copilot-shadow)] ${neutralFinancialCardClass}`}
        >
          <div className="mb-4 flex items-center gap-2.5">
            <PlaceholderBlock className="h-8 w-8 rounded-lg" shimmer={shimmer} />
            <p className={`truncate ${subtleLabelClass}`}>
              {title}
            </p>
          </div>
          <p className="text-2xl font-semibold leading-tight tabular-nums text-[var(--copilot-ink-muted)]">
            —
          </p>
          <p className="mt-1.5 text-sm text-[var(--copilot-ink-muted)]">
            Sin período confirmado
          </p>
        </article>
      ))}
    </section>
  );
}

function EmptyAgingPlaceholder({ shimmer = false }: { shimmer?: boolean }) {
  return (
    <section className={`rounded-2xl border shadow-[var(--copilot-shadow)] ${neutralFinancialCardClass}`}>
      <header className="border-b border-[var(--copilot-border)] px-5 py-4">
        <h3 className="text-base font-semibold tracking-tight text-[var(--copilot-ink)]">
          Antigüedad de cartera
        </h3>
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
          Sin período confirmado · montos y porcentajes pendientes
        </p>
      </header>
      <div className="space-y-3 p-5">
        {["0-30 días", "31-60 días", "61-90 días", "+90 días"].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55 p-3.5"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
                {label}
              </span>
              <span className="text-[10px] font-semibold text-[var(--copilot-ink-muted)]">—</span>
            </div>
            <PlaceholderBlock className="mb-3 h-2.5 w-full rounded-full" shimmer={shimmer} />
            <div className="flex gap-4 text-[12px] text-[var(--copilot-ink-muted)]">
              <span>—</span>
              <span>— fact.</span>
              <span>— clientes</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyDebtExplorerPlaceholder({ shimmer = false }: { shimmer?: boolean }) {
  return (
    <section className={`rounded-2xl border shadow-[var(--copilot-shadow)] ${neutralFinancialCardClass}`}>
      <header className="border-b border-[var(--copilot-border)] px-5 py-4">
        <h3 className="text-base font-semibold tracking-tight text-[var(--copilot-ink)]">
          Explorador de deuda
        </h3>
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
          La tabla se cargará después de confirmar un rango.
        </p>
      </header>
      <div className="space-y-2 p-5">
        {[0, 1, 2].map((i) => (
          <PlaceholderBlock key={i} className="h-10 w-full rounded-lg" shimmer={shimmer} />
        ))}
      </div>
    </section>
  );
}

function PlaceholderBlock({
  className = "",
  shimmer,
}: {
  className?: string;
  shimmer: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative overflow-hidden bg-[rgba(44,40,37,0.06)] ${className}`}>
      {shimmer && !reduce ? (
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banners contextuales
// ---------------------------------------------------------------------------

function PreSyncBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm text-amber-950 ${warningFinancialCardClass}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-amber-700">
          <Info className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <p className="font-semibold">{FINANCIAL_UX_COPY.preSyncBannerTitle}</p>
          <p className="text-[13px] text-amber-800/80">{FINANCIAL_UX_COPY.preSyncBannerBody}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="mt-0.5 shrink-0 text-amber-600 transition-colors hover:text-amber-900"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function RowCapBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm text-amber-950 ${warningFinancialCardClass}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-amber-700">
          <Info className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <p className="font-semibold">{FINANCIAL_UX_COPY.rowCapWarningTitle}</p>
          <p className="text-[13px] text-amber-800/80">{FINANCIAL_UX_COPY.rowCapWarningBody}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="mt-0.5 shrink-0 text-amber-600 transition-colors hover:text-amber-900"
      >
        <X className="h-4 w-4" aria-hidden />
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
    <div className={`${softCalloutClass} flex flex-wrap items-center gap-x-5 gap-y-1 px-3 text-[11px] text-[var(--copilot-ink-muted)]/70`}>
      {gaps.map(({ currency, amount }) => (
        <span key={currency} className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
          <span>
            <span className="font-semibold">Δ sin reconciliar {currency}:</span>{" "}
            {formatCarteraMoney(currency, amount)} — pagos anteriores al inicio de
            sincronización (2026-01-01) no disponibles en el sistema
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error block
// ---------------------------------------------------------------------------

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="alert"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`flex flex-col items-start gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${dangerFinancialCardClass}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
          <AlertOctagon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
            No se pudo cargar la cartera
          </p>
          <p className="mt-1 text-sm text-rose-900/90">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center rounded-lg border border-rose-300/70 bg-[var(--copilot-card-bg)]/80 px-3 text-xs font-semibold text-rose-800 shadow-sm transition hover:bg-[var(--copilot-panel-bg)]"
      >
        Reintentar
      </button>
    </motion.div>
  );
}
