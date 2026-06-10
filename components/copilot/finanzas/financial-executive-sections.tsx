"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { ExecutiveMetricCard, fmtMoney } from "@/components/copilot/finanzas/financial-executive-shared";
import {
  statusBadgeVariants,
  softCalloutClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type {
  ComparisonMetric,
  ExecutiveCurrencyPanel,
  FinancialExecutiveDashboard,
  PeriodComparisonBlock,
} from "@/lib/copilot-financial-executive-dashboard";
import { riskBadgeTone, trendDirectionLabel } from "@/lib/copilot-financial-executive-dashboard";
import { formatPanoramaRate } from "@/lib/copilot-financial-panorama-model";
import type { FinancialPanoramaModel, PanoramaCurrencySlice } from "@/lib/copilot-financial-panorama-model";
import type { PanoramaMetricId } from "@/lib/copilot-financial-panorama-details";

export function FinancialExecutiveHeader({
  dashboard,
}: {
  dashboard: FinancialExecutiveDashboard;
}) {
  const { panorama, periodContext: ctx } = dashboard;
  const tone = riskBadgeTone(panorama.risk.level);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--copilot-ink)]">Panorama financiero</h2>
          <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
            Ventas, cobros, deuda, caja y evolución del negocio.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeVariants[tone]}`}
          >
            Riesgo {panorama.risk.label}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            <CopilotGhostLink href="/copilot/reportes" className="text-xs">
              Ver reportes
            </CopilotGhostLink>
            <CopilotGhostLink href="/copilot/tesoreria" className="text-xs">
              Ver Tesorería
            </CopilotGhostLink>
            <CopilotGhostLink href="/copilot/cartera" className="text-xs">
              Ver Cartera
            </CopilotGhostLink>
          </div>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3 text-xs text-[var(--copilot-ink-muted)] sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span className="font-semibold text-[var(--copilot-ink)]">Fecha de corte:</span>{" "}
          {ctx.asOfLabel}
        </p>
        <p>
          <span className="font-semibold text-[var(--copilot-ink)]">Período actual:</span>{" "}
          {ctx.currentPeriod.label}
        </p>
        <p>
          <span className="font-semibold text-[var(--copilot-ink)]">Último mes cerrado:</span>{" "}
          {ctx.lastClosedMonthLabel}
        </p>
        <p>
          <span className="font-semibold text-[var(--copilot-ink)]">Monedas:</span>{" "}
          {ctx.currenciesNote}
        </p>
      </div>

      {ctx.partialMonthCallout ? (
        <div className={`${softCalloutClass} px-3 py-2.5 text-sm text-[var(--copilot-ink)]`}>
          {ctx.partialMonthCallout}
        </div>
      ) : null}
    </div>
  );
}

function ComparisonTable({ block, currency }: { block: PeriodComparisonBlock; currency: "UYU" | "USD" }) {
  const paired = block.layout === "paired";
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-3">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{block.title}</p>
      {block.subtitle ? (
        <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">{block.subtitle}</p>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <th className="pb-2 pr-3 font-semibold">Métrica</th>
              <th className="pb-2 pr-3 font-semibold text-right">
                {paired ? "Período reciente" : "Valor"}
              </th>
              {paired ? (
                <th className="pb-2 font-semibold text-right">Período anterior</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {block.metrics.map((m) => (
              <ComparisonRow key={m.id} metric={m} currency={currency} paired={paired} />
            ))}
          </tbody>
        </table>
      </div>
      {block.footnote ? (
        <p className="mt-2 text-[10px] italic text-[var(--copilot-ink-muted)]">{block.footnote}</p>
      ) : null}
    </div>
  );
}

function ComparisonRow({
  metric,
  currency,
  paired,
}: {
  metric: ComparisonMetric;
  currency: "UYU" | "USD";
  paired: boolean;
}) {
  const fmt = (v: number | null) => {
    if (v == null) return "—";
    if (metric.format === "percent") return formatPanoramaRate(v);
    if (metric.format === "days") return String(v);
    if (v === 0 && metric.format === "money") return "—";
    return fmtMoney(v, currency);
  };
  return (
    <tr className="border-t border-[var(--copilot-border)]/60">
      <td className="py-2 pr-3 text-[var(--copilot-ink-muted)]">{metric.label}</td>
      <td className="py-2 pr-3 text-right tabular-nums font-medium text-[var(--copilot-ink)]">
        {metric.format === "days" && metric.previous != null
          ? `${fmt(metric.current)} / ${metric.previous}`
          : fmt(metric.current)}
      </td>
      {paired ? (
        <td className="py-2 text-right tabular-nums text-[var(--copilot-ink-muted)]">
          {fmt(metric.previous)}
        </td>
      ) : null}
    </tr>
  );
}

export function FinancialPeriodComparisons({
  panels,
}: {
  panels: ExecutiveCurrencyPanel[];
}) {
  if (panels.length === 0) return null;
  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Comparativas"
        subtitle="Mes en curso (parcial), último mes cerrado y semana contra semana."
      />
      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
        Ventas y cobros por fecha de comprobante/recibo. Los meses cerrados son comparables entre sí.
      </p>
      <div className="mt-4 space-y-6">
        {panels.map((panel) => (
          <div key={panel.currency} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {panel.currency}
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              <ComparisonTable block={panel.currentMonthInProgress} currency={panel.currency} />
              <ComparisonTable block={panel.lastClosedMonthComparison} currency={panel.currency} />
              <ComparisonTable block={panel.weekVsPrevious} currency={panel.currency} />
            </div>
          </div>
        ))}
      </div>
    </CopilotCard>
  );
}

export function FinancialCurrencySummary({
  panel,
  onSelectMetric,
}: {
  panel: ExecutiveCurrencyPanel;
  onSelectMetric: (metricId: PanoramaMetricId, slice: PanoramaCurrencySlice) => void;
}) {
  const s = panel.slice;
  const c = panel.currency;
  const hasPeriodActivity = s != null && (s.netIncome > 0 || s.collectedApplied > 0 || s.creditNotes > 0);
  const coverage = panel.collectionDebt.collectionsVsNetSalesPct;

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">
        {c === "UYU" ? "Pesos uruguayos (UYU)" : "Dólares (USD)"}
      </h3>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Situación actual
        </p>
        <p className="text-[10px] text-[var(--copilot-ink-muted)]">Fuente: Cartera + Tesorería</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ExecutiveMetricCard
            label="Caja disponible"
            value={fmtMoney(panel.cashToday, c)}
            subcopy="Fuente: Tesorería. No es saldo bancario certificado."
            tone={panel.cashToday > 0 ? "positive" : "neutral"}
          />
          {s ? (
            <>
              <ExecutiveMetricCard
                label="Deuda actual"
                value={fmtMoney(s.pending, c)}
                subcopy="Fuente: Cartera (saldo pendiente al corte)."
                tone="neutral"
                onClick={() => onSelectMetric("pending", s)}
              />
              <ExecutiveMetricCard
                label="Deuda vencida"
                value={fmtMoney(s.overdue, c)}
                subcopy="Fuente: Cartera (antigüedad vencida)."
                tone={s.overdue > 0 ? "danger" : "neutral"}
                onClick={() => onSelectMetric("overdue", s)}
              />
              <ExecutiveMetricCard
                label="Cobros vs ventas (período)"
                value={coverage != null ? formatPanoramaRate(coverage) : "—"}
                subcopy="Relación operativa del mes en curso; no es cobertura de pagos fiscales."
                tone="neutral"
              />
            </>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Actividad del período
        </p>
        <p className="text-[10px] text-[var(--copilot-ink-muted)]">
          Fuente: facturas y recibos del período actual
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hasPeriodActivity && s ? (
            <>
              <ExecutiveMetricCard
                label="Ventas"
                value={fmtMoney(s.netIncome, c)}
                subcopy="Fuente: facturas del período."
                tone="positive"
                onClick={() => onSelectMetric("net-income", s)}
              />
              <ExecutiveMetricCard
                label="Cobros"
                value={fmtMoney(s.collectedApplied, c)}
                subcopy="Fuente: recibos registrados en el período."
                tone="positive"
                onClick={() => onSelectMetric("collected", s)}
              />
            </>
          ) : (
            <div className={`sm:col-span-2 ${softCalloutClass} px-3 py-2 text-xs text-[var(--copilot-ink)]`}>
              Sin ventas registradas en el período actual.
              {panel.lastClosedSnapshot ? (
                <>
                  {" "}
                  Último mes cerrado ({panel.lastClosedSnapshot.label}): ventas{" "}
                  {fmtMoney(panel.lastClosedSnapshot.netSales, c)} · cobros{" "}
                  {fmtMoney(panel.lastClosedSnapshot.collected, c)}.
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-[var(--copilot-ink-muted)]">
        Tendencia comercial (histórico): {trendDirectionLabel(panel.trendDirection)} · Fuente:
        ventas y cobros sincronizados desde enero 2026.
      </p>
    </section>
  );
}

export function FinancialCollectionDebtSection({
  panel,
}: {
  panel: ExecutiveCurrencyPanel;
}) {
  const { collectionDebt: cd, currency: c } = panel;
  return (
    <CopilotCard>
      <CopilotSectionTitle
        title={`Cobranza y deuda · ${c}`}
        subtitle="¿Dónde está trabada la plata?"
      />
      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
        Deuda: Cartera · Cobros del mes: recibos por fecha de recibo (misma base que Reporte de
        cobranza).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ExecutiveMetricCard
          label="Deuda actual"
          value={fmtMoney(cd.totalDebt, c)}
          subcopy="Fuente: Cartera."
          tone="neutral"
        />
        <ExecutiveMetricCard
          label="Deuda vencida"
          value={fmtMoney(cd.overdueDebt, c)}
          subcopy="Fuente: Cartera (vencido)."
          tone={cd.overdueDebt > 0 ? "danger" : "neutral"}
        />
        <ExecutiveMetricCard
          label="% vencido"
          value={cd.overduePct != null ? formatPanoramaRate(cd.overduePct) : "—"}
          subcopy="Sobre deuda total."
          tone={cd.overduePct != null && cd.overduePct > 0.3 ? "warning" : "neutral"}
        />
        <ExecutiveMetricCard
          label="Cobros del mes"
          value={fmtMoney(cd.periodCollections, c)}
          subcopy="Fuente: recibos registrados (mes calendario)."
          tone="positive"
        />
        <ExecutiveMetricCard
          label="Cobros vs ventas"
          value={
            cd.collectionsVsNetSalesPct != null
              ? formatPanoramaRate(cd.collectionsVsNetSalesPct)
              : "—"
          }
          subcopy="Del período actual."
          tone="neutral"
        />
      </div>
      {panel.topOverdue.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 text-right">Deuda</th>
                <th className="px-3 py-2 text-right">Vencida</th>
                <th className="px-3 py-2">Riesgo</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {panel.topOverdue.map((row) => (
                <tr key={row.companyId} className="border-t border-[var(--copilot-border)]">
                  <td className="px-3 py-2 font-medium">{row.clientName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.totalDebt, c)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                    {fmtMoney(row.overdueDebt, c)}
                  </td>
                  <td className="px-3 py-2">{row.risk}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/copilot/clientes/${row.companyId}`}
                      className="font-semibold text-[var(--copilot-accent)] hover:underline"
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">Sin deuda vencida en {c}.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <CopilotGhostLink href="/copilot/cartera">Ver clientes vencidos</CopilotGhostLink>
        <CopilotGhostLink href="/copilot/reportes">Generar reporte de deudores</CopilotGhostLink>
      </div>
    </CopilotCard>
  );
}

