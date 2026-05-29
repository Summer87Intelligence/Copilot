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

function fmt(n: number, currency: "UYU" | "USD"): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
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
    { key: "net", value: netIssued, className: "bg-emerald-500/70", title: "Ventas netas" },
    { key: "col", value: collected, className: "bg-sky-500/70", title: "Cobros" },
    { key: "nc", value: creditNotes, className: "bg-rose-400/60", title: "NC" },
  ];

  return (
    <div className="flex min-w-[72px] flex-1 flex-col items-center gap-2">
      <div className="flex h-28 w-full items-end justify-center gap-1 px-0.5">
        {bars.map((b) => {
          const h = max > 0 ? Math.max(4, (b.value / max) * 100) : 4;
          return (
            <div
              key={b.key}
              className={`w-3 rounded-t-sm ${b.className}`}
              style={{ height: `${h}%` }}
              title={`${b.title}: ${fmt(b.value, currency)}`}
            />
          );
        })}
      </div>
      <span className="text-center text-[10px] leading-tight text-[var(--copilot-ink-muted)]">{month}</span>
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

  const hasUyu = result.trends.some((t) => t.currency === "UYU");
  const hasUsd = result.trends.some((t) => t.currency === "USD");

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CopilotSectionTitle
          title="Evolución mensual"
          subtitle="Ventas netas, cobros y deuda por mes."
        />
        {hasUyu && hasUsd ? (
          <div className="flex rounded-lg border border-[var(--copilot-border)] p-0.5">
            {(["UYU", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  currency === c
                    ? "bg-[var(--copilot-accent)] text-white"
                    : "text-[var(--copilot-ink-muted)] hover:bg-slate-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {result.isEmpty ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay suficientes datos mensuales para graficar.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay datos en {currency} para el rango seleccionado.
        </p>
      ) : (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
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
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-[var(--copilot-ink-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" /> Ventas netas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/70" /> Cobros aplicados
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/60" /> Notas de crédito
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
