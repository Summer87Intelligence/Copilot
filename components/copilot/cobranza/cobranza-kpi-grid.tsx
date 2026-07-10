"use client";

import type { CobranzaKpis } from "@/lib/copilot-cobranza-summary";
import type { CobranzaEffectivenessKpis } from "@/lib/copilot-cobranza-effectiveness";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";


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
      ? `${effectivenessKpis.overduePromisesCount} atrasada${effectivenessKpis.overduePromisesCount !== 1 ? "s" : ""} sin cobrar`
      : "sin promesas atrasadas";

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
        <CopilotKpiCard
          eyebrow="Pendiente"
          value={totalLabel}
          subtitle={`${kpis.clientsWithDebtCount} clientes`}
        />
        <CopilotKpiCard
          eyebrow="Atrasado"
          value={overdueLabel}
          subtitle={
            kpis.clientsCollectionOverdueCount > 0
              ? `${kpis.clientsCollectionOverdueCount} clientes · +7 días`
              : "+7 días desde emisión"
          }
          tone={hasOverdue ? "danger" : "neutral"}
        />
        <CopilotKpiCard
          eyebrow="Clientes atrasados"
          value={String(kpis.clientsCollectionOverdueCount)}
          subtitle="con factura de más de 7 días"
          tone={kpis.clientsCollectionOverdueCount > 0 ? "warning" : "neutral"}
        />
        <CopilotKpiCard
          eyebrow="Promesas activas"
          value={String(kpis.activePromisesCount)}
          subtitle="compromisos de pago pendientes"
        />
      </div>

      {/* Row 2: effectiveness */}
      <div className={`grid grid-cols-2 gap-2 ${mode === "usd_equivalent" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <CopilotKpiCard
          eyebrow="Cumplimiento"
          value={rateLabel}
          subtitle={rateSub}
          tone={fulfillmentTone(effectivenessKpis.promiseFulfillmentRate)}
        />
        {mode === "usd_equivalent" ? (
          <CopilotKpiCard
            eyebrow="Cobros este mes"
            value={cobrosTotalLabel}
            subtitle={cobrosTruncationNote ?? `TC ${fxRate}`}
          />
        ) : (
          <>
            <CopilotKpiCard
              eyebrow="Cobros este mes (UYU)"
              value={cobrosUyuLabel}
              subtitle={cobrosTruncationNote ?? "pesos cobrados"}
            />
            <CopilotKpiCard
              eyebrow="Cobros este mes (USD)"
              value={cobrosUsdLabel}
              subtitle={cobrosTruncationNote ?? "dólares cobrados"}
            />
          </>
        )}
        <CopilotKpiCard
          eyebrow="Contactados"
          value={contactedLabel}
          subtitle={contactedSub}
          tone={contactedTone}
        />
      </div>
    </div>
  );
}
