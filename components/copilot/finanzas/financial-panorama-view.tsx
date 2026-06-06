"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { FinancialMetricDetailDialog } from "@/components/copilot/finanzas/financial-metric-detail-dialog";
import { FinancialMonthlyTrends } from "@/components/copilot/finanzas/financial-monthly-trends";
import {
  FinancialAdvancedDetail,
  FinancialCollectionRisk,
  FinancialExecutiveSummary,
  FinancialLayeredHeader,
  FinancialMainComparison,
  FinancialProjectionCompact,
} from "@/components/copilot/finanzas/financial-layered-sections";
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
import type { DataRow } from "@/lib/data/proto-operational-read-repository";

type MetricSelection =
  | { kind: "slice"; metricId: PanoramaMetricId; slice: PanoramaCurrencySlice }
  | { kind: "cash"; currency: "UYU" | "USD" };

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

  const loading = reconciliation.loading || snapshotLoading;
  const error = reconciliation.error ?? snapshotError;

  if (loading && !dashboard) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--copilot-ink-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando panorama financiero…
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        {error}
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
      <div className="space-y-5">
        <FinancialLayeredHeader dashboard={dashboard} />

        <FinancialExecutiveSummary
          dashboard={dashboard}
          onSelectMetric={(metricId, slice) =>
            setMetricSelection({ kind: "slice", metricId, slice })
          }
        />

        <FinancialMainComparison dashboard={dashboard} />

        <FinancialMonthlyTrends
          invoices={invoices}
          receipts={receipts}
          asOfYmd={today}
          executiveView
        />

        <FinancialCollectionRisk panels={dashboard.currencies} />

        <FinancialProjectionCompact model={dashboard.panorama} />

        <FinancialAdvancedDetail dashboard={dashboard} />
      </div>

      <FinancialMetricDetailDialog
        detail={metricDetail}
        isOpen={metricSelection != null}
        onClose={() => setMetricSelection(null)}
      />
    </>
  );
}
