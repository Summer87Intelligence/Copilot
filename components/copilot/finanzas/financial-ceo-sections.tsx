"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  CopilotCard,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import {
  copilotCurrencyClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  buildAnnualSalesYtd,
  buildCeoIndicators,
  buildMonthlySalesYear,
  topDebtorByCurrency,
  topDebtorsByCurrency,
  type CeoDebtorRow,
  type CeoInvoiceInput,
  type CeoPortfolioRow,
} from "@/lib/copilot-finanzas-ceo-derivations";

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency: "UYU" | "USD"): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  const prefix = currency === "UYU" ? "$" : "U$S";
  return `${prefix} ${amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Componente principal — facturación, tendencia, deuda por cliente
// ---------------------------------------------------------------------------

export function FinancialCeoSections({
  invoices,
  portfolioRows,
  year,
  asOf = new Date(),
}: {
  invoices: ReadonlyArray<CeoInvoiceInput>;
  portfolioRows: ReadonlyArray<CeoPortfolioRow>;
  year: number;
  asOf?: Date;
}) {
  const monthly = useMemo(
    () => buildMonthlySalesYear(invoices, year, asOf),
    [invoices, year, asOf]
  );
  const ytd = useMemo(() => buildAnnualSalesYtd(invoices, year), [invoices, year]);
  const topUyu = useMemo(
    () => topDebtorsByCurrency(portfolioRows, "UYU", 5),
    [portfolioRows]
  );
  const topUsd = useMemo(
    () => topDebtorsByCurrency(portfolioRows, "USD", 5),
    [portfolioRows]
  );

  return (
    <div className="space-y-4">
      {/* ── Facturación anual ── */}
      <CopilotCard>
        <CopilotSectionTitle
          title={`Facturación ${year}`}
          subtitle={`Acumulado · ${fmt(ytd.UYU, "UYU")} · ${fmt(ytd.USD, "USD")}`}
        />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {monthly.map((m) => (
            <div
              key={m.ym}
              className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 py-2"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
                  {m.monthShortEs}
                </p>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    m.closed ? "bg-[var(--copilot-ink-muted)]" : "bg-[var(--copilot-accent)]"
                  }`}
                  title={m.closed ? "Mes cerrado" : "Mes en curso"}
                />
              </div>
              <p className="mt-1 text-[9px] text-[var(--copilot-ink-muted)]">Ventas UYU</p>
              <p className={`text-[11px] tabular-nums font-semibold leading-tight ${copilotCurrencyClass("UYU")}`}>
                {fmt(m.sales.UYU, "UYU")}
              </p>
              <p className="mt-1 text-[9px] text-[var(--copilot-ink-muted)]">Ventas USD</p>
              <p className={`text-[11px] tabular-nums font-semibold leading-tight ${copilotCurrencyClass("USD")}`}>
                {fmt(m.sales.USD, "USD")}
              </p>
              <p className="mt-1 text-[9px] text-[var(--copilot-ink-muted)]">
                {m.closed ? "Mes cerrado" : "Mes en curso"}
              </p>
            </div>
          ))}
        </div>
      </CopilotCard>

      {/* ── Tendencia anual ── */}
      <CopilotCard>
        <CopilotSectionTitle
          title="Tendencia anual"
          subtitle="Ventas mensuales · UYU y USD por separado"
        />
        <AnnualTrend rows={monthly} />
      </CopilotCard>

      {/* ── Clientes que explican la deuda ── */}
      <CopilotCard>
        <CopilotSectionTitle
          title="Clientes que explican la deuda"
          subtitle="Mayor pendiente por moneda al corte"
        />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <DebtorTable title="Top UYU" currency="UYU" rows={topUyu} />
          <DebtorTable title="Top USD" currency="USD" rows={topUsd} />
        </div>
      </CopilotCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Riesgo de cobro — indicadores ejecutivos
// ---------------------------------------------------------------------------

