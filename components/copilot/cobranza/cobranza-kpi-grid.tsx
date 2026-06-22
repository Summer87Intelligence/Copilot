"use client";

import type { CobranzaKpis } from "@/lib/copilot-cobranza-summary";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  const dotCls =
    tone === "danger"
      ? "text-[var(--copilot-danger-text-strong)]"
      : tone === "warning"
        ? "text-[var(--copilot-warning-text-strong)]"
        : "text-[var(--copilot-ink)]";

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${dotCls}`}>
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

function formatDebt(uyu: number, usd: number, mode: "native" | "usd_equivalent", fxRate: number): string {
  if (mode === "usd_equivalent") {
    const total = convertToUsdEquivalent({ uyu, usd }, fxRate);
    return formatUsdEquivalent(total);
  }
  const parts: string[] = [];
  if (uyu > 0) parts.push(formatMoneyCurrency(uyu, "UYU"));
  if (usd > 0) parts.push(formatMoneyCurrency(usd, "USD"));
  if (parts.length === 0) return "—";
  return parts.join(" · ");
}

export function CobranzaKpiGrid({ kpis }: { kpis: CobranzaKpis }) {
  const { mode, fxRate } = useDisplayCurrency();

  const totalLabel = formatDebt(kpis.totalDebtUyu, kpis.totalDebtUsd, mode, fxRate);
  const overdueLabel = formatDebt(kpis.totalOverdueUyu, kpis.totalOverdueUsd, mode, fxRate);
  const hasOverdue = kpis.totalOverdueUyu > 0 || kpis.totalOverdueUsd > 0;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiCard
        label="Total pendiente"
        value={totalLabel}
        sub={`${kpis.clientsWithDebtCount} clientes`}
      />
      <KpiCard
        label="Vencido"
        value={overdueLabel}
        sub={kpis.clientsOverdueCount > 0 ? `${kpis.clientsOverdueCount} clientes` : undefined}
        tone={hasOverdue ? "danger" : "neutral"}
      />
      <KpiCard
        label="Clientes atrasados"
        value={String(kpis.clientsOverdueCount)}
        sub="con al menos una factura vencida"
        tone={kpis.clientsOverdueCount > 0 ? "warning" : "neutral"}
      />
      <KpiCard
        label="Promesas activas"
        value={String(kpis.activePromisesCount)}
        sub="compromisos de pago pendientes"
        tone="neutral"
      />
    </div>
  );
}
