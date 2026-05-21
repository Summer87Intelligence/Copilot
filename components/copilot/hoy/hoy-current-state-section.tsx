"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { HoyCurrentStateBlock } from "@/lib/copilot-today-business-pulse";
import { CURRENCY_METRIC_LABELS, HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

import { HoyScopeBadge } from "./hoy-scope-badge";
import { moneyToneClass, type MoneyTone } from "./hoy-money-value";

function MetricRow({
  label,
  value,
  tone = "neutral",
  helper,
}: {
  label: string;
  value: string;
  tone?: MoneyTone;
  helper?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[var(--copilot-ink-muted)]">{label}</span>
        <span className={moneyToneClass(tone)}>{value}</span>
      </div>
      {helper ? (
        <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">{helper}</p>
      ) : null}
    </div>
  );
}

function CurrentCurrencyCard({ block }: { block: HoyCurrentStateBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const c = block.currency;

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-2 text-sm">
        <MetricRow
          label={HOY_COPY.cashCollectedLabel}
          value={
            block.collectedAccumulated > 0
              ? fmtCurrencyAmount(block.collectedAccumulated, c)
              : "—"
          }
          helper={HOY_COPY.cashCollectedHelper}
        />
        <MetricRow
          label="Ingresos manuales"
          value={fmtCurrencyAmount(block.manualIncome, c)}
          tone="positive"
        />
        <MetricRow
          label="Egresos manuales"
          value={fmtCurrencyAmount(block.manualExpense, c)}
          tone="danger"
        />
        <div className="border-t border-dashed border-[var(--copilot-border)] pt-2">
          <MetricRow
            label={HOY_COPY.availableCashLabel}
            value={fmtCurrencyAmount(block.cashAvailable, c)}
            tone="neutral"
          />
        </div>
        <MetricRow
          label={HOY_COPY.currentReceivablesLabel}
          value={
            block.pendingReceivables > 0
              ? fmtCurrencyAmount(block.pendingReceivables, c)
              : "—"
          }
          tone="warning"
          helper={HOY_COPY.currentReceivablesHelper}
        />
        <MetricRow
          label={CURRENCY_METRIC_LABELS.overdue30}
          value={block.overdue30 > 0 ? fmtCurrencyAmount(block.overdue30, c) : "—"}
          tone="danger"
        />
        <MetricRow
          label={HOY_COPY.activeDebtorsLabel}
          value={String(block.debtorClients)}
          tone="neutral"
        />
      </div>
    </div>
  );
}

export function HoyCurrentStateSection({ blocks }: { blocks: HoyCurrentStateBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{HOY_COPY.currentStateTitle}</h2>
        <HoyScopeBadge label={HOY_COPY.scopeBadgeCurrent} />
      </div>
      <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">{HOY_COPY.cashCurrentHelper}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <CurrentCurrencyCard key={block.currency} block={block} />
        ))}
      </div>
    </CopilotCard>
  );
}
