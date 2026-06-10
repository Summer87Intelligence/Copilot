"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { metricValueClass, premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
import type { HoyCashPositionBlock } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

function formatCashEventDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function CashEventRow({
  label,
  event,
  emptyLabel,
}: {
  label: string;
  event: { date: string; concept: string } | null;
  emptyLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">{label}</span>
      {event ? (
        <span className="max-w-[58%] text-right text-xs leading-snug text-[var(--copilot-ink)]">
          <span className="font-semibold tabular-nums">{formatCashEventDate(event.date)}</span>
          <span className="mt-0.5 block truncate text-[var(--copilot-ink-muted)]">{event.concept}</span>
        </span>
      ) : (
        <span className="max-w-[58%] text-right text-xs text-[var(--copilot-ink-muted)]">{emptyLabel}</span>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass = "text-[var(--copilot-ink)]",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--copilot-ink-muted)]">{label}</span>
      <span className={`tabular-nums font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function CashCurrencyBlock({ block }: { block: HoyCashPositionBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";

  return (
    <div className={`flex min-h-[280px] flex-col ${premiumCardClass} p-5`}>
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
          {HOY_COPY.availableCashLabel}
        </p>
        <p className={`mt-1 text-[2rem] leading-none tracking-tight xl:text-[2.15rem] ${metricValueClass}`}>
          {fmtCurrencyAmount(block.availableCash, block.currency)}
        </p>
      </div>

      <div className="mt-4 space-y-0.5 border-t border-neutral-100 pt-3">
        <DetailRow
          label={HOY_COPY.cashCollectedLabel}
          value={
            block.collectedFromClients > 0
              ? fmtCurrencyAmount(block.collectedFromClients, block.currency)
              : "—"
          }
        />
        <DetailRow
          label="Ingresos manuales"
          value={fmtCurrencyAmount(block.manualIncome, block.currency)}
          valueClass="text-emerald-800"
        />
        <DetailRow
          label="Egresos manuales"
          value={fmtCurrencyAmount(block.manualExpense, block.currency)}
          valueClass="text-rose-800"
        />
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-1">
        <CashEventRow
          label={HOY_COPY.lastIncomeLabel}
          event={block.lastIncome}
          emptyLabel={HOY_COPY.noIncomeRegistered}
        />
        <CashEventRow
          label={HOY_COPY.lastExpenseLabel}
          event={block.lastExpense}
          emptyLabel={HOY_COPY.noExpenseRegistered}
        />
      </div>

      {!block.openingConfigured ? (
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COPY.cashOpeningNote}
        </p>
      ) : null}
    </div>
  );
}

export function HoyCashCurrentSection({
  blocks,
}: {
  blocks: HoyCashPositionBlock[];
}) {
  if (blocks.length === 0) return null;

  return (
    <CopilotCard className="p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[var(--copilot-ink)]">{HOY_COPY.cashCurrentTitle}</h2>
        <p className="mt-0.5 text-sm text-[var(--copilot-ink-muted)]" title={HOY_COPY.cashCurrentTip}>
          Sin deuda pendiente en caja disponible.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <CashCurrencyBlock key={block.currency} block={block} />
        ))}
      </div>
    </CopilotCard>
  );
}
