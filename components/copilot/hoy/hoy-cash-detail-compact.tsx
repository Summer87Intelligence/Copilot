"use client";

import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { HoyCashPositionBlock } from "@/lib/copilot-hoy-treasury";
import { copilotCurrencyClass } from "@/components/copilot/ui/copilot-visual-system";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

function formatCashEventDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

/** UI-only: el concepto ya viene fusionado (manual o Zeta) sin alterar cálculos. */
export function formatLastIncomeOrigin(concept: string): string {
  const trimmed = concept.trim();
  if (/^Recibo\b/i.test(trimmed)) {
    const ref = trimmed.replace(/^Recibo\s*/i, "").trim() || trimmed;
    return `Recibo Zeta: ${ref}`;
  }
  return `Ingreso manual: ${trimmed}`;
}

export function formatLastExpenseOrigin(concept: string): string {
  const trimmed = concept.trim();
  if (/^Pago\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^Pago\s*:?\s*/i, "").trim();
    return rest ? `Pago: ${rest}` : trimmed;
  }
  return `Egreso manual: ${trimmed}`;
}

function lookupMovementAmount(
  movements: readonly ManualCashMovement[] | undefined,
  currency: HoyCashPositionBlock["currency"],
  date: string,
  concept: string,
  movementType: "income" | "expense"
): number | null {
  if (!movements?.length) return null;
  const match = movements.find(
    (m) =>
      m.currencyCode === currency &&
      m.movementDate === date &&
      m.concept === concept &&
      m.movementType === movementType &&
      m.status === "active"
  );
  return match && Number.isFinite(match.amount) ? match.amount : null;
}

function LastMovementRow({
  label,
  event,
  emptyLabel,
  origin,
  amount,
  currency,
}: {
  label: string;
  event: { date: string; concept: string } | null;
  emptyLabel: string;
  origin?: string;
  amount: number | null;
  currency: HoyCashPositionBlock["currency"];
}) {
  if (!event) {
    return (
      <div className="py-0.5">
        <p className="text-[10px] font-semibold leading-snug text-[var(--copilot-ink-muted)]">{label}</p>
        <p className="text-[10px] leading-snug text-[var(--copilot-ink-muted)]">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <div className="min-w-0 flex-1">
        <p
          className="text-[10px] font-semibold leading-snug text-[var(--copilot-ink-muted)]"
          title={label}
        >
          {label}
        </p>
        <p className="text-[10px] tabular-nums text-[var(--copilot-ink)]">
          {formatCashEventDate(event.date)}
        </p>
        {origin ? (
          <p className="truncate text-[10px] leading-snug text-[var(--copilot-ink-muted)]" title={origin}>
            {origin}
          </p>
        ) : null}
      </div>
      {amount != null ? (
        <span className="shrink-0 pt-3 text-[10px] font-semibold tabular-nums text-[var(--copilot-ink)]">
          {fmtCurrencyAmount(amount, currency)}
        </span>
      ) : null}
    </div>
  );
}

function CurrencyLastMovements({
  block,
  manualMovements,
}: {
  block: HoyCashPositionBlock;
  manualMovements?: readonly ManualCashMovement[];
}) {
  const currencyClass = copilotCurrencyClass(block.currency);
  const incomeAmount = block.lastIncome
    ? lookupMovementAmount(
        manualMovements,
        block.currency,
        block.lastIncome.date,
        block.lastIncome.concept,
        "income"
      )
    : null;
  const expenseAmount = block.lastExpense
    ? lookupMovementAmount(
        manualMovements,
        block.currency,
        block.lastExpense.date,
        block.lastExpense.concept,
        "expense"
      )
    : null;

  return (
    <div className="border-t border-[var(--copilot-border)]/70 pt-2 first:border-t-0 first:pt-0">
      <p className={`text-[10px] font-bold uppercase tracking-wide ${currencyClass}`}>
        {block.currency}
      </p>
      <div className="mt-1 space-y-1">
        <LastMovementRow
          label={HOY_COPY.lastIncomeLabel}
          event={block.lastIncome}
          emptyLabel={HOY_COPY.noIncomeRegistered}
          origin={block.lastIncome ? formatLastIncomeOrigin(block.lastIncome.concept) : undefined}
          amount={incomeAmount}
          currency={block.currency}
        />
        <LastMovementRow
          label={HOY_COPY.lastExpenseLabel}
          event={block.lastExpense}
          emptyLabel={HOY_COPY.noExpenseRegistered}
          origin={block.lastExpense ? formatLastExpenseOrigin(block.lastExpense.concept) : undefined}
          amount={expenseAmount}
          currency={block.currency}
        />
      </div>
    </div>
  );
}

export function HoyCashDetailCompact({
  blocks,
  manualMovements,
}: {
  blocks: HoyCashPositionBlock[];
  manualMovements?: readonly ManualCashMovement[];
}) {
  if (blocks.length === 0) return null;

  const ordered = [...blocks].sort((a, b) => (a.currency === "UYU" ? -1 : b.currency === "UYU" ? 1 : 0));

  return (
    <div className="space-y-2">
      <header className="min-w-0">
        <p className="text-[11px] font-semibold leading-snug text-[var(--copilot-ink)]">
          {HOY_COPY.cashLastMovementsTitle}
        </p>
        <p
          className="mt-0.5 text-[10px] leading-snug text-[var(--copilot-ink-muted)]"
          title={HOY_COPY.cashLastMovementsCaption}
        >
          {HOY_COPY.cashLastMovementsCaption}
        </p>
      </header>
      {ordered.map((block) => (
        <CurrencyLastMovements
          key={block.currency}
          block={block}
          manualMovements={manualMovements}
        />
      ))}
    </div>
  );
}
