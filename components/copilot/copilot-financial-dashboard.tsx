"use client";

import { useMemo } from "react";

import { FinancialActionPriorities } from "@/components/copilot/financial-action-priorities";
import { DataProvenanceBadge } from "@/components/copilot/financial-data-provenance";
import { FinancialPriorityAlerts } from "@/components/copilot/financial-priority-alerts";
import { FinancialRiskSummary } from "@/components/copilot/financial-risk-summary";
import type {
  AgingBucket,
  CurrencyMetrics,
  FinancialDashboardMetrics,
} from "@/lib/copilot-financial-dashboard-metrics";
import {
  CURRENCY_SHORT_LABELS,
  currencySymbolFor,
  PROVENANCE_HOME_DASHBOARD,
} from "@/lib/copilot-financial-terminology";
import { buildFinancialPriorityModel } from "@/lib/copilot-financial-priority-engine";

/**
 * Bloque ejecutivo "Salud financiera" — métricas globales del tenant.
 *
 * Diseño: financial-grade (tipo Stripe / Linear / Bloomberg minimal). El consumer
 * proporciona el contenedor visual (en la home: `CopilotCard` + `CopilotSectionTitle`).
 * Este componente sólo renderiza la grilla por moneda y los insights.
 *
 * Reglas:
 *  - No depende de filtros UI ni `is_active=true`.
 *  - Reutiliza `buildFinancialDashboardMetrics` (ledger + `balance_amount`).
 *  - Insights determinísticos, sin IA.
 */
