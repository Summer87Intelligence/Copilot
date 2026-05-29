"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Loader2 } from "lucide-react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
import { FinancialMetricDetailDialog } from "@/components/copilot/finanzas/financial-metric-detail-dialog";
import { FinancialMonthlyTrends } from "@/components/copilot/finanzas/financial-monthly-trends";
import {
  financialCardToneClass,
  metricValueClass,
  softCalloutClass,
  statusBadgeVariants,
  subtleLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { useFinancialReconciliation } from "@/hooks/use-financial-reconciliation";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import { getProtoInvoices, getProtoReceipts } from "@/lib/copilot-data";
import {
  buildPanoramaMetricDetail,
  type PanoramaMetricId,
} from "@/lib/copilot-financial-panorama-details";
import {
  buildFinancialPanoramaModel,
  formatPanoramaRate,
  type FinancialPanoramaModel,
  type PanoramaCurrencySlice,
} from "@/lib/copilot-financial-panorama-model";
import {
  resolveCashSemaphore,
  resolveCollectedSemaphore,
  resolveCreditNotesSemaphore,
  resolveNetIncomeSemaphore,
  resolveOverdueSemaphore,
  resolvePendingSemaphore,
  resolveRiskSemaphore,
  semaphoreBadgeClass,
  type MetricSemaphore,
} from "@/lib/copilot-financial-panorama-semaphore";
import {
  financialEngineLocalTodayYmd,
  getFinancialSnapshot,
  type FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";
import { defaultHoyPeriodRange, formatHoyPeriodLabel } from "@/lib/copilot-hoy-period";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  snapshotExpectedOutflowsTotal,
  snapshotLiquidityBalance,
  snapshotReceivablesRiskWeighted,
} from "@/lib/copilot-financial-snapshot-selectors";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";

function fmt(n: number, currency: "UYU" | "USD" | null = null): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
}

type MetricSelection =
  | { kind: "slice"; metricId: PanoramaMetricId; slice: PanoramaCurrencySlice }
  | { kind: "cash"; currency: "UYU" | "USD" };

