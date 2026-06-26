"use client";

import type { CobranzaKpis } from "@/lib/copilot-cobranza-summary";
import type { CobranzaEffectivenessKpis } from "@/lib/copilot-cobranza-effectiveness";
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

function fulfillmentTone(rate: number | null): "neutral" | "warning" | "danger" {
  if (rate == null) return "neutral";
  if (rate < 40) return "danger";
  if (rate < 70) return "warning";
  return "neutral";
}

export function CobranzaKpiGrid({
  kpis,
  effectivenessKpis,
  cobrosDataTruncated = false,
}: {
  kpis: CobranzaKpis;
  effectivenessKpis: CobranzaEffectivenessKpis;
  cobrosDataTruncated?: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();

  const totalLabel = formatDebt(kpis.totalDebtUyu, kpis.totalDebtUsd, mode, fxRate);
  const overdueLabel = formatDebt(kpis.collectionOverdueUyu, kpis.collectionOverdueUsd, mode, fxRate);
  const hasOverdue = kpis.collectionOverdueUyu > 0 || kpis.collectionOverdueUsd > 0;

  const rateLabel =
    effectivenessKpis.promiseFulfillmentRate != null
      ? `${effectivenessKpis.promiseFulfillmentRate}%`
      : "—";
  const rateSub =
    effectivenessKpis.overduePromisesCount > 0
      ? `${effectivenessKpis.overduePromisesCount} vencida${effectivenessKpis.overduePromisesCount !== 1 ? "s" : ""} sin cobrar`
      : "sin promesas vencidas";

  const cobrosTruncationNote = cobrosDataTruncated
    ? "datos parciales — historial truncado"
    : undefined;
  const cobrosUyuLabel =
    effectivenessKpis.cobrosUyu > 0
      ? formatMoneyCurrency(effectivenessKpis.cobrosUyu, "UYU")
      : "—";
  const cobrosUsdLabel =
    effectivenessKpis.cobrosUsd > 0
      ? formatMoneyCurrency(effectivenessKpis.cobrosUsd, "USD")
      : "—";
  const cobrosTotalUsd =
    mode === "usd_equivalent"
      ? convertToUsdEquivalent(
          { uyu: effectivenessKpis.cobrosUyu, usd: effectivenessKpis.cobrosUsd },
          fxRate
        )
      : 0;
  const cobrosTotalLabel =
    mode === "usd_equivalent" &&
    (effectivenessKpis.cobrosUyu > 0 || effectivenessKpis.cobrosUsd > 0)
      ? formatUsdEquivalent(cobrosTotalUsd)
      : "—";

  const contactedLabel = `${effectivenessKpis.clientsContactedCount} / ${effectivenessKpis.clientsWithDebtCount}`;
  const contactedSub = "clientes con deuda contactados";
  const contactRatePct =
    effectivenessKpis.clientsWithDebtCount > 0
      ? (effectivenessKpis.clientsContactedCount / effectivenessKpis.clientsWithDebtCount) * 100
      : null;
  const contactedTone: "neutral" | "warning" =
    contactRatePct != null && contactRatePct < 50 ? "warning" : "neutral";

  return (
    <div className="space-y-2">
      {/* Row 1: portfolio state */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard
          label="Pendiente"
          value={totalLabel}
          sub={`${kpis.clientsWithDebtCount} clientes`}
        />
        <KpiCard
          label="Atrasado"
          value={overdueLabel}
          sub={
            kpis.clientsCollectionOverdueCount > 0
              ? `${kpis.clientsCollectionOverdueCount} clientes · +7 días`
              : "+7 días desde emisión"
          }
          tone={hasOverdue ? "danger" : "neutral"}
        />
        <KpiCard
          label="Clientes atrasados"
          value={String(kpis.clientsCollectionOverdueCount)}
          sub="con factura de más de 7 días"
          tone={kpis.clientsCollectionOverdueCount > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Promesas activas"
          value={String(kpis.activePromisesCount)}
          sub="compromisos de pago pendientes"
          tone="neutral"
        />
      </div>

      {/* Row 2: effectiveness */}
      <div className={`grid grid-cols-2 gap-2 ${mode === "usd_equivalent" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <KpiCard
          label="Cumplimiento"
          value={rateLabel}
          sub={rateSub}
          tone={fulfillmentTone(effectivenessKpis.promiseFulfillmentRate)}
        />
        {mode === "usd_equivalent" ? (
          <KpiCard
            label="Cobros este mes"
            value={cobrosTotalLabel}
            sub={cobrosTruncationNote ?? `TC ${fxRate}`}
          />
        ) : (
          <>
            <KpiCard
              label="Cobros este mes (UYU)"
              value={cobrosUyuLabel}
              sub={cobrosTruncationNote ?? "pesos cobrados"}
            />
            <KpiCard
              label="Cobros este mes (USD)"
              value={cobrosUsdLabel}
              sub={cobrosTruncationNote ?? "dólares cobrados"}
            />
          </>
        )}
        <KpiCard
          label="Contactados"
          value={contactedLabel}
          sub={contactedSub}
          tone={contactedTone}
        />
      </div>
    </div>
  );
}
