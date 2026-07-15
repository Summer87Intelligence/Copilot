"use client";

import type { CobranzaKpis } from "@/lib/copilot-cobranza-summary";
import type { CobranzaEffectivenessKpis } from "@/lib/copilot-cobranza-effectiveness";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { FinancialMetricCard } from "@/components/copilot/ui/financial-metric-card";
import type { MetricTone } from "@/lib/ui/financial-metric-card-model";
import {
  buildCobranzaMoneyValues,
  contactedTone as computeContactedTone,
  fulfillmentTone,
} from "@/lib/ui/cobranza-kpi-cards-model";

/**
 * KPIs de Cobranza sobre DS-Core (`FinancialMetricCard`).
 *
 * Regla S4: UYU y USD SIEMPRE separados (apilados con su label), nunca
 * combinados inline (`$… · U$S…`). No se tocan las fórmulas ni las
 * definiciones de cobrado aplicado / registrado.
 */

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
  const isEquiv = mode === "usd_equivalent";

  /** Props de moneda separadas (native) o equivalente USD (modo equiv). */
  function moneyProps(uyu: number, usd: number) {
    if (isEquiv) {
      const hasAny = uyu > 0 || usd > 0;
      const total = convertToUsdEquivalent({ uyu, usd }, fxRate);
      return { value: { primary: hasAny ? formatUsdEquivalent(total) : "—" } };
    }
    const values = buildCobranzaMoneyValues(uyu, usd, formatMoneyCurrency);
    return values.length > 0 ? { values } : { emptyText: "—" };
  }

  const hasOverdue = kpis.collectionOverdueUyu > 0 || kpis.collectionOverdueUsd > 0;

  const rateLabel =
    effectivenessKpis.promiseFulfillmentRate != null
      ? `${effectivenessKpis.promiseFulfillmentRate}%`
      : "—";
  const rateSub =
    effectivenessKpis.overduePromisesCount > 0
      ? `${effectivenessKpis.overduePromisesCount} atrasada${effectivenessKpis.overduePromisesCount !== 1 ? "s" : ""} sin cobrar`
      : "sin promesas atrasadas";

  const cobrosNote = cobrosDataTruncated
    ? "datos parciales — historial truncado"
    : "cobros registrados del mes";

  const contactedLabel = `${effectivenessKpis.clientsContactedCount} / ${effectivenessKpis.clientsWithDebtCount}`;
  const contactedToneValue: MetricTone = computeContactedTone(
    effectivenessKpis.clientsContactedCount,
    effectivenessKpis.clientsWithDebtCount
  );

  return (
    <div className="space-y-2">
      {/* Fila 1: estado de cartera */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
        <FinancialMetricCard
          label="Pendiente"
          {...moneyProps(kpis.totalDebtUyu, kpis.totalDebtUsd)}
          footnote={{ text: `${kpis.clientsWithDebtCount} clientes` }}
        />
        <FinancialMetricCard
          label="Atrasado"
          {...moneyProps(kpis.collectionOverdueUyu, kpis.collectionOverdueUsd)}
          tone={hasOverdue ? "danger" : "neutral"}
          footnote={{
            text:
              kpis.clientsCollectionOverdueCount > 0
                ? `${kpis.clientsCollectionOverdueCount} clientes · +7 días`
                : "+7 días desde emisión",
            tone: hasOverdue ? "danger" : "neutral",
          }}
        />
        <FinancialMetricCard
          label="Clientes atrasados"
          value={{ primary: String(kpis.clientsCollectionOverdueCount) }}
          tone={kpis.clientsCollectionOverdueCount > 0 ? "warning" : "neutral"}
          footnote={{ text: "con factura de más de 7 días" }}
        />
        <FinancialMetricCard
          label="Promesas activas"
          value={{ primary: String(kpis.activePromisesCount) }}
          footnote={{ text: "compromisos de pago pendientes" }}
        />
      </div>

      {/* Fila 2: efectividad */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:items-stretch">
        <FinancialMetricCard
          label="Cumplimiento"
          value={{ primary: rateLabel }}
          tone={fulfillmentTone(effectivenessKpis.promiseFulfillmentRate)}
          footnote={{ text: rateSub }}
        />
        <FinancialMetricCard
          label="Cobros del mes"
          {...moneyProps(effectivenessKpis.cobrosUyu, effectivenessKpis.cobrosUsd)}
          footnote={{ text: cobrosNote }}
        />
        <FinancialMetricCard
          label="Contactados"
          value={{ primary: contactedLabel }}
          tone={contactedToneValue}
          footnote={{ text: "clientes con deuda contactados" }}
        />
      </div>
    </div>
  );
}
