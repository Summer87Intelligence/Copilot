"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { HoyPeriodActivityBlock } from "@/lib/copilot-today-business-pulse";
import {
  COLLECTION_EXCEEDS_BILLING_NOTE,
  HOY_COPY,
  shouldShowCollectionExceedsBillingNote,
} from "@/lib/copilot-hoy-ui-contract";
import { formatHoyPeriodLabel, type HoyPeriodRange } from "@/lib/copilot-hoy-period";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

import { HoyMetricLabel } from "./hoy-metric-label";
import { HoyScopeBadge } from "./hoy-scope-badge";
import { moneyToneClass, type MoneyTone } from "./hoy-money-value";

function DetailMetric({
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
      <HoyMetricLabel label={label} tip={tip} />
      <span className={`tabular-nums ${moneyToneClass(tone)}`}>{value}</span>
    </div>
  );
}

function ActivityCurrencyCard({ block }: { block: HoyPeriodActivityBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const c = block.currency;
  const resultTone: MoneyTone = block.operatingResult >= 0 ? "positive" : "danger";
  const showNote = shouldShowCollectionExceedsBillingNote(block.billedNet, block.collectedInPeriod);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-1.5 text-[var(--copilot-ink-muted)]">
        <DetailMetric
          label={HOY_COPY.periodBilledLabel}
          tip={HOY_COPY.periodBilledTip}
          value={block.billedNet > 0 ? fmtCurrencyAmount(block.billedNet, c) : "—"}
        />
        <DetailMetric
          label={HOY_COPY.periodCollectedLabel}
          tip={HOY_COPY.periodCollectedTip}
          value={
            block.collectedInPeriod > 0 ? fmtCurrencyAmount(block.collectedInPeriod, c) : "—"
          }
          tone="positive"
        />
        {block.creditNoteAmount > 0 ? (
          <DetailMetric
            label={HOY_COPY.periodCreditNotesLabel}
            value={fmtCurrencyAmount(block.creditNoteAmount, c)}
          />
        ) : null}
        <DetailMetric
          label={HOY_COPY.periodManualIncomeLabel}
          value={fmtCurrencyAmount(block.manualIncome, c)}
          tone="positive"
        />
        <DetailMetric
          label={HOY_COPY.periodManualExpenseLabel}
          value={fmtCurrencyAmount(block.manualExpense, c)}
          tone="danger"
        />
      </div>
      <div className="mt-4 rounded-lg border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.03)] px-3 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <HoyMetricLabel
            label={HOY_COPY.periodOperatingResultLabel}
            tip={HOY_COPY.periodOperatingResultTip}
            className="text-sm font-semibold text-[var(--copilot-ink)]"
          />
          <span className={`text-lg font-bold tabular-nums ${moneyToneClass(resultTone)}`}>
            {fmtCurrencyAmount(block.operatingResult, c)}
          </span>
        </div>
      </div>
      {showNote ? (
        <p className="mt-2 text-[10px] text-[var(--copilot-ink-muted)]" title={COLLECTION_EXCEEDS_BILLING_NOTE}>
          Cobraste más de lo facturado en el período.
        </p>
      ) : null}
    </div>
  );
}

export function HoyPeriodActivitySection({
  blocks,
  periodRange,
}: {
  blocks: HoyPeriodActivityBlock[];
  periodRange: HoyPeriodRange;
}) {
  if (blocks.length === 0) return null;

  const periodLabel = formatHoyPeriodLabel(periodRange);

  return (
    <CopilotCard className="!p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold text-[var(--copilot-ink-muted)]">
          {HOY_COPY.periodActivityTitle} · {periodLabel}
        </h2>
        <HoyScopeBadge label={`${HOY_COPY.scopeBadgePeriod} · ${periodLabel}`} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {blocks.map((block) => (
          <ActivityCurrencyCard key={block.currency} block={block} />
        ))}
      </div>
    </CopilotCard>
  );
}
