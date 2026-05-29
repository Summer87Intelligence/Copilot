"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import {
  buildFinancialMonthlyTrends,
  defaultTrendCurrency,
  filterTrendsByCurrency,
  maxTrendValue,
  type MonthlyTrendInvoiceInput,
  type MonthlyTrendReceiptInput,
} from "@/lib/copilot-financial-monthly-trends";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

function fmt(n: number, currency: "UYU" | "USD", compact = true): string {
  return formatMoneyCurrency(n, currency, { compact: compact && n >= 100_000 });
}

function fmtChartLabel(n: number, currency: "UYU" | "USD"): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function MonthColumn({
  month,
  netIssued,
  collected,
  creditNotes,
  max,
  currency,
}: {
  month: string;
  netIssued: number;
  collected: number;
  creditNotes: number;
  max: number;
  currency: "UYU" | "USD";
}) {
  const bars = [
    { key: "net", value: netIssued, className: "bg-emerald-400/55", title: "Ventas netas" },
    { key: "col", value: collected, className: "bg-sky-400/55", title: "Cobros" },
    { key: "nc", value: creditNotes, className: "bg-rose-300/60", title: "Notas de crédito" },
  ];

  const tooltip = [
    `Ventas netas: ${fmt(netIssued, currency)}`,
    `Cobros: ${fmt(collected, currency)}`,
    creditNotes > 0 ? `NC: ${fmt(creditNotes, currency)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="group flex min-w-[76px] flex-1 flex-col items-center gap-1"
      title={tooltip}
    >
      <div className="relative flex h-32 w-full flex-col justify-end">
        <div className="flex h-28 items-end justify-center gap-1 px-0.5">
          {bars.map((b) => {
            const h = max > 0 ? Math.max(b.value > 0 ? 6 : 2, (b.value / max) * 100) : 2;
            return (
              <div
                key={b.key}
                className={`w-3 rounded-t-sm transition-opacity group-hover:opacity-100 ${b.className} ${b.value <= 0 ? "opacity-30" : "opacity-80"}`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
      </div>
      <span className="text-center text-[10px] font-medium tabular-nums text-[var(--copilot-ink)]">
        {netIssued > 0 ? fmtChartLabel(netIssued, currency) : "—"}
      </span>
      <span className="text-center text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
        {month}
      </span>
    </div>
  );
}

export function FinancialMonthlyTrends({
  invoices,
  receipts,
  asOfYmd,
}: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
}) {
  const result = useMemo(
    () => buildFinancialMonthlyTrends({ invoices, receipts, asOfYmd, monthsBack: 6 }),
    [invoices, receipts, asOfYmd]
  );

  const hasUyu = result.trends.some((t) => t.currency === "UYU");
  const hasUsd = result.trends.some((t) => t.currency === "USD");

  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");

  useEffect(() => {
    setCurrency(defaultTrendCurrency(result.trends));
  }, [result.trends]);

  const filtered = useMemo(
    () => filterTrendsByCurrency(result.trends, currency),
    [result.trends, currency]
  );

  const byMonth = useMemo(() => {
    const map = new Map<string, (typeof filtered)[number]>();
    for (const t of filtered) map.set(t.month, t);
    return map;
  }, [filtered]);

  const monthKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const t of result.trends.filter((x) => x.currency === currency)) {
      keys.add(t.month);
    }
    return [...keys].sort();
  }, [result.trends, currency]);

  const max = useMemo(() => maxTrendValue(filtered), [filtered]);

  const showSelector = hasUyu || hasUsd;

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CopilotSectionTitle
          title="Evolución mensual"
          subtitle="Valores por mes, separados por moneda."
        />
        {showSelector ? (
          <div
            className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 p-1 shadow-sm"
            role="tablist"
            aria-label="Moneda del gráfico"
          >
            {(["UYU", "USD"] as const).map((c) => {
              const hasData = result.trends.some((t) => t.currency === c);
              const active = currency === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={!hasData}
                  onClick={() => hasData && setCurrency(c)}
                  className={`min-w-[52px] rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
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

      {result.isEmpty ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay suficientes datos mensuales para graficar.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay datos suficientes en {currency} para graficar.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-[var(--copilot-ink-muted)]">
            <span>Máximo del período ({currency})</span>
            <span className="font-medium tabular-nums text-[var(--copilot-ink)]">
              {fmt(max, currency)}
            </span>
          </div>
          <div className="relative mt-1 border-t border-dashed border-slate-200 pt-3">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {monthKeys.map((ym) => {
                const t = byMonth.get(ym);
                if (!t) return null;
                return (
                  <MonthColumn
                    key={ym}
                    month={t.label.replace(/\s\d{4}$/, "")}
                    netIssued={t.netIssued}
                    collected={t.collected}
                    creditNotes={t.creditNotes}
                    max={max}
                    currency={currency}
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--copilot-ink-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/55" aria-hidden />
              Ventas netas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-400/55" aria-hidden />
              Cobros
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-300/60" aria-hidden />
              Notas de crédito
            </span>
          </div>
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
        Pendiente y vencido representan el estado actual, no histórico mensual. Los gráficos son
        operativos y se basan en datos sincronizados. Para cierre formal, validar con contador/export
        contable.
      </p>
    </CopilotCard>
  );
}
