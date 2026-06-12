"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

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
    <div className={`flex flex-col ${premiumCardClass}`}>
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
          {HOY_COPY.availableCashLabel}
        </p>
        <p className={`mt-1 text-[1.65rem] leading-none tracking-tight xl:text-[1.85rem] ${metricValueClass}`}>
          {fmtCurrencyAmount(block.availableCash, block.currency)}
        </p>
      </div>

      <div className="mt-4 space-y-0.5 border-t border-[var(--copilot-border)] pt-3">
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
          valueClass="text-[var(--copilot-success-text-strong)]"
        />
        <DetailRow
          label="Egresos manuales"
          value={fmtCurrencyAmount(block.manualExpense, block.currency)}
          valueClass="text-[var(--copilot-danger-text-strong)]"
        />
      </div>

      <div className="mt-3 border-t border-[var(--copilot-border)] pt-1">
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
  const [open, setOpen] = useState(false);

  if (blocks.length === 0) return null;

  const summary = blocks
    .map((block) => `${block.currency} ${fmtCurrencyAmount(block.availableCash, block.currency)}`)
    .join(" · ");

  return (
    <CopilotCard className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-[var(--copilot-ink)]">
            {HOY_COPY.cashCurrentTitle}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]" title={HOY_COPY.cashCurrentTip}>
            {open ? HOY_COPY.cashCurrentTip : summary}
          </span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--copilot-border)] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="grid gap-3 lg:grid-cols-2">
            {blocks.map((block) => (
              <CashCurrencyBlock key={block.currency} block={block} />
            ))}
          </div>
        </div>
      ) : null}
    </CopilotCard>
  );
}
