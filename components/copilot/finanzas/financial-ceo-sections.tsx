"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

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
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";

  const monthly = useMemo(
    () => buildMonthlySalesYear(invoices, year, asOf),
    [invoices, year, asOf]
  );
  const ytd = useMemo(() => buildAnnualSalesYtd(invoices, year), [invoices, year]);
  const topUyu = useMemo(
    () => topDebtorsByCurrency(portfolioRows, "UYU", Number.POSITIVE_INFINITY),
    [portfolioRows]
  );
  const topUsd = useMemo(
    () => topDebtorsByCurrency(portfolioRows, "USD", Number.POSITIVE_INFINITY),
    [portfolioRows]
  );

  const fmtYtd = isUsd
    ? formatUsdEquivalent(convertToUsdEquivalent({ uyu: ytd.UYU, usd: ytd.USD }, fxRate))
    : `${fmt(ytd.UYU, "UYU")} · ${fmt(ytd.USD, "USD")}`;

  return (
    <div className="space-y-4">
      {/* ── Facturación anual ── */}
      <CopilotCard>
        <CopilotSectionTitle
          title={`Facturación ${year}`}
          subtitle={isUsd ? `Acumulado neto · ${fmtYtd} · TC ${fxRate}` : `Acumulado neto · ${fmtYtd}`}
        />
        <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
          Ventas netas: facturas emitidas menos notas de crédito del año (sin
          mezclar monedas).
        </p>
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
              {isUsd ? (
                <>
                  <p className="mt-1 text-[9px] text-[var(--copilot-ink-muted)]">Ventas</p>
                  <p className="text-[11px] tabular-nums font-semibold leading-tight text-[var(--copilot-ink)]">
                    {formatUsdEquivalent(convertToUsdEquivalent({ uyu: m.sales.UYU, usd: m.sales.USD }, fxRate))}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[9px] text-[var(--copilot-ink-muted)]">Ventas UYU</p>
                  <p className={`text-[11px] tabular-nums font-semibold leading-tight ${copilotCurrencyClass("UYU")}`}>
                    {fmt(m.sales.UYU, "UYU")}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--copilot-ink-muted)]">Ventas USD</p>
                  <p className={`text-[11px] tabular-nums font-semibold leading-tight ${copilotCurrencyClass("USD")}`}>
                    {fmt(m.sales.USD, "USD")}
                  </p>
                </>
              )}
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
          subtitle={isUsd ? `Ventas mensuales · USD equiv. · TC ${fxRate}` : "Ventas mensuales · UYU y USD por separado"}
        />
        <AnnualTrend rows={monthly} mode={mode} fxRate={fxRate} />
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
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";

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

  const overdueLabel = isUsd
    ? formatUsdEquivalent(convertToUsdEquivalent({ uyu: indicators.overdueAmount.UYU, usd: indicators.overdueAmount.USD }, fxRate))
    : `${fmt(indicators.overdueAmount.UYU, "UYU")} · ${fmt(indicators.overdueAmount.USD, "USD")}`;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <CeoIndicator
        label="Clientes con atraso"
        value={`${indicators.totalClientsWithOverdue} de ${indicators.totalClients}`}
        tone={indicators.totalClientsWithOverdue > 0 ? "warning" : "neutral"}
      />
      <CeoIndicator
        label="Monto atrasado"
        value={overdueLabel}
        sub={isUsd ? `TC ${fxRate}` : undefined}
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
        sub={topUyu ? (isUsd ? formatUsdEquivalent(convertToUsdEquivalent({ uyu: topUyu.amount, usd: 0 }, fxRate)) : fmt(topUyu.amount, "UYU")) : undefined}
        tone="neutral"
      />
      <CeoIndicator
        label="Mayor cliente deudor USD"
        value={topUsd ? topUsd.name : "Sin deuda USD"}
        sub={topUsd ? (isUsd ? formatUsdEquivalent(topUsd.amount) : fmt(topUsd.amount, "USD")) : undefined}
        tone="neutral"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const DEBTOR_TABLE_DEFAULT_LIMIT = 5;

function DebtorTable({
  title,
  currency,
  rows,
}: {
  title: string;
  currency: "UYU" | "USD";
  rows: CeoDebtorRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, DEBTOR_TABLE_DEFAULT_LIMIT);
  const hasMore = rows.length > DEBTOR_TABLE_DEFAULT_LIMIT;

  return (
    <div>
      <p className={`text-xs font-semibold ${copilotCurrencyClass(currency)}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">Sin pendiente en {currency}.</p>
      ) : (
        <>
          <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--copilot-border)]">
            <table className="w-full min-w-[240px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--copilot-border)] text-[10px] uppercase tracking-wider text-[var(--copilot-ink-muted)]">
                  <th className="px-2 py-1.5">Cliente</th>
                  <th className="px-2 py-1.5 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--copilot-border)]/60">
                {visibleRows.map((r, idx) => (
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
          {hasMore ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
                aria-expanded={expanded}
              >
                {expanded
                  ? "Ver menos"
                  : `Ver más (${rows.length - DEBTOR_TABLE_DEFAULT_LIMIT})`}
              </button>
            </div>
          ) : null}
        </>
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

function AnnualTrend({
  rows,
  mode,
  fxRate,
}: {
  rows: ReturnType<typeof buildMonthlySalesYear>;
  mode: "native" | "usd_equivalent";
  fxRate: number;
}) {
  const isUsd = mode === "usd_equivalent";
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--copilot-border)] text-[10px] uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            <th className="px-2 py-1.5 text-left">Mes</th>
            {isUsd ? (
              <th className="px-2 py-1.5 text-right">Ventas (equiv. USD)</th>
            ) : (
              <>
                <th className={`px-2 py-1.5 text-right ${copilotCurrencyClass("UYU")}`}>Ventas UYU</th>
                <th className={`px-2 py-1.5 text-right ${copilotCurrencyClass("USD")}`}>Ventas USD</th>
              </>
            )}
            <th className="px-2 py-1.5 text-right">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--copilot-border)]/60">
          {rows.map((r) => (
            <tr key={r.ym}>
              <td className="px-2 py-1.5 font-medium text-[var(--copilot-ink)]">
                {r.monthShortEs}
              </td>
              {isUsd ? (
                <td className="px-2 py-1.5 text-right tabular-nums font-medium text-[var(--copilot-ink)]">
                  {formatUsdEquivalent(convertToUsdEquivalent({ uyu: r.sales.UYU, usd: r.sales.USD }, fxRate))}
                </td>
              ) : (
                <>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${copilotCurrencyClass("UYU")}`}>
                    {fmt(r.sales.UYU, "UYU")}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${copilotCurrencyClass("USD")}`}>
                    {fmt(r.sales.USD, "USD")}
                  </td>
                </>
              )}
              <td className="px-2 py-1.5 text-right text-[10px] text-[var(--copilot-ink-muted)]">
                {r.closed ? "cerrado" : "en curso"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