export function FinancialCeoCollectionRiskSummary({
  portfolioRows,
  asOf = new Date(),
}: {
  portfolioRows: ReadonlyArray<CeoPortfolioRow>;
  asOf?: Date;
}) {
  const indicators = useMemo(
    () => buildCeoIndicators(portfolioRows, asOf),
    [portfolioRows, asOf]
  );
  const topUyu = useMemo(
    () => topDebtorByCurrency(portfolioRows, "UYU"),
    [portfolioRows]
  );
  const topUsd = useMemo(
    () => topDebtorByCurrency(portfolioRows, "USD"),
    [portfolioRows]
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <CeoIndicator
        label="Clientes con atraso"
        value={`${indicators.totalClientsWithOverdue} de ${indicators.totalClients}`}
        tone={indicators.totalClientsWithOverdue > 0 ? "warning" : "neutral"}
      />
      <CeoIndicator
        label="Monto atrasado"
        value={`${fmt(indicators.overdueAmount.UYU, "UYU")} · ${fmt(indicators.overdueAmount.USD, "USD")}`}
        tone={
          indicators.overdueAmount.UYU > 0 || indicators.overdueAmount.USD > 0
            ? "warning"
            : "neutral"
        }
      />
      <CeoIndicator
        label="Clientes +30 días"
        value={String(indicators.clientsOver30)}
        tone={indicators.clientsOver30 > 0 ? "danger" : "neutral"}
      />
      <CeoIndicator
        label="Mayor cliente deudor UYU"
        value={topUyu ? topUyu.name : "Sin deuda UYU"}
        sub={topUyu ? fmt(topUyu.amount, "UYU") : undefined}
        tone="neutral"
      />
      <CeoIndicator
        label="Mayor cliente deudor USD"
        value={topUsd ? topUsd.name : "Sin deuda USD"}
        sub={topUsd ? fmt(topUsd.amount, "USD") : undefined}
        tone="neutral"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function DebtorTable({
  title,
  currency,
  rows,
}: {
  title: string;
  currency: "UYU" | "USD";
  rows: CeoDebtorRow[];
}) {
  return (
    <div>
      <p className={`text-xs font-semibold ${copilotCurrencyClass(currency)}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">Sin pendiente en {currency}.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--copilot-border)]">
          <table className="w-full min-w-[240px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--copilot-border)] text-[10px] uppercase tracking-wider text-[var(--copilot-ink-muted)]">
                <th className="px-2 py-1.5">Cliente</th>
                <th className="px-2 py-1.5 text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--copilot-border)]/60">
              {rows.map((r, idx) => (
                <tr key={r.companyId}>
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/copilot/clientes/${r.companyId}`}
                      className="font-medium text-[var(--copilot-accent)] hover:underline"
                    >
                      {idx + 1}. {r.name}
                    </Link>
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${copilotCurrencyClass(currency)}`}>
                    {fmt(r.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CeoIndicator({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "warning" | "danger" | "neutral";
}) {
  const accent =
    tone === "danger"
      ? "text-[var(--copilot-danger-text-strong)]"
      : tone === "warning"
        ? "text-[var(--copilot-warning-text-strong)]"
        : "text-[var(--copilot-ink)]";
  return (
    <div className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold leading-tight ${accent}`}>{value}</p>
      {sub ? (
        <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

function AnnualTrend({ rows }: { rows: ReturnType<typeof buildMonthlySalesYear> }) {
  const maxUyu = Math.max(1, ...rows.map((r) => r.sales.UYU));
  const maxUsd = Math.max(1, ...rows.map((r) => r.sales.USD));

  return (
    <div className="mt-3 space-y-4">
      <TrendRow label="UYU" currency="UYU" rows={rows} max={maxUyu} field="UYU" />
      <TrendRow label="USD" currency="USD" rows={rows} max={maxUsd} field="USD" />
    </div>
  );
}

function TrendRow({
  label,
  currency,
  rows,
  max,
  field,
}: {
  label: string;
  currency: "UYU" | "USD";
  rows: ReturnType<typeof buildMonthlySalesYear>;
  max: number;
  field: "UYU" | "USD";
}) {
  const barColor =
    currency === "UYU" ? "bg-[var(--copilot-currency-uyu)]" : "bg-[var(--copilot-currency-usd)]";
  const barColorSoft =
    currency === "UYU"
      ? "bg-[var(--copilot-currency-uyu)]/40"
      : "bg-[var(--copilot-currency-usd)]/40";

  return (
    <div>
      <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${copilotCurrencyClass(currency)}`}>
        Ventas {label}
      </p>
      <div className="flex items-end gap-1">
        {rows.map((r) => {
          const v = r.sales[field];
          const h = Math.max(3, Math.round((v / max) * 72));
          return (
            <div key={r.ym} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
              <div
                className={`w-full rounded-sm ${r.closed ? barColor : barColorSoft}`}
                style={{ height: `${h}px` }}
                title={`${r.monthShortEs}: ${fmt(v, currency)}`}
              />
              <span className="truncate text-[8px] font-medium uppercase text-[var(--copilot-ink-muted)]">
                {r.monthShortEs.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