export function CopilotFinancialDashboard({
  metrics,
}: {
  metrics: FinancialDashboardMetrics;
}) {
  const priorityModel = useMemo(() => buildFinancialPriorityModel(metrics), [metrics]);

  if (metrics.currencies.length === 0) {
    return (
      <p
        role="status"
        className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3 text-sm text-[var(--copilot-ink-muted)]"
      >
        Aún no hay facturas financieras válidas para construir métricas ejecutivas.
        Sincronizá Zeta o cargá `proto_invoices` para alimentar este bloque.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <DataProvenanceBadge provenance={PROVENANCE_HOME_DASHBOARD} />
      </div>
      <FinancialPriorityAlerts alerts={priorityModel.alerts} />
      <FinancialActionPriorities priorities={priorityModel.actionPriorities} />
      <FinancialRiskSummary risks={priorityModel.risks} />
      <CashConversionSection currencies={metrics.currencies} />
      <KpiSection currencies={metrics.currencies} />
      <AgingSection currencies={metrics.currencies} />
      <DetailedDebtorsSection currencies={metrics.currencies} />
    </div>
  );
}

/**
 * Cash conversion — frase ejecutiva por moneda.
 *
 * Lee directamente las mismas métricas que `KpiSection` (sin recalcular):
 *  - `totalInvoiced`  → "Emitido"
 *  - `totalCollected` → "Cobrado"
 *  - `totalPending`   → "Pendiente de cobro"
 *
 * Microcopy explícita arriba del bloque para que la lectura sea autosuficiente
 * sin tooltips. Cero mezcla de monedas.
 */
function CashConversionSection({ currencies }: { currencies: CurrencyMetrics[] }) {
  return (
    <section className="space-y-3" aria-label="Cash conversion ejecutivo">
      <SectionHeader
        title="Conversión de caja"
        subtitle="Por moneda: ventas, cobrado y pendiente."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {currencies.map((currency) => (
          <CashConversionCard
            key={currency.currencyCode}
            metrics={currency}
            symbol={currencySymbolFor(currency.currencyCode) ?? currency.currencyCode}
          />
        ))}
      </div>
    </section>
  );
}

function CashConversionCard({ metrics, symbol }: { metrics: CurrencyMetrics; symbol: string }) {
  const label = CURRENCY_SHORT_LABELS[metrics.currencyCode] ?? metrics.currencyCode;
  return (
    <article
      aria-label={`Conversión de caja · ${label}`}
      className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 p-4 shadow-sm"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          {label} · {metrics.currencyCode}
        </h5>
        <span className="text-[10px] text-[var(--copilot-ink-muted)]">
          {metrics.invoiceCount} factura(s) · {metrics.debtorClientsCount} con deuda
        </span>
      </header>
      <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
        Emitiste{" "}
        <span className="font-semibold tabular-nums">
          {money(symbol, metrics.totalInvoiced)}
        </span>
        , cobraste{" "}
        <span className="font-semibold tabular-nums text-[var(--copilot-success-text-strong)]">
          {money(symbol, metrics.totalCollected)}
        </span>{" "}
        y queda pendiente{" "}
        <span className="font-semibold tabular-nums text-[var(--copilot-warning-text-strong)]">
          {money(symbol, metrics.totalPending)}
        </span>
        .
      </p>
    </article>
  );
}

function KpiSection({ currencies }: { currencies: CurrencyMetrics[] }) {
  return (
    <section className="space-y-3" aria-label="KPIs financieros">
      <SectionHeader
        title="KPIs financieros"
        subtitle="Ventas, cobranza y deuda por moneda."
      />
      <div className="space-y-3">
        {currencies.map((currency) => (
          <article
            key={currency.currencyCode}
            className="space-y-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 p-4 shadow-sm"
          >
            <CurrencyHeader metrics={currency} />
            <KpiStrip
              metrics={currency}
              symbol={currencySymbolFor(currency.currencyCode) ?? currency.currencyCode}
            />
            <KpiGlossary />
          </article>
        ))}
      </div>
    </section>
  );
}

function KpiGlossary() {
  return (
    <dl className="grid gap-1 border-t border-[var(--copilot-border)] pt-2 text-[10px] leading-relaxed text-[var(--copilot-ink-muted)] sm:grid-cols-2">
      <div>
        <dt className="inline font-semibold text-[var(--copilot-ink)]">Emitido</dt>
        <dd className="inline"> = total facturado en el período.</dd>
      </div>
      <div>
        <dt className="inline font-semibold text-[var(--copilot-ink)]">Deuda actual</dt>
        <dd className="inline"> = saldo abierto informado por Zeta.</dd>
      </div>
      <div>
        <dt className="inline font-semibold text-[var(--copilot-ink)]">Cobrado</dt>
        <dd className="inline"> = emitido − pendiente de cobro.</dd>
      </div>
      <div>
        <dt className="inline font-semibold text-[var(--copilot-ink)]">Cobranza efectiva</dt>
        <dd className="inline"> = cobrado / emitido.</dd>
      </div>
    </dl>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h4>
      <p className="text-xs text-[var(--copilot-ink-muted)]">{subtitle}</p>
    </div>
  );
}

function CurrencyHeader({ metrics }: { metrics: CurrencyMetrics }) {
  const label = CURRENCY_SHORT_LABELS[metrics.currencyCode] ?? metrics.currencyCode;
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--copilot-border)] pb-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Moneda
        </p>
        <p className="mt-0.5 text-base font-semibold text-[var(--copilot-ink)]">
          {label} · {metrics.currencyCode}
        </p>
      </div>
      <span className="rounded-full border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
        {metrics.invoiceCount} factura(s)
      </span>
    </header>
  );
}

