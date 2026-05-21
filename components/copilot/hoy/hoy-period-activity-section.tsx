"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { HoyPeriodActivityBlock } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY, shouldShowCollectionExceedsBillingNote } from "@/lib/copilot-hoy-ui-contract";
import { formatHoyPeriodLabel, type HoyPeriodRange } from "@/lib/copilot-hoy-period";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

import { HoyScopeBadge } from "./hoy-scope-badge";
import { moneyToneClass, type MoneyTone } from "./hoy-money-value";

function MetricRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: MoneyTone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--copilot-ink-muted)]">{label}</span>
      <span className={moneyToneClass(tone)}>{value}</span>
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
      <div className="mt-3 space-y-2 text-sm">
        <MetricRow
          label={HOY_COPY.periodBilledLabel}
          value={block.billedNet > 0 ? fmtCurrencyAmount(block.billedNet, c) : "—"}
          tone="neutral"
        />
        <MetricRow
          label={HOY_COPY.periodCollectedLabel}
          value={block.collectedInPeriod > 0 ? fmtCurrencyAmount(block.collectedInPeriod, c) : "—"}
          tone="positive"
        />
        {block.creditNoteAmount > 0 ? (
          <MetricRow
            label={HOY_COPY.periodCreditNotesLabel}
            value={fmtCurrencyAmount(block.creditNoteAmount, c)}
            tone="neutral"
          />
        ) : null}
        <MetricRow
          label={HOY_COPY.periodManualIncomeLabel}
          value={fmtCurrencyAmount(block.manualIncome, c)}
          tone="positive"
        />
        <MetricRow
          label={HOY_COPY.periodManualExpenseLabel}
          value={fmtCurrencyAmount(block.manualExpense, c)}
          tone="danger"
        />
        <div className="border-t border-dashed border-[var(--copilot-border)] pt-2">
          <MetricRow
            label={HOY_COPY.periodOperatingResultLabel}
            value={fmtCurrencyAmount(block.operatingResult, c)}
            tone={resultTone}
          />
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COPY.periodOperatingResultHelper}
        </p>
      </div>
      {showNote ? (
        <p className="mt-2 text-[10px] text-[var(--copilot-ink-muted)]">
          Cobraste más de lo facturado en el período porque hay cobros de facturas anteriores.
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
    <CopilotCard>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
          {HOY_COPY.periodActivityTitle} · {periodLabel}
        </h2>
        <HoyScopeBadge label={`${HOY_COPY.scopeBadgePeriod} · ${periodLabel}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <ActivityCurrencyCard key={block.currency} block={block} />
        ))}
      </div>
    </CopilotCard>
  );
}
