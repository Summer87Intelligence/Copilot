"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
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
import {
  buildFinancialPanoramaModel,
  formatPanoramaRate,
  type FinancialPanoramaModel,
  type PanoramaCurrencySlice,
} from "@/lib/copilot-financial-panorama-model";
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

function fmt(n: number, currency: "UYU" | "USD" | null = null): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
}

function MetricCard({
  label,
  value,
  subcopy,
  tone = "neutral",
}: {
  label: string;
  value: string;
  subcopy: string;
  tone?: "positive" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${financialCardToneClass(tone)}`}>
      <p className={subtleLabelClass}>{label}</p>
      <p className={`mt-2 text-2xl ${metricValueClass}`}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">{subcopy}</p>
    </div>
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

function PanoramaContent({ model }: { model: FinancialPanoramaModel }) {
  const hasMixed = model.currencies.length > 1;
  const primary = model.currencies[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {model.currencies.map((c) => (
          <MetricCard
            key={`net-${c.code}`}
            label={`Ingresos netos (${c.code})`}
            value={fmt(c.netIncome, c.code)}
            subcopy="Facturación menos notas de crédito."
            tone="positive"
          />
        ))}
        {model.currencies.map((c) => (
          <MetricCard
            key={`col-${c.code}`}
            label={`Cobrado aplicado (${c.code})`}
            value={fmt(c.collectedApplied, c.code)}
            subcopy="Cobros registrados sobre ventas."
            tone="positive"
          />
        ))}
        {model.currencies.map((c) => (
          <MetricCard
            key={`pend-${c.code}`}
            label={`Pendiente (${c.code})`}
            value={fmt(c.pending, c.code)}
            subcopy="Facturas abiertas de clientes."
            tone="warning"
          />
        ))}
        {model.currencies.map((c) => (
          <MetricCard
            key={`ov-${c.code}`}
            label={`Vencido (${c.code})`}
            value={fmt(c.overdue, c.code)}
            subcopy="Parte del pendiente con atraso."
            tone={c.overdue > 0 ? "danger" : "neutral"}
          />
        ))}
        {model.projection.cashTodayUyu > 0 ? (
          <MetricCard
            label="Caja disponible (UYU)"
            value={fmt(model.projection.cashTodayUyu, "UYU")}
            subcopy="Dinero disponible actual. No es facturación."
            tone="positive"
          />
        ) : null}
        {model.projection.cashTodayUsd > 0 ? (
          <MetricCard
            label="Caja disponible (USD)"
            value={fmt(model.projection.cashTodayUsd, "USD")}
            subcopy="Dinero disponible actual. No es facturación."
            tone="positive"
          />
        ) : null}
        {primary && primary.creditNotes > 0 ? (
          <MetricCard
            label={`Notas de crédito (${primary.code})`}
            value={fmt(primary.creditNotes, primary.code)}
            subcopy="Anulaciones/descuentos que reducen ingresos."
            tone="danger"
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
                  model.risk.level === "low"
                    ? statusBadgeVariants.stable
                    : model.risk.level === "attention"
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
      <PanoramaContent model={model} />
    </>
  );
}
