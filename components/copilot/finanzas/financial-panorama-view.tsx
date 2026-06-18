"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { FinancialMetricDetailDialog } from "@/components/copilot/finanzas/financial-metric-detail-dialog";
import {
  FinancialCeoCollectionRiskSummary,
  FinancialCeoSections,
} from "@/components/copilot/finanzas/financial-ceo-sections";
import {
  FinancialCollectionRisk,
  FinancialExecutiveSummary,
  FinancialProjectionCompact,
} from "@/components/copilot/finanzas/financial-layered-sections";
import { FINANCIAL_UX_COPY, FINANZAS_COPY } from "@/lib/copilot-financial-ux-copy";
import { useFinancialReconciliation } from "@/hooks/use-financial-reconciliation";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import { getProtoInvoices, getProtoReceipts } from "@/lib/copilot-data";
import {
  buildPanoramaMetricDetail,
  type PanoramaMetricId,
} from "@/lib/copilot-financial-panorama-details";
import { buildFinancialExecutiveDashboard } from "@/lib/copilot-financial-executive-dashboard";
import type { PanoramaCurrencySlice } from "@/lib/copilot-financial-panorama-model";
import {
  financialEngineLocalTodayYmd,
  getFinancialSnapshot,
  type FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";
import { defaultHoyPeriodRange, formatHoyPeriodLabel } from "@/lib/copilot-hoy-period";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import { parseTreasuryScheduledSummaryJson } from "@/lib/treasury/treasury-api-parse";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import {
  buildFinanzasCanonicalState,
  type FinanzasCanonicalCurrencyState,
} from "@/lib/copilot-finanzas-canonical-state";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

const ESTADO_ACTUAL_METRICS: {
  label: string;
  getValue: (s: FinanzasCanonicalCurrencyState) => number;
}[] = [
  { label: "Caja disponible", getValue: (s) => s.availableCash },
  { label: "Total pendiente", getValue: (s) => s.pendingReceivables },
  { label: "Deuda vencida", getValue: (s) => s.overdueReceivables },
  { label: "Pagos próximos 30d", getValue: (s) => s.scheduledPayments30d },
];

function EstadoActualSection({ state }: { state: FinanzasCanonicalCurrencyState[] }) {
  if (state.length === 0) return null;
  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Estado actual"
        subtitle="Misma fuente que Hoy · Tesorería · Cartera. Sin mezcla de monedas."
      />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ESTADO_ACTUAL_METRICS.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] p-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {metric.label}
            </p>
            <div className="mt-1 space-y-0.5">
              {state.map((s) => (
                <p key={s.currency} className="text-sm font-semibold text-[var(--copilot-ink)]">
                  {fmtCurrencyAmount(metric.getValue(s), s.currency)}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CopilotCard>
  );
}

function CurrencyProjectionBlock({ s }: { s: FinanzasCanonicalCurrencyState }) {
  const safeCashNegative = s.safeCash30d < 0;
  const expectedCashPositive = s.expectedCash30d >= 0;

  const msgs: { tone: "ok" | "warn" | "danger"; text: string }[] = [];
  if (safeCashNegative) {
    msgs.push({
      tone: "danger",
      text: `Con la caja actual no alcanza para cubrir los pagos de los próximos 30 días en ${s.currency}. Faltan ${fmtCurrencyAmount(Math.abs(s.safeCash30d), s.currency)}.`,
    });
  }
  msgs.push(
    expectedCashPositive
      ? { tone: "ok", text: "Si cobrás lo pendiente, la caja proyectada queda positiva." }
      : { tone: "warn", text: "Aun cobrando lo pendiente, la caja proyectada queda negativa." }
  );

  return (
    <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {s.currency === "UYU" ? "Pesos uruguayos (UYU)" : "Dólares (USD)"}
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Caja actual</span>
          <span className="font-medium text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(s.availableCash, s.currency)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">+ Cobros pendientes</span>
          <span className="font-medium text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(s.pendingReceivables, s.currency)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">− Pagos próximos</span>
          <span className="font-medium text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(s.scheduledPayments30d, s.currency)}
          </span>
        </div>
        <div className="flex justify-between gap-2 border-t border-[var(--copilot-border)] pt-1.5">
          <span className="font-semibold text-[var(--copilot-ink)]">= Caja proyectada</span>
          <span
            className={`font-bold ${s.expectedCash30d < 0 ? "text-red-600 dark:text-red-400" : "text-[var(--copilot-ink)]"}`}
          >
            {fmtCurrencyAmount(s.expectedCash30d, s.currency)}
          </span>
        </div>
        <div className="border-t border-[var(--copilot-border)]/50 pt-1.5">
          <p className="mb-1 text-[11px] text-[var(--copilot-ink-muted)]">Solo con caja actual</p>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--copilot-ink-muted)]">Caja restante sin cobrar</span>
            <span
              className={`font-medium ${s.safeCash30d < 0 ? "text-red-600 dark:text-red-400" : "text-[var(--copilot-ink)]"}`}
            >
              {fmtCurrencyAmount(s.safeCash30d, s.currency)}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {msgs.map((msg, i) => (
          <p
            key={i}
            className={`rounded-md px-3 py-2 text-xs ${
              msg.tone === "danger"
                ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                : msg.tone === "warn"
                  ? "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]"
                  : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
            }`}
          >
            {msg.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function CajaProyectadaSection({ state }: { state: FinanzasCanonicalCurrencyState[] }) {
  if (state.length === 0) return null;
  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Caja proyectada (30 días)"
        subtitle="Caja actual + cobros pendientes − pagos próximos."
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {state.map((s) => (
          <CurrencyProjectionBlock key={s.currency} s={s} />
        ))}
      </div>
    </CopilotCard>
  );
}

type MetricSelection =
  | { kind: "slice"; metricId: PanoramaMetricId; slice: PanoramaCurrencySlice }
  | { kind: "cash"; currency: "UYU" | "USD" };

function FinanzasPanoramaSkeleton() {
  const blockClass =
    "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/40 p-4 animate-pulse";
  const lineClass = "h-3 rounded bg-[var(--copilot-border)]/40";
  return (
    <div
      role="status"
      aria-label="Cargando panorama financiero"
      className="space-y-4"
    >
      <div className={blockClass}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Foto actual
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-[var(--copilot-border)]/50 p-3">
              <div className={`${lineClass} w-2/3`} />
              <div className={`${lineClass} w-3/4 h-5`} />
            </div>
          ))}
        </div>
      </div>
      <div className={blockClass}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Facturación anual
        </p>
        <div className={`mt-3 ${lineClass} w-full h-16`} />
      </div>
      <div className={blockClass}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Clientes que explican la deuda
        </p>
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${lineClass} w-full`} />
          ))}
        </div>
      </div>
      <div className={blockClass}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Caja proyectada
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={`${lineClass} h-20`} />
          <div className={`${lineClass} h-20`} />
        </div>
      </div>
      <span className="sr-only">Cargando panorama financiero…</span>
    </div>
  );
}

export function FinancialPanoramaView() {
  const today = financialEngineLocalTodayYmd();
  const period = useMemo(() => defaultHoyPeriodRange(today), [today]);
  const periodLabel = formatHoyPeriodLabel(period);

  const reconciliation = useFinancialReconciliation({
    mode: "period_only",
    periodStart: period.from,
    periodEnd: period.to,
    enabled: true,
  });

  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [cashPositions, setCashPositions] = useState<CashPositionByCurrency[]>([]);
  const [treasurySummaries, setTreasurySummaries] = useState<TreasuryOutflowSummary[]>([]);
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioRow[]>([]);
  const [invoices, setInvoices] = useState<DataRow[]>([]);
  const [receipts, setReceipts] = useState<DataRow[]>([]);
  const [metricSelection, setMetricSelection] = useState<MetricSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSnapshotLoading(true);
      try {
        const s = await getFinancialSnapshot();
        if (!cancelled) setSnapshot(s);
      } catch (e) {
        if (!cancelled) {
          setSnapshot(null);
          setSnapshotError(e instanceof Error ? e.message : "Error al cargar proyección");
        }
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void copilotApiFetch("/api/copilot/treasury/cash-position")
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: { positions?: CashPositionByCurrency[] };
        } | null;
        if (!cancelled && json?.ok && json.data?.positions) {
          setCashPositions(json.data.positions);
        }
      })
      .catch(() => {
        if (!cancelled) setCashPositions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void copilotApiFetch("/api/copilot/treasury/scheduled-payments?include_summary=1")
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!cancelled) {
          setTreasurySummaries(parseTreasuryScheduledSummaryJson(json));
        }
      })
      .catch(() => {
        if (!cancelled) setTreasurySummaries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchClientPortfolioLoad()
      .then((p) => {
        if (!cancelled) setPortfolioRows(p.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setPortfolioRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getProtoInvoices("active"), getProtoReceipts("active")])
      .then(([inv, rec]) => {
        if (!cancelled) {
          setInvoices(inv);
          setReceipts(rec);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvoices([]);
          setReceipts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && reconciliation.error) {
      console.warn(
        "[FinancialPanoramaView] reconciliation error",
        reconciliation.errorCode,
        reconciliation.error
      );
    }
  }, [reconciliation.error, reconciliation.errorCode]);

  const metricsByCode = useMemo(() => {
    if (!reconciliation.report) return {};
    const index = buildCurrencyIndex(reconciliation.report.currencies);
    const out: Partial<Record<"UYU" | "USD", import("@/lib/copilot-cartera-cards-source").NormalizedCurrencyMetrics>> = {};
    const uyu = index.get("UYU");
    const usd = index.get("USD");
    if (uyu) out.UYU = uyu;
    if (usd) out.USD = usd;
    return out;
  }, [reconciliation.report]);

  const dashboard = useMemo(() => {
    if (!reconciliation.report) return null;
    return buildFinancialExecutiveDashboard({
      periodLabel,
      asOfYmd: today,
      metricsByCode,
      agingByCurrency: reconciliation.report.agingByCurrency,
      snapshot,
      cashPositions,
      portfolioRows,
      fiscal: {
        upcomingCount: 0,
        overdueCount: 0,
        paidCount: 0,
        estimated30: 0,
        isEmpty: true,
      },
      invoices,
      receipts,
      treasurySummaries,
    });
  }, [
    reconciliation.report,
    periodLabel,
    today,
    metricsByCode,
    snapshot,
    cashPositions,
    portfolioRows,
    invoices,
    receipts,
    treasurySummaries,
  ]);

  const metricDetail = useMemo(() => {
    if (!metricSelection || !dashboard) return null;
    const { panorama: model } = dashboard;
    const detailContext = {
      period,
      metrics: undefined as import("@/lib/copilot-cartera-cards-source").NormalizedCurrencyMetrics | undefined,
    };
    if (metricSelection.kind === "cash") {
      const pos = cashPositions.find((p) => p.currency === metricSelection.currency);
      detailContext.metrics = metricsByCode[metricSelection.currency];
      return buildPanoramaMetricDetail({
        metricId: "cash",
        currency: metricSelection.currency,
        cashPosition: pos,
        projection: model.projection,
        context: detailContext,
      });
    }
    detailContext.metrics = metricsByCode[metricSelection.slice.code];
    return buildPanoramaMetricDetail({
      metricId: metricSelection.metricId,
      slice: metricSelection.slice,
      agingBuckets: reconciliation.report?.agingByCurrency?.[metricSelection.slice.code],
      projection: model.projection,
      context: detailContext,
    });
  }, [metricSelection, dashboard, cashPositions, reconciliation.report, period, metricsByCode]);

  const canonicalState = useMemo(
    () =>
      buildFinanzasCanonicalState({
        cashPositions,
        treasurySummaries,
        portfolioRows,
      }),
    [cashPositions, treasurySummaries, portfolioRows]
  );

  const loading = reconciliation.loading || snapshotLoading;
  const error = reconciliation.error ?? snapshotError;

  if (loading && !dashboard) {
    return <FinanzasPanoramaSkeleton />;
  }

  if (error && !dashboard) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-4 py-3 text-sm text-[var(--copilot-warning-text-strong)]">
        <span className="flex-1">{error}</span>
        <button
          type="button"
          onClick={reconciliation.refetch}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1 text-xs font-medium text-[var(--copilot-warning-text)] hover:bg-[var(--copilot-panel-bg)]"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Reintentar
        </button>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <CopilotCard>
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          No hay datos suficientes para el período seleccionado.
        </p>
      </CopilotCard>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <EstadoActualSection state={canonicalState} />

        <CajaProyectadaSection state={canonicalState} />

        <FinancialExecutiveSummary
          dashboard={dashboard}
          onSelectMetric={(metricId, slice) =>
            setMetricSelection({ kind: "slice", metricId, slice })
          }
        />

        <FinancialCeoSections
          invoices={invoices as unknown as Parameters<typeof FinancialCeoSections>[0]["invoices"]}
          portfolioRows={portfolioRows as unknown as Parameters<typeof FinancialCeoSections>[0]["portfolioRows"]}
          year={new Date().getUTCFullYear()}
        />

        <CopilotCard>
          <CopilotSectionTitle
            title="Caja proyectada próximos 30 días"
            subtitle={FINANCIAL_UX_COPY.projection30Subtitle}
          />
          <FinancialProjectionCompact model={dashboard.panorama} embedded />
        </CopilotCard>

        <CopilotCard>
          <CopilotSectionTitle
            title={FINANZAS_COPY.collectionRiskTitle}
            subtitle={FINANZAS_COPY.collectionRiskSubtitle}
          />
          <FinancialCeoCollectionRiskSummary
            portfolioRows={portfolioRows as unknown as Parameters<typeof FinancialCeoCollectionRiskSummary>[0]["portfolioRows"]}
          />
          <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
            <FinancialCollectionRisk panels={dashboard.currencies} embedded />
          </div>
        </CopilotCard>
      </div>

      <FinancialMetricDetailDialog
        detail={metricDetail}
        isOpen={metricSelection != null}
        onClose={() => setMetricSelection(null)}
      />
    </>
  );
}
