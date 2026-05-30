"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import {
  buildFinancialMonthlyTrends,
  buildFinancialDailyTrends,
  defaultTrendCurrency,
  filterTrendsByCurrency,
  maxTrendValue,
  type FinancialMonthlyTrend,
  type DailyTrend,
  type MonthlyTrendInvoiceInput,
  type MonthlyTrendReceiptInput,
} from "@/lib/copilot-financial-monthly-trends";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "7d" | "1m" | "3m" | "6m" | "1y";

type BarData = {
  key: string;
  label: string;
  netIssued: number;
  collected: number;
  creditNotes: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency: "UYU" | "USD", compact = true): string {
  return formatMoneyCurrency(n, currency, { compact: compact && n >= 100_000 });
}

function fmtChartLabel(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function maxOf(bars: BarData[]): number {
  let m = 0;
  for (const b of bars) m = Math.max(m, b.netIssued, b.collected, b.creditNotes);
  return m || 1;
}

function periodToMonthsBack(period: Period): number {
  if (period === "1m") return 1;
  if (period === "3m") return 3;
  if (period === "6m") return 6;
  if (period === "1y") return 12;
  return 6;
}

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "7d", label: "7 días" },
  { id: "1m", label: "Este mes" },
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "1y", label: "12 meses" },
];

// ─── Bar column ───────────────────────────────────────────────────────────────

