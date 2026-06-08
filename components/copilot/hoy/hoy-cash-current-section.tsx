"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { HoyCashPositionBlock } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

function CashCurrencyBlock({ block }: { block: HoyCashPositionBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">{HOY_COPY.cashCollectedLabel}</span>
          <span className="tabular-nums text-[var(--copilot-ink)]">
            {block.collectedFromClients > 0
              ? fmtCurrencyAmount(block.collectedFromClients, block.currency)
              : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Ingresos manuales</span>
          <span className="tabular-nums text-emerald-800">
            {fmtCurrencyAmount(block.manualIncome, block.currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Egresos manuales</span>
          <span className="tabular-nums text-rose-800">
            {fmtCurrencyAmount(block.manualExpense, block.currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <span className="font-medium text-[var(--copilot-ink)]">{HOY_COPY.availableCashLabel}</span>
          <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(block.availableCash, block.currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Último movimiento</span>
          {block.lastMovement ? (
            <span className="max-w-[55%] truncate text-right text-xs text-[var(--copilot-ink)]">
              {block.lastMovement.date} · {block.lastMovement.concept}
            </span>
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>
          )}
        </div>
      </div>
      {!block.openingConfigured ? (
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
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
    <CopilotCard>
      <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
        {HOY_COPY.cashCurrentTitle}
      </h2>
      <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]" title={HOY_COPY.cashCurrentTip}>
        Sin deuda pendiente en caja disponible.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <CashCurrencyBlock key={block.currency} block={block} />
        ))}
      </div>
    </CopilotCard>
  );
}