function ClientTable({
  title,
  rows,
  currency,
  mode,
}: {
  title: string;
  rows: ExecutiveCurrencyPanel["topSalesClients"];
  currency: "UYU" | "USD";
  mode: "sales" | "debt";
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title}
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
        <table className="w-full min-w-[400px] text-left text-xs">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2 text-right">
                {mode === "sales" ? "Ventas" : "Deuda"}
              </th>
              <th className="px-3 py-2 text-right">%</th>
              {mode === "sales" ? (
                <th className="px-3 py-2 text-right">Deuda</th>
              ) : (
                <th className="px-3 py-2 text-right">Vencida</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.companyId} className="border-t border-[var(--copilot-border)]">
                <td className="px-3 py-2">
                  <Link
                    href={`/copilot/clientes/${row.companyId}`}
                    className="font-medium text-[var(--copilot-accent)] hover:underline"
                  >
                    {row.clientName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(mode === "sales" ? row.netSales : row.currentDebt, currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.sharePct}%</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(mode === "sales" ? row.currentDebt : row.overdueDebt, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FinancialTopClientsSection({
  panels,
  mode = "both",
  embedded = false,
}: {
  panels: ExecutiveCurrencyPanel[];
  mode?: "sales" | "debt" | "both";
  embedded?: boolean;
}) {
  if (panels.length === 0) return null;
  const body = (
    <>
      <div className={embedded ? "space-y-3" : "mt-4 space-y-6"}>
        {panels.map((panel) => (
          <div key={panel.currency} className={mode === "both" ? "grid gap-4 lg:grid-cols-2" : ""}>
            {(mode === "sales" || mode === "both") && (
              <ClientTable
                title={`Top ventas · ${panel.currency}`}
                rows={panel.topSalesClients}
                currency={panel.currency}
                mode="sales"
              />
            )}
            {(mode === "debt" || mode === "both") && (
              <ClientTable
                title={`Top deuda · ${panel.currency}`}
                rows={panel.topDebtClients}
                currency={panel.currency}
                mode="debt"
              />
            )}
          </div>
        ))}
      </div>
      <CopilotGhostLink
        href="/copilot/reportes"
        className={`${embedded ? "mt-2" : "mt-4"} inline-flex text-sm font-semibold`}
      >
        Ver reporte clientes principales
      </CopilotGhostLink>
    </>
  );
  if (embedded) return body;
  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Clientes principales"
        subtitle="Quién explica ventas y deuda por moneda."
      />
      {body}
    </CopilotCard>
  );
}

export function FinancialProjection30d({
  model,
}: {
  model: FinancialPanoramaModel;
}) {
  const p = model.projection;
  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Próximos 30 días"
        subtitle="Estimación operativa: caja actual + cobros esperados − pagos cargados."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ExecutiveMetricCard
          label="Caja disponible hoy"
          value={
            p.cashTodayUyu > 0 || p.cashTodayUsd > 0
              ? [p.cashTodayUyu > 0 ? fmtMoney(p.cashTodayUyu, "UYU") : null, p.cashTodayUsd > 0 ? fmtMoney(p.cashTodayUsd, "USD") : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Consultar Tesorería"
          }
          subcopy="Fuente: Tesorería."
          tone="positive"
        />
        <ExecutiveMetricCard
          label="Cobros esperados"
          value={fmtMoney(p.expectedCollections, null)}
          subcopy="Fuente: cartera ponderada por probabilidad."
          tone="neutral"
        />
        <ExecutiveMetricCard
          label="Pagos próximos"
          value={p.hasOutflows ? fmtMoney(p.upcomingOutflows, null) : "—"}
          subcopy="Fuente: Tesorería (operativos + fiscal 30 d)."
          tone={p.hasOutflows ? "warning" : "neutral"}
        />
        <ExecutiveMetricCard
          label="Escenario estimado"
          value={fmtMoney(p.estimatedCash30d, null)}
          subcopy="No es saldo bancario ni cierre contable."
          tone={p.estimatedCash30d < 0 ? "danger" : "positive"}
        />
      </div>
      {!p.hasOutflows ? (
        <div className={`mt-3 ${softCalloutClass} px-3 py-2 text-sm text-[var(--copilot-ink-muted)]`}>
          No hay pagos próximos cargados. La proyección puede estar incompleta.{" "}
          <Link
            href="/copilot/tesoreria?section=programados"
            className="font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Cargar pago programado
          </Link>
        </div>
      ) : null}
    </CopilotCard>
  );
}

function BreakdownCard({ slice }: { slice: PanoramaCurrencySlice }) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-4">
      <p className="text-sm font-semibold">{slice.code}</p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <div className="flex justify-between gap-2 font-semibold">
          <dt>Ventas</dt>
          <dd className="tabular-nums">{fmtMoney(slice.netIncome, slice.code)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Cobrado</dt>
          <dd className="tabular-nums">{fmtMoney(slice.collectedApplied, slice.code)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Deuda actual</dt>
          <dd className="tabular-nums">{fmtMoney(slice.pending, slice.code)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Deuda vencida</dt>
          <dd className="tabular-nums text-rose-700">{fmtMoney(slice.overdue, slice.code)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function FinancialCurrencyBreakdown({
  model,
  defaultOpen = false,
}: {
  model: FinancialPanoramaModel;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (model.currencies.length === 0) return null;
  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--copilot-ink)]">
            Desglose por moneda
          </span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
            Bruto solo como detalle. Las métricas principales usan neto.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-[var(--copilot-border)] px-4 py-4 sm:grid-cols-2">
          {model.currencies.map((c) => (
            <BreakdownCard key={c.code} slice={c} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FinancialExecutiveReading({
  dashboard,
}: {
  dashboard: FinancialExecutiveDashboard;
}) {
  return (
    <CopilotCard className="border-[rgba(31,107,74,0.18)] bg-[rgba(31,107,74,0.03)]">
      <CopilotSectionTitle title="Lectura ejecutiva" subtitle="Máximo 5 puntos accionables." />
      <ul className="mt-3 space-y-2">
        {dashboard.executiveBullets.map((line) => (
          <li key={line} className="flex gap-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <CopilotPrimaryLink href={dashboard.panorama.priorityCta.href}>
          {dashboard.panorama.priorityCta.label}
          <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
        </CopilotPrimaryLink>
      </div>
    </CopilotCard>
  );
}