function KpiStrip({ metrics, symbol }: { metrics: CurrencyMetrics; symbol: string }) {
  const items = [
    { label: "Emitido", value: money(symbol, metrics.totalInvoiced), tone: "neutral" },
    { label: "Cobrado", value: money(symbol, metrics.totalCollected), tone: "paid" },
    {
      label: "Deuda actual",
      value: money(symbol, metrics.totalPending),
      tone: "pending",
    },
    {
      label: "Cobranza efectiva",
      value: `${metrics.collectionEffectiveness.toFixed(2)}%`,
      tone: "neutral",
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.025)] px-3 py-2.5"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {item.label}
          </p>
          <p
            className={`mt-1 text-base font-semibold tabular-nums ${
              item.tone === "paid"
                ? "text-[var(--copilot-success-text-strong)]"
                : item.tone === "pending"
                  ? "text-[var(--copilot-warning-text-strong)]"
                  : "text-[var(--copilot-ink)]"
            }`}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function AgingSection({ currencies }: { currencies: CurrencyMetrics[] }) {
  return (
    <section className="space-y-3" aria-label="Aging financiero">
      <SectionHeader
        title="Aging financiero"
        subtitle="Secundario para análisis: monto y cantidad por antigüedad de emisión."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {currencies.map((currency) => (
          <AgingView
            key={currency.currencyCode}
            metrics={currency}
            aging={currency.aging}
            totalPending={currency.totalPending}
            symbol={currencySymbolFor(currency.currencyCode) ?? currency.currencyCode}
          />
        ))}
      </div>
    </section>
  );
}

function AgingView({
  metrics,
  aging,
  totalPending,
  symbol,
}: {
  metrics: CurrencyMetrics;
  aging: AgingBucket[];
  totalPending: number;
  symbol: string;
}) {
  return (
    <article className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 p-4 shadow-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          {CURRENCY_SHORT_LABELS[metrics.currencyCode] ?? metrics.currencyCode} · {metrics.currencyCode}
        </h5>
        <span className="text-[10px] text-[var(--copilot-ink-muted)]">
          calculado sobre fecha de emisión
        </span>
      </header>
      <div className="space-y-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2.5">
        {aging.map((bucket) => {
          const pct = totalPending > 0 ? Math.min(100, (bucket.amount / totalPending) * 100) : 0;
          return (
            <div
              key={bucket.label}
              className="grid grid-cols-[44px_1fr_auto] items-center gap-2 text-[11px]"
            >
              <span className="font-medium text-[var(--copilot-ink)]">{bucket.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
                <div className="h-full rounded-full bg-amber-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-right tabular-nums text-[var(--copilot-ink-muted)]">
                {money(symbol, bucket.amount)}
                <span className="ml-1 text-[10px]">· {bucket.invoiceCount} fact.</span>
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DetailedDebtorsSection({ currencies }: { currencies: CurrencyMetrics[] }) {
  return (
    <section className="space-y-3" aria-label="Top deudores detallado">
      <SectionHeader
        title="Top deudores detallado"
        subtitle="Tabla secundaria: cliente, pendiente, facturas, aging dominante y efectividad."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {currencies.map((currency) => (
          <TopDebtorsTable
            key={currency.currencyCode}
            metrics={currency}
            symbol={currencySymbolFor(currency.currencyCode) ?? currency.currencyCode}
          />
        ))}
      </div>
    </section>
  );
}

function TopDebtorsTable({ metrics, symbol }: { metrics: CurrencyMetrics; symbol: string }) {
  return (
    <article className="space-y-2">
      <header className="flex items-baseline justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          {CURRENCY_SHORT_LABELS[metrics.currencyCode] ?? metrics.currencyCode} · {metrics.currencyCode}
        </h5>
        <span className="text-[10px] text-[var(--copilot-ink-muted)]">
          {metrics.debtorClientsCount} cliente(s) con deuda
        </span>
      </header>
      {metrics.topDebtors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2.5 text-[11px] text-[var(--copilot-ink-muted)]">
          No hay clientes con saldo pendiente en esta moneda.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-[rgba(44,40,37,0.035)] text-[var(--copilot-ink-muted)]">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold">Cliente</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Deuda actual</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Fact.</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Aging</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Cobranza ef.</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topDebtors.map((debtor) => (
                <tr key={debtor.companyId} className="border-t border-[var(--copilot-border)]">
                  <td className="max-w-[280px] truncate px-2.5 py-1.5 text-[var(--copilot-ink)]">
                    {debtor.companyName}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-medium tabular-nums text-[var(--copilot-ink)]">
                    {money(symbol, debtor.pendingAmount)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                    {debtor.invoiceCount}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[var(--copilot-ink-muted)]">
                    {debtor.oldestAgeDays}d · {debtor.dominantAgingLabel}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                    {debtor.collectionEffectiveness.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function money(symbol: string, value: number): string {
  return `${symbol} ${value.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;
}