function MetricCard({
  label,
  value,
  subcopy,
  tone = "neutral",
  semaphore,
  onClick,
}: {
  label: string;
  value: string;
  subcopy: string;
  tone?: "positive" | "warning" | "danger" | "neutral";
  semaphore?: MetricSemaphore;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={subtleLabelClass}>{label}</p>
        {semaphore ? (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${semaphoreBadgeClass(semaphore.level)}`}
          >
            {semaphore.label}
          </span>
        ) : null}
      </div>
      <p className={`mt-2 text-2xl ${metricValueClass}`}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">{subcopy}</p>
      {onClick ? (
        <p className="mt-2 flex items-center gap-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
          Ver detalle
          <ChevronRight className="h-3 w-3" aria-hidden />
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)] ${financialCardToneClass(tone)}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${financialCardToneClass(tone)}`}>{content}</div>
  );
}

function CurrencyBreakdownTable({ slice }: { slice: PanoramaCurrencySlice }) {
  const rows = [
    { label: "Bruto facturado", value: slice.grossInvoiced },
    { label: "Notas de crédito", value: -slice.creditNotes, negative: true },
    { label: "Neto generado", value: slice.netIncome, bold: true },
    { label: "Cobrado aplicado", value: slice.collectedApplied },
    { label: "Pendiente", value: slice.pending },
    { label: "Vencido", value: slice.overdue },
  ];

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{slice.code}</p>
      <dl className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-[var(--copilot-ink-muted)]">{row.label}</dt>
            <dd
              className={`tabular-nums ${row.bold ? "font-semibold" : ""} ${
                row.negative ? "text-rose-700" : "text-[var(--copilot-ink)]"
              }`}
            >
              {row.negative && row.value !== 0 ? "−" : ""}
              {fmt(Math.abs(row.value), slice.code)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-[var(--copilot-ink-muted)]">
        {formatPanoramaRate(slice.collectionRate)} cobrado del neto ·{" "}
        {formatPanoramaRate(slice.overdueRate)} del pendiente vencido
      </p>
    </div>
  );
}

function PanoramaContent({
  model,
  cashPositions,
  invoices,
  receipts,
  asOfYmd,
  onSelectMetric,
}: {
  model: FinancialPanoramaModel;
  cashPositions: CashPositionByCurrency[];
  invoices: DataRow[];
  receipts: DataRow[];
  asOfYmd: string;
  onSelectMetric: (sel: MetricSelection) => void;
}) {
  const hasMixed = model.currencies.length > 1;
  const primary = model.currencies[0];
  const riskSem = resolveRiskSemaphore(model.risk.level);

  const cashUyu = cashPositions.find((p) => p.currency === "UYU");
  const cashUsd = cashPositions.find((p) => p.currency === "USD");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {model.currencies.map((c) => {
          const sem = resolveNetIncomeSemaphore(c);
          return (
            <MetricCard
              key={`net-${c.code}`}
              label={`Ingresos netos (${c.code})`}
              value={fmt(c.netIncome, c.code)}
              subcopy="Facturación menos notas de crédito."
              tone={sem.tone}
              semaphore={sem}
              onClick={() => onSelectMetric({ kind: "slice", metricId: "net-income", slice: c })}
            />
          );
        })}
        {model.currencies.map((c) => {
          const sem = resolveCollectedSemaphore(c);
          return (
            <MetricCard
              key={`col-${c.code}`}
              label={`Cobrado aplicado (${c.code})`}
              value={fmt(c.collectedApplied, c.code)}
              subcopy="Cobros registrados sobre ventas."
              tone={sem.tone}
              semaphore={sem}
              onClick={() => onSelectMetric({ kind: "slice", metricId: "collected", slice: c })}
            />
          );
        })}
        {model.currencies.map((c) => {
          const sem = resolvePendingSemaphore(c);
          return (
            <MetricCard
              key={`pend-${c.code}`}
              label={`Pendiente (${c.code})`}
              value={fmt(c.pending, c.code)}
              subcopy="Facturas abiertas de clientes."
              tone={sem.tone}
              semaphore={sem}
              onClick={() => onSelectMetric({ kind: "slice", metricId: "pending", slice: c })}
            />
          );
        })}
        {model.currencies.map((c) => {
          const sem = resolveOverdueSemaphore(c);
          return (
            <MetricCard
              key={`ov-${c.code}`}
              label={`Vencido (${c.code})`}
              value={fmt(c.overdue, c.code)}
              subcopy="Parte del pendiente con atraso."
              tone={sem.tone}
              semaphore={sem}
              onClick={() => onSelectMetric({ kind: "slice", metricId: "overdue", slice: c })}
            />
          );
        })}
        {(model.projection.cashTodayUyu !== 0 || cashUyu) ? (
          <MetricCard
            label="Caja disponible (UYU)"
            value={fmt(model.projection.cashTodayUyu, "UYU")}
            subcopy="Dinero disponible actual. No es facturación."
            tone={resolveCashSemaphore(model.projection.cashTodayUyu, model.projection).tone}
            semaphore={resolveCashSemaphore(model.projection.cashTodayUyu, model.projection)}
            onClick={() => onSelectMetric({ kind: "cash", currency: "UYU" })}
          />
        ) : null}
        {(model.projection.cashTodayUsd !== 0 || cashUsd) ? (
          <MetricCard
            label="Caja disponible (USD)"
            value={fmt(model.projection.cashTodayUsd, "USD")}
            subcopy="Dinero disponible actual. No es facturación."
            tone={resolveCashSemaphore(model.projection.cashTodayUsd, model.projection).tone}
            semaphore={resolveCashSemaphore(model.projection.cashTodayUsd, model.projection)}
            onClick={() => onSelectMetric({ kind: "cash", currency: "USD" })}
          />
        ) : null}
        {model.currencies.map((c) =>
          c.creditNotes > 0 ? (
            <MetricCard
              key={`nc-${c.code}`}
              label={`Notas de crédito (${c.code})`}
              value={fmt(c.creditNotes, c.code)}
              subcopy="Anulaciones/descuentos que reducen ingresos."
              tone={resolveCreditNotesSemaphore(c).tone}
              semaphore={resolveCreditNotesSemaphore(c)}
              onClick={() => onSelectMetric({ kind: "slice", metricId: "credit-notes", slice: c })}
            />
          ) : null
        )}
        {primary && primary.creditNotes <= 0 && model.currencies.length === 1 ? (
          <MetricCard
            label={`Notas de crédito (${primary.code})`}
            value={fmt(0, primary.code)}
            subcopy="Sin NC en el período."
            tone="neutral"
            semaphore={{ level: "neutral", label: "Informativo", tone: "neutral" }}
            onClick={() =>
              onSelectMetric({ kind: "slice", metricId: "credit-notes", slice: primary })
            }
          />
        ) : null}
      </div>

      <CopilotCard>
        <CopilotSectionTitle
          title="Indicadores de calidad"
          subtitle="Lecturas rápidas sobre cobranza, riesgo y concentración."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {model.currencies.map((c) => (
            <div key={c.code} className={softCalloutClass}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Cobranza {c.code}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatPanoramaRate(c.collectionRate)}
              </p>
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">cobrado del neto generado</p>
            </div>
          ))}
          {model.currencies.map((c) => (
            <div key={`ovr-${c.code}`} className={softCalloutClass}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Vencido {c.code}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatPanoramaRate(c.overdueRate)}
              </p>
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">del pendiente está vencido</p>
            </div>
          ))}
          <div className={softCalloutClass}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Riesgo financiero
            </p>
            <p className="mt-1">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  riskSem.level === "healthy"
                    ? statusBadgeVariants.stable
                    : riskSem.level === "attention"
                      ? statusBadgeVariants.attention
                      : statusBadgeVariants.critical
                }`}
              >
                {model.risk.label}
              </span>
            </p>
          </div>
          {model.concentration ? (
            <div className={softCalloutClass}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Mayor exposición
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--copilot-ink)]">
                {model.concentration.clientName}
              </p>
              <p className="text-[11px] tabular-nums text-[var(--copilot-ink-muted)]">
                {fmt(model.concentration.amount, model.concentration.currency)} ·{" "}
                {model.concentration.sharePct}% del pendiente {model.concentration.currency}
              </p>
            </div>
          ) : null}
          <div className={softCalloutClass}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Cobertura de caja
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {model.projection.hasOutflows && model.projection.coverageRatio != null
                ? `${model.projection.coverageRatio.toFixed(2)}×`
                : "—"}
            </p>
            <p className="text-[11px] text-[var(--copilot-ink-muted)]">
              {model.projection.hasOutflows
                ? "Caja + cobros esperados vs pagos próximos"
                : "No hay egresos próximos cargados en Tesorería."}
            </p>
          </div>
        </div>
      </CopilotCard>

      <CopilotCard className="border-[rgba(31,107,74,0.18)] bg-[rgba(31,107,74,0.03)]">
        <CopilotSectionTitle
          title="Lectura ejecutiva"
          subtitle={`Período ${model.periodLabel}${hasMixed ? " · UYU y USD por separado" : ""}`}
        />
        <ul className="mt-3 space-y-2">
          {model.executiveLines.map((line) => (
            <li key={line} className="flex gap-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <CopilotPrimaryLink href={model.priorityCta.href} className="shadow-sm">
            {model.priorityCta.label}
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </CopilotPrimaryLink>
          <CopilotGhostLink href="/copilot/cartera">Ver Cartera</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/tesoreria">Ver Tesorería</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/reportes">Reportes</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/datos">Datos</CopilotGhostLink>
        </div>
      </CopilotCard>

      <FinancialMonthlyTrends invoices={invoices} receipts={receipts} asOfYmd={asOfYmd} />

      <CopilotCard>
        <CopilotSectionTitle
          title="Proyección operativa 30 días"
          subtitle="No es caja bancaria ni cierre contable. Usa cobros esperados y pagos programados."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Caja disponible hoy"
            value={
              model.projection.cashTodayUyu > 0 || model.projection.cashTodayUsd > 0
                ? [
                    model.projection.cashTodayUyu > 0 ? fmt(model.projection.cashTodayUyu, "UYU") : null,
                    model.projection.cashTodayUsd > 0 ? fmt(model.projection.cashTodayUsd, "USD") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Consultar Tesorería"
            }
            subcopy="Fuente: Tesorería."
            tone="positive"
          />
          <MetricCard
            label="Cobros esperados"
            value={fmt(model.projection.expectedCollections, null)}
            subcopy="Facturas abiertas ponderadas por probabilidad."
            tone="positive"
          />
          <MetricCard
            label="Pagos próximos"
            value={model.projection.hasOutflows ? fmt(model.projection.upcomingOutflows, null) : "—"}
            subcopy="Operativos + fiscal 30 días."
            tone="warning"
          />
          <MetricCard
            label="Caja estimada 30 días"
            value={fmt(model.projection.estimatedCash30d, null)}
            subcopy="Caja + cobros esperados − pagos próximos."
            tone={model.projection.estimatedCash30d < 0 ? "danger" : "neutral"}
          />
        </div>
        {!model.projection.hasOutflows ? (
          <p className={`mt-4 text-sm text-[var(--copilot-ink-muted)] ${softCalloutClass}`}>
            No hay egresos próximos cargados en Tesorería.
          </p>
        ) : null}
      </CopilotCard>

      {model.currencies.length > 0 ? (
        <div>
          <CopilotSectionTitle
            title="Desglose por moneda"
            subtitle="Bruto − notas de crédito = neto. UYU y USD no se suman."
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {model.currencies.map((c) => (
              <CurrencyBreakdownTable key={c.code} slice={c} />
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
        Lectura operativa basada en datos sincronizados. Para cierre contable formal, validá con el
        contador o export oficial de Zeta.
      </p>
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
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioRow[]>([]);
  const [invoices, setInvoices] = useState<DataRow[]>([]);
  const [receipts, setReceipts] = useState<DataRow[]>([]);
  const [metricSelection, setMetricSelection] = useState<MetricSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshotLoading(true);
    void getFinancialSnapshot()
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch((e) => {
        if (!cancelled) {
          setSnapshot(null);
          setSnapshotError(e instanceof Error ? e.message : "Error al cargar proyección");
        }
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
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

  const model = useMemo(() => {
    if (!reconciliation.report) return null;
    const index = buildCurrencyIndex(reconciliation.report.currencies);
    const metricsByCode: Partial<Record<"UYU" | "USD", import("@/lib/copilot-cartera-cards-source").NormalizedCurrencyMetrics>> = {};
    const uyu = index.get("UYU");
    const usd = index.get("USD");
    if (uyu) metricsByCode.UYU = uyu;
    if (usd) metricsByCode.USD = usd;
    return buildFinancialPanoramaModel({
      periodLabel,
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
    });
  }, [reconciliation.report, periodLabel, snapshot, cashPositions, portfolioRows]);

  const metricDetail = useMemo(() => {
    if (!metricSelection || !model) return null;
    if (metricSelection.kind === "cash") {
      const pos = cashPositions.find((p) => p.currency === metricSelection.currency);
      return buildPanoramaMetricDetail({
        metricId: "cash",
        currency: metricSelection.currency,
        cashPosition: pos,
        projection: model.projection,
      });
    }
    return buildPanoramaMetricDetail({
      metricId: metricSelection.metricId,
      slice: metricSelection.slice,
      agingBuckets: reconciliation.report?.agingByCurrency?.[metricSelection.slice.code],
      projection: model.projection,
    });
  }, [metricSelection, model, cashPositions, reconciliation.report]);

  const loading = reconciliation.loading || snapshotLoading;
  const error = reconciliation.error ?? snapshotError;

  if (loading && !model) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--copilot-ink-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando panorama financiero…
      </div>
    );
  }

  if (error && !model) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        {error}
      </div>
    );
  }

  if (!model) {
    return (
      <CopilotCard>
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          No hay datos suficientes para el período seleccionado. Revisá{" "}
          <Link
            href="/copilot/datos"
            className="font-semibold text-[var(--copilot-accent)] underline-offset-2 hover:underline"
          >
            Datos
          </Link>{" "}
          o la sincronización en Estado del sistema.
        </p>
      </CopilotCard>
    );
  }

  return (
    <>
      {snapshot ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CopilotSeverityBadge severity={snapshot.projected?.risk_band ?? snapshot.risk_level} />
          <span className="text-xs text-[var(--copilot-ink-muted)]">
            Proyección: cobros {fmt(snapshotReceivablesRiskWeighted(snapshot), null)} · pagos{" "}
            {fmt(snapshotExpectedOutflowsTotal(snapshot), null)} · caja est.{" "}
            {fmt(snapshotLiquidityBalance(snapshot), null)}
          </span>
        </div>
      ) : null}
      <PanoramaContent
        model={model}
        cashPositions={cashPositions}
        invoices={invoices}
        receipts={receipts}
        asOfYmd={today}
        onSelectMetric={setMetricSelection}
      />
      <FinancialMetricDetailDialog
        detail={metricDetail}
        isOpen={metricSelection != null}
        onClose={() => setMetricSelection(null)}
      />
    </>
  );
}
