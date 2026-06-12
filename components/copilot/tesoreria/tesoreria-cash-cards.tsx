"use client";

import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { ManualCashMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { metricValueClass, premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
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

  return (
    <div
      className={`flex min-h-[220px] flex-col ${premiumCardClass} p-5 ${
        isNegative ? "border-[var(--copilot-danger-border)]/80 bg-gradient-to-br from-white to-rose-50/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isNegative ? "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-danger-text-strong)]" : "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-success-text-strong)]"
            }`}
          >
            Caja disponible
          </span>
          <p className="mt-1.5 text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-3 text-center">
        <p
          className={`text-[2rem] leading-none tracking-tight xl:text-[2.15rem] ${metricValueClass} ${
            isNegative ? "text-[var(--copilot-danger-text-strong)]" : "text-[var(--copilot-success-text-strong)]"
          }`}
        >
          {pos ? formatTreasuryMoney(pureAvailable, currency) : "—"}
        </p>
        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
          {pos && !pos.openingConfigured
            ? "Saldo no configurado — cargá el saldo actual."
            : isNegative
              ? "Caja negativa — revisá movimientos."
              : "Dinero disponible al corte + movimientos confirmados."}
        </p>
      </div>

      <div className="mt-auto border-t border-[var(--copilot-border)] pt-3">
        <CashEventLine label="Último ingreso" event={lastIncome} emptyLabel="Sin ingresos registrados" />
        <CashEventLine label="Último egreso" event={lastExpense} emptyLabel="Sin egresos registrados" />
      </div>

    </div>
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