function BarColumn({
  bar,
  max,
  currency,
  compact,
}: {
  bar: BarData;
  max: number;
  currency: "UYU" | "USD";
  compact: boolean;
}) {
  const bars = [
    { key: "net", value: bar.netIssued, className: "bg-emerald-400/70", title: "Ventas netas" },
    { key: "col", value: bar.collected, className: "bg-sky-400/70", title: "Cobros" },
    { key: "nc", value: bar.creditNotes, className: "bg-rose-300/70", title: "Notas de crédito" },
  ];

  const tooltip = [
    `Ventas netas: ${fmt(bar.netIssued, currency)}`,
    `Cobros: ${fmt(bar.collected, currency)}`,
    bar.creditNotes > 0 ? `NC: ${fmt(bar.creditNotes, currency)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const chartHeight = compact ? "h-24" : "h-36";

  return (
    <div className="group flex min-w-[60px] flex-1 flex-col items-center gap-1" title={tooltip}>
      <div className={`relative flex w-full flex-col justify-end ${chartHeight}`}>
        <div className={`flex ${compact ? "h-20" : "h-32"} items-end justify-center gap-0.5 px-0.5`}>
          {bars.map((b) => {
            const h = max > 0 ? Math.max(b.value > 0 ? 6 : 1, (b.value / max) * 100) : 1;
            return (
              <div
                key={b.key}
                className={`flex-1 rounded-t-sm transition-opacity group-hover:opacity-100 ${b.className} ${b.value <= 0 ? "opacity-20" : "opacity-85"}`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
      </div>
      <span className="text-center text-[10px] font-medium tabular-nums text-[var(--copilot-ink)]">
        {bar.netIssued > 0 ? fmtChartLabel(bar.netIssued) : bar.collected > 0 ? fmtChartLabel(bar.collected) : "—"}
      </span>
      <span className="max-w-[72px] text-center text-[9px] leading-tight text-[var(--copilot-ink-muted)]">
        {bar.label}
      </span>
    </div>
  );
}

// ─── Summary KPIs ─────────────────────────────────────────────────────────────

function SummaryKpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--copilot-border)] bg-white/70 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-base font-bold tabular-nums leading-tight ${
          tone === "ok" ? "text-emerald-800" : tone === "warn" ? "text-amber-800" : "text-[var(--copilot-ink)]"
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function FinancialMonthlyTrends({
  invoices,
  receipts,
  asOfYmd,
}: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
}) {
  const [period, setPeriod] = useState<Period>("6m");
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");

  // Build data depending on period
  const monthlyResult = useMemo(
    () =>
      period !== "7d"
        ? buildFinancialMonthlyTrends({
            invoices,
            receipts,
            asOfYmd,
            monthsBack: periodToMonthsBack(period),
          })
        : null,
    [invoices, receipts, asOfYmd, period]
  );

  const dailyResult = useMemo(
    () =>
      period === "7d"
        ? buildFinancialDailyTrends({ invoices, receipts, asOfYmd, daysBack: 7 })
        : null,
    [invoices, receipts, asOfYmd, period]
  );

  type AnyTrend = { currency: "UYU" | "USD"; netIssued: number; collected: number; creditNotes: number; label: string; };

  const allTrends: AnyTrend[] = useMemo(
    () => (period === "7d" ? (dailyResult?.trends ?? []) : (monthlyResult?.trends ?? [])) as AnyTrend[],
    [period, dailyResult, monthlyResult]
  );

  const hasUyu = allTrends.some((t) => t.currency === "UYU");
  const hasUsd = allTrends.some((t) => t.currency === "USD");

  useEffect(() => {
    const forCur = period !== "7d" ? (monthlyResult?.trends ?? []) : [];
    setCurrency(defaultTrendCurrency(forCur) ?? (hasUyu ? "UYU" : "USD"));
  }, [period, monthlyResult, hasUyu]);

  // Bars for active currency
  const bars: BarData[] = useMemo(() => {
    const filtered = allTrends.filter((t) => t.currency === currency);
    return filtered.map((t, i) => ({
      key: String(i),
      label: period === "7d" ? t.label : t.label.replace(/\s\d{4}$/, ""),
      netIssued: t.netIssued,
      collected: t.collected,
      creditNotes: t.creditNotes,
    }));
  }, [allTrends, currency, period]);

  const max = useMemo(() => maxOf(bars), [bars]);

  // Summary KPIs
  const kpis = useMemo(() => {
    if (bars.length === 0) return null;
    const totalSales = bars.reduce((s, b) => s + b.netIssued, 0);
    const totalCollected = bars.reduce((s, b) => s + b.collected, 0);
    const totalNc = bars.reduce((s, b) => s + b.creditNotes, 0);
    const bestBar = [...bars].sort((a, b) => b.netIssued - a.netIssued)[0];
    const collectionRate = totalSales > 0 ? (totalCollected / totalSales) * 100 : null;
    return { totalSales, totalCollected, totalNc, bestBar, collectionRate };
  }, [bars]);

  const isEmpty =
    period === "7d" ? (dailyResult?.isEmpty ?? true) : (monthlyResult?.isEmpty ?? true);

  const compact = period === "7d" || period === "1m";

  return (
    <CopilotCard>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CopilotSectionTitle
          title="Evolución comercial"
          subtitle="Ventas netas, cobros y notas de crédito por período."
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div
            className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 p-0.5"
            role="tablist"
            aria-label="Período"
          >
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                  period === p.id
                    ? "bg-white text-[var(--copilot-ink)] shadow-sm ring-1 ring-[var(--copilot-border)]"
                    : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Currency selector */}
          {(hasUyu || hasUsd) ? (
            <div
              className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 p-0.5"
              role="tablist"
              aria-label="Moneda del gráfico"
            >
              {(["UYU", "USD"] as const).map((c) => {
                const hasData = allTrends.some((t) => t.currency === c);
                const active = currency === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={!hasData}
                    onClick={() => hasData && setCurrency(c)}
                    className={`min-w-[44px] rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                      active
                        ? "bg-white text-[var(--copilot-ink)] shadow-sm ring-1 ring-[var(--copilot-border)]"
                        : hasData
                          ? "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                          : "cursor-not-allowed text-slate-300"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay datos suficientes para el período seleccionado.
        </p>
      ) : (
        <>
          {/* Summary KPIs */}
          {kpis ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryKpi
                label="Ventas netas"
                value={fmt(kpis.totalSales, currency)}
                sub={kpis.bestBar ? `Mejor: ${kpis.bestBar.label}` : undefined}
                tone="ok"
              />
              <SummaryKpi
                label="Cobros"
                value={fmt(kpis.totalCollected, currency)}
                tone="ok"
              />
              <SummaryKpi
                label="Notas de crédito"
                value={kpis.totalNc > 0 ? fmt(kpis.totalNc, currency) : "—"}
              />
              <SummaryKpi
                label="Tasa de cobro"
                value={kpis.collectionRate != null ? `${kpis.collectionRate.toFixed(0)}%` : "—"}
                sub="cobros / ventas netas"
                tone={
                  kpis.collectionRate != null
                    ? kpis.collectionRate >= 80
                      ? "ok"
                      : "warn"
                    : undefined
                }
              />
            </div>
          ) : null}

          {/* Chart */}
          <div className="relative mt-4 border-t border-dashed border-slate-200 pt-3">
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {bars.map((bar) => (
                <BarColumn
                  key={bar.key}
                  bar={bar}
                  max={max}
                  currency={currency}
                  compact={compact}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--copilot-ink-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/70" aria-hidden />
              Ventas netas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-400/70" aria-hidden />
              Cobros
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-300/70" aria-hidden />
              Notas de crédito
            </span>
          </div>
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
        Ventas netas = facturación menos notas de crédito. Cobros = recibos registrados. No es cierre contable formal.
      </p>
    </CopilotCard>
  );
}
