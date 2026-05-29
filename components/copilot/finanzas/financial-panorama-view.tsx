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
  shouldShowProminentSemaphore,
  shouldShowSubtleSemaphore,
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

type MetricTier = "primary" | "secondary" | "tertiary";

function tierCardClass(tier: MetricTier, tone: "positive" | "warning" | "danger" | "neutral"): string {
  const base = `rounded-2xl border ${financialCardToneClass(tone)}`;
  if (tier === "primary") return `${base} border-[rgba(31,107,74,0.22)] p-5 shadow-sm`;
  if (tier === "tertiary") return `${base} border-slate-200/80 bg-slate-50/40 p-3.5 opacity-95`;
  return `${base} p-4 shadow-sm`;
}

function tierValueClass(tier: MetricTier): string {
  if (tier === "primary") return `${metricValueClass} text-3xl`;
  if (tier === "tertiary") return `${metricValueClass} text-xl text-[var(--copilot-ink-muted)]`;
  return `${metricValueClass} text-2xl`;
}

function SemaphoreIndicator({ semaphore }: { semaphore: MetricSemaphore }) {
  if (shouldShowProminentSemaphore(semaphore.level)) {
    return (
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${semaphoreBadgeClass(semaphore.level)}`}
      >
        {semaphore.label}
      </span>
    );
  }
  if (shouldShowSubtleSemaphore(semaphore.level)) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-700/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" aria-hidden />
        Saludable
      </span>
    );
  }
  return null;
}

function MetricCard({
  label,
  value,
  subcopy,
  tone = "neutral",
  semaphore,
  tier = "secondary",
  emphasize = false,
  onClick,
}: {
  label: string;
  value: string;
  subcopy: string;
  tone?: "positive" | "warning" | "danger" | "neutral";
  semaphore?: MetricSemaphore;
  tier?: MetricTier;
  emphasize?: boolean;
  onClick?: () => void;
}) {
  const cardTone = emphasize && tone !== "danger" ? "warning" : tone;
  const cardClass = `${tierCardClass(tier, cardTone)}${emphasize ? " ring-1 ring-rose-200/80" : ""} transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`${subtleLabelClass}${tier === "primary" ? " text-[var(--copilot-ink)]" : ""}`}>
          {label}
        </p>
        {semaphore ? <SemaphoreIndicator semaphore={semaphore} /> : null}
      </div>
      <p className={`mt-2 ${tierValueClass(tier)}`}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">{subcopy}</p>
      {onClick ? (
        <p className="mt-2 flex items-center gap-0.5 text-[11px] font-medium text-[var(--copilot-accent)]/90">
          Ver detalle
          <ChevronRight className="h-3 w-3" aria-hidden />
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${cardClass}`}>
        {content}
      </button>
    );
  }

  return <div className={cardClass}>{content}</div>;
}

const CURRENCY_BLOCKS: { code: "UYU" | "USD"; title: string }[] = [
  { code: "UYU", title: "Pesos uruguayos (UYU)" },
  { code: "USD", title: "Dólares (USD)" },
];

function emptySlice(code: "UYU" | "USD"): PanoramaCurrencySlice {
  return {
    code,
    grossInvoiced: 0,
    creditNotes: 0,
    netIncome: 0,
    collectedApplied: 0,
    pending: 0,
    overdue: 0,
    collectionRate: null,
    overdueRate: null,
  };
}

function shouldShowCurrencyBlock(
  code: "UYU" | "USD",
  slice: PanoramaCurrencySlice | undefined,
  cashPosition: CashPositionByCurrency | undefined,
  cashAmount: number
): boolean {
  if (slice) return true;
  if (cashPosition) return true;
  if (cashAmount !== 0) return true;
  return false;
}

function CurrencyMetricBlock({
  title,
  currency,
  slice,
  cashAmount,
  cashPosition,
  projection,
  onSelectMetric,
}: {
  title: string;
  currency: "UYU" | "USD";
  slice: PanoramaCurrencySlice | undefined;
  cashAmount: number;
  cashPosition: CashPositionByCurrency | undefined;
  projection: FinancialPanoramaModel["projection"];
  onSelectMetric: (sel: MetricSelection) => void;
}) {
  const s = slice ?? emptySlice(currency);
  const hasMetrics = Boolean(slice);
  const overdueSem = resolveOverdueSemaphore(s);
  const isOverdueCritical = overdueSem.level === "critical";

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hasMetrics ? (
          <>
            <MetricCard
              label={`Ingresos netos (${currency})`}
              value={fmt(s.netIncome, currency)}
              subcopy="Facturación menos notas de crédito."
              tone={resolveNetIncomeSemaphore(s).tone}
              semaphore={resolveNetIncomeSemaphore(s)}
              tier="primary"
              onClick={() => onSelectMetric({ kind: "slice", metricId: "net-income", slice: s })}
            />
            <MetricCard
              label={`Cobrado aplicado (${currency})`}
              value={fmt(s.collectedApplied, currency)}
              subcopy="Cobros registrados sobre ventas."
              tone={resolveCollectedSemaphore(s).tone}
              semaphore={resolveCollectedSemaphore(s)}
              tier="secondary"
              onClick={() => onSelectMetric({ kind: "slice", metricId: "collected", slice: s })}
            />
            <MetricCard
              label={`Deuda total (${currency})`}
              value={fmt(s.pending, currency)}
              subcopy="Facturas abiertas de clientes."
              tone={resolvePendingSemaphore(s).tone}
              semaphore={resolvePendingSemaphore(s)}
              tier="primary"
              onClick={() => onSelectMetric({ kind: "slice", metricId: "pending", slice: s })}
            />
            <MetricCard
              label={`Deuda vencida (${currency})`}
              value={fmt(s.overdue, currency)}
              subcopy="Parte del pendiente con atraso."
              tone={overdueSem.tone}
              semaphore={overdueSem}
              tier="primary"
              emphasize={isOverdueCritical}
              onClick={() => onSelectMetric({ kind: "slice", metricId: "overdue", slice: s })}
            />
          </>
        ) : null}
        {(cashAmount !== 0 || cashPosition) ? (
          <MetricCard
            label={`Caja disponible (${currency})`}
            value={fmt(cashAmount, currency)}
            subcopy="Saldo actual en Tesorería. No es facturación."
            tone={resolveCashSemaphore(cashAmount, projection).tone}
            semaphore={resolveCashSemaphore(cashAmount, projection)}
            tier="primary"
            onClick={() => onSelectMetric({ kind: "cash", currency })}
          />
        ) : null}
        {hasMetrics ? (
          <MetricCard
            label={`Notas de crédito (${currency})`}
            value={fmt(s.creditNotes, currency)}
            subcopy={
              s.creditNotes > 0
                ? "Reducen ingresos netos. No son caja."
                : "Sin NC en el período."
            }
            tone={s.creditNotes > 0 ? resolveCreditNotesSemaphore(s).tone : "neutral"}
            semaphore={s.creditNotes > 0 ? resolveCreditNotesSemaphore(s) : undefined}
            tier="tertiary"
            onClick={() => onSelectMetric({ kind: "slice", metricId: "credit-notes", slice: s })}
          />
        ) : null}
      </div>
    </section>
  );
}

function CurrencyBreakdownTable({ slice }: { slice: PanoramaCurrencySlice }) {
  const netRows = [
    { label: "Bruto facturado", value: slice.grossInvoiced },
    { label: "Notas de crédito", value: -slice.creditNotes, negative: true },
    { label: "Neto generado", value: slice.netIncome, bold: true, equals: true },
  ];
  const collectionRows = [
    { label: "Cobrado aplicado", value: slice.collectedApplied },
    { label: "Deuda total", value: slice.pending },
    { label: "Deuda vencida", value: slice.overdue, danger: slice.overdue > 0 },
  ];

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{slice.code}</p>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Cálculo del neto
      </p>
      <dl className="mt-2 space-y-2">
        {netRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-[var(--copilot-ink-muted)]">
              {row.negative ? "− " : row.equals ? "= " : ""}
              {row.label}
            </dt>
            <dd
              className={`tabular-nums ${row.bold ? "font-semibold text-[var(--copilot-ink)]" : ""} ${
                row.negative ? "text-rose-700" : "text-[var(--copilot-ink)]"
              }`}
            >
              {fmt(Math.abs(row.value), slice.code)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="my-3 border-t border-dashed border-[var(--copilot-border)]" />

      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Estado de cobranza
      </p>
      <dl className="mt-2 space-y-2">
        {collectionRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-[var(--copilot-ink-muted)]">{row.label}</dt>
            <dd
              className={`tabular-nums ${row.danger ? "font-semibold text-rose-800" : "text-[var(--copilot-ink)]"}`}
            >
              {fmt(row.value, slice.code)}
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
  portfolioRows,
  invoices,
  receipts,
  asOfYmd,
  onSelectMetric,
}: {
  model: FinancialPanoramaModel;
  cashPositions: CashPositionByCurrency[];
  portfolioRows: ClientPortfolioRow[];
  invoices: DataRow[];
  receipts: DataRow[];
  asOfYmd: string;
  onSelectMetric: (sel: MetricSelection) => void;
}) {
  const hasMixed = model.currencies.length > 1;
  const riskSem = resolveRiskSemaphore(model.risk.level);

  const concentrationCompanyId = model.concentration
    ? portfolioRows.find((r) => r.name === model.concentration?.clientName)?.company_id
    : undefined;

  const riskCalloutClass =
    riskSem.level === "critical"
      ? "border-rose-200/80 bg-rose-50/50"
      : riskSem.level === "attention"
        ? "border-amber-200/80 bg-amber-50/40"
        : softCalloutClass;

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <CopilotSectionTitle
          title="Resumen por moneda"
          subtitle="UYU y USD por separado. Cada bloque agrupa generación, cobranza, riesgo y caja."
        />
        {CURRENCY_BLOCKS.map(({ code, title }) => {
          const slice = model.currencies.find((c) => c.code === code);
          const cashPosition = cashPositions.find((p) => p.currency === code);
          const cashAmount = code === "UYU" ? model.projection.cashTodayUyu : model.projection.cashTodayUsd;
          if (!shouldShowCurrencyBlock(code, slice, cashPosition, cashAmount)) return null;
          return (
            <CurrencyMetricBlock
              key={code}
              title={title}
              currency={code}
              slice={slice}
              cashAmount={cashAmount}
              cashPosition={cashPosition}
              projection={model.projection}
              onSelectMetric={onSelectMetric}
            />
          );
        })}
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
          {model.currencies.map((c) => {
            const overduePct = c.overdueRate != null ? Math.round(c.overdueRate * 100) : 0;
            const isRelevant = overduePct >= 30;
            return (
              <div
                key={`ovr-${c.code}`}
                className={`rounded-xl border p-3 ${
                  isRelevant
                    ? "border-amber-200/80 bg-amber-50/40"
                    : overduePct === 0
                      ? "border-[var(--copilot-border)] bg-white/60 opacity-80"
                      : softCalloutClass
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Deuda vencida {c.code}
                </p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${isRelevant ? "text-amber-950" : ""}`}>
                  {formatPanoramaRate(c.overdueRate)}
                </p>
                <p className="text-[11px] text-[var(--copilot-ink-muted)]">del pendiente está vencido</p>
              </div>
            );
          })}
          <div className={`rounded-xl border p-3 ${riskCalloutClass}`}>
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
              {concentrationCompanyId ? (
                <Link
                  href={`/copilot/clientes/${concentrationCompanyId}`}
                  className="mt-1 block text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  {model.concentration.clientName}
                </Link>
              ) : (
                <p className="mt-1 text-sm font-semibold text-[var(--copilot-ink)]">
                  {model.concentration.clientName}
                </p>
              )}
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
                : "No hay pagos próximos cargados."}
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
            label="Escenario estimado 30 días"
            value={fmt(model.projection.estimatedCash30d, null)}
            subcopy="Caja actual + cobros esperados − pagos próximos."
            tone={model.projection.estimatedCash30d < 0 ? "danger" : "neutral"}
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
          No es saldo bancario. Es una estimación operativa según cobranza esperada y pagos cargados.
        </p>
        {!model.projection.hasOutflows ? (
          <p className={`mt-3 text-sm text-[var(--copilot-ink-muted)] ${softCalloutClass}`}>
            No hay pagos próximos cargados.
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

  const metricsByCode = useMemo(() => {
    if (!reconciliation.report) return {} as Partial<Record<"UYU" | "USD", import("@/lib/copilot-cartera-cards-source").NormalizedCurrencyMetrics>>;
    const index = buildCurrencyIndex(reconciliation.report.currencies);
    const out: Partial<Record<"UYU" | "USD", import("@/lib/copilot-cartera-cards-source").NormalizedCurrencyMetrics>> = {};
    const uyu = index.get("UYU");
    const usd = index.get("USD");
    if (uyu) out.UYU = uyu;
    if (usd) out.USD = usd;
    return out;
  }, [reconciliation.report]);

  const model = useMemo(() => {
    if (!reconciliation.report) return null;
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
  }, [reconciliation.report, periodLabel, metricsByCode, snapshot, cashPositions, portfolioRows]);

  const metricDetail = useMemo(() => {
    if (!metricSelection || !model) return null;
    const detailContext = { period, metrics: undefined as import("@/lib/copilot-cartera-cards-source").NormalizedCurrencyMetrics | undefined };
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
  }, [metricSelection, model, cashPositions, reconciliation.report, period, metricsByCode]);

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
        portfolioRows={portfolioRows}
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
