"use client";

import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { ManualCashMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

function isOpeningBalanceProxy(m: ManualCashMovement): boolean {
  if (m.metadata?.kind === "opening_balance") return true;
  if (
    m.concept.toLowerCase().trim() === "caja inicial" &&
    typeof m.metadata?.planned_obligation_id === "string"
  ) {
    return true;
  }
  return false;
}

function lastCashEvent(
  movements: readonly ManualCashMovement[],
  currency: TreasuryCurrencyCode,
  movementType: "income" | "expense"
): ManualCashMovement | null {
  const match = movements
    .filter(
      (m) =>
        m.status === "active" &&
        m.affectsCashflow &&
        !isOpeningBalanceProxy(m) &&
        m.currencyCode === currency &&
        m.movementType === movementType
    )
    .sort((a, b) => {
      if (b.movementDate !== a.movementDate) return b.movementDate.localeCompare(a.movementDate);
      return b.createdAt.localeCompare(a.createdAt);
    });
  return match[0] ?? null;
}

function formatEventDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function CashEventLine({
  label,
  event,
  emptyLabel,
}: {
  label: string;
  event: ManualCashMovement | null;
  emptyLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="font-medium text-[var(--copilot-ink-muted)]">{label}</span>
      {event ? (
        <span className="max-w-[58%] text-right leading-snug text-[var(--copilot-ink)]">
          <span className="font-semibold tabular-nums">{formatEventDate(event.movementDate)}</span>
          <span className="mt-0.5 block truncate text-[var(--copilot-ink-muted)]">{event.concept}</span>
        </span>
      ) : (
        <span className="text-[var(--copilot-ink-muted)]">{emptyLabel}</span>
      )}
    </div>
  );
}

function TesoreriaCashCard({
  currency,
  workspace,
}: {
  currency: TreasuryCurrencyCode;
  workspace: TreasuryWorkspace;
}) {
  const pos = workspace.cashPositions.find((p) => p.currency === currency);

  const pureAvailable =
    (pos?.openingBalance ?? 0) +
    (pos?.collectedFromClients ?? 0) +
    (pos?.manualIncome ?? 0) -
    (pos?.manualExpense ?? 0) +
    (pos?.adjustments ?? 0) +
    (pos?.transfersNet ?? 0);
  const isNegative = pureAvailable < 0;
  const title = currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const lastIncome = lastCashEvent(workspace.manualMovements, currency, "income");
  const lastExpense = lastCashEvent(workspace.manualMovements, currency, "expense");

  const subtitle =
    pos && !pos.openingConfigured
      ? "Saldo no configurado — cargá el saldo actual."
      : isNegative
        ? "Caja negativa — revisá movimientos."
        : "Dinero disponible al corte + movimientos confirmados.";

  return (
    <CopilotKpiCard
      size="hero"
      tone={isNegative ? "danger" : "neutral"}
      ariaLabel={`Caja disponible ${title}`}
      eyebrow={
        <span className="text-sm font-semibold normal-case tracking-normal text-[var(--copilot-ink)]">
          {title}
        </span>
      }
      badge={
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isNegative
              ? "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-danger-text-strong)]"
              : "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-success-text-strong)]"
          }`}
        >
          Caja disponible
        </span>
      }
      value={pos ? formatTreasuryMoney(pureAvailable, currency) : "—"}
      valueClassName={
        isNegative
          ? "text-[var(--copilot-danger-text-strong)]"
          : "text-[var(--copilot-success-text-strong)]"
      }
      subtitle={subtitle}
      footer={
        <div className="border-t border-[var(--copilot-border)]">
          <CashEventLine label="Último ingreso" event={lastIncome} emptyLabel="Sin ingresos registrados" />
          <CashEventLine label="Último egreso" event={lastExpense} emptyLabel="Sin egresos registrados" />
        </div>
      }
    />
  );
}

/** Cards hero UYU/USD — solo en el header global de Tesorería. */
export function TesoreriaCashCards({ workspace }: { workspace: TreasuryWorkspace }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {CURRENCIES.map((currency) => (
        <TesoreriaCashCard key={currency} currency={currency} workspace={workspace} />
      ))}
    </div>
  );
}
