"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { HoyCurrentStateBlock } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

import { HoyMetricLabel } from "./hoy-metric-label";
import { HoyScopeBadge } from "./hoy-scope-badge";
import { moneyToneClass, type MoneyTone } from "./hoy-money-value";
import {
  actionCardClass,
  metricValueClass,
  neutralFinancialCardClass,
  subtleLabelClass,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";

function PrimaryMetric({
  label,
  tip,
  value,
  tone = "neutral",
}: {
  label: string;
  tip?: string;
  value: string;
  tone?: MoneyTone;
}) {
  return (
    <div className={`${actionCardClass} rounded-lg px-3 py-2.5`}>
      <div className="flex items-baseline justify-between gap-2">
        <HoyMetricLabel label={label} tip={tip} className="text-sm font-medium text-[var(--copilot-ink)]" />
        <span className={`text-base ${metricValueClass} ${moneyToneClass(tone)}`}>{value}</span>
      </div>
    </div>
  );
}

function SecondaryMetric({
  label,
  tip,
  value,
  tone = "neutral",
}: {
  label: string;
  tip?: string;
  value: string;
  tone?: MoneyTone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <HoyMetricLabel label={label} tip={tip} className="text-[var(--copilot-ink-muted)]" />
      <span className={`tabular-nums ${moneyToneClass(tone)}`}>{value}</span>
    </div>
  );
}

function CurrentCurrencyCard({ block }: { block: HoyCurrentStateBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const c = block.currency;

  return (
    <div className={`${neutralFinancialCardClass} rounded-xl border p-4`}>
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-2">
        <PrimaryMetric
          label={HOY_COPY.availableCashEstimatedLabel}
          tip={HOY_COPY.cashCurrentTip}
          value={fmtCurrencyAmount(block.cashAvailable, c)}
        />
        <PrimaryMetric
          label={HOY_COPY.currentReceivablesLabel}
          tip={HOY_COPY.currentReceivablesTip}
          value={
            block.pendingReceivables > 0 ? fmtCurrencyAmount(block.pendingReceivables, c) : "—"
          }
          tone="warning"
        />
        <PrimaryMetric
          label={HOY_COPY.overdue30Short}
          tip="Parte de la deuda abierta con más de 30 días de atraso."
          value={block.overdue30 > 0 ? fmtCurrencyAmount(block.overdue30, c) : "—"}
          tone="danger"
        />
        <div className={`${warningFinancialCardClass} rounded-lg border border-dashed pt-2 px-2.5 space-y-1.5`}>
          <SecondaryMetric
            label={HOY_COPY.cashCollectedLabel}
            tip={HOY_COPY.cashCollectedTip}
            value={
              block.collectedAccumulated > 0
                ? fmtCurrencyAmount(block.collectedAccumulated, c)
                : "—"
            }
          />
          <SecondaryMetric
            label="Ingresos manuales"
            value={fmtCurrencyAmount(block.manualIncome, c)}
            tone="positive"
          />
          <SecondaryMetric
            label="Egresos manuales"
            value={fmtCurrencyAmount(block.manualExpense, c)}
            tone="danger"
          />
          <SecondaryMetric
            label={HOY_COPY.activeDebtorsLabel}
            value={String(block.debtorClients)}
          />
        </div>
      </div>
    </div>
  );
}

export function HoyCurrentStateSection({ blocks }: { blocks: HoyCurrentStateBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <CopilotCard className="!p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`text-xs ${subtleLabelClass}`}>{HOY_COPY.currentStateTitle}</h2>
        <HoyScopeBadge label={HOY_COPY.scopeBadgeCurrent} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {blocks.map((block) => (
          <CurrentCurrencyCard key={block.currency} block={block} />
        ))}
      </div>
    </CopilotCard>
  );
}
