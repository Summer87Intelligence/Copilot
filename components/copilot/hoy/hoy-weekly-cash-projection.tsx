"use client";

import { useMemo } from "react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { formatUsdEquivalent } from "@/lib/currency-display-mode";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import {
  buildWeeklyCashProjection,
  type WeeklyCashEntry,
  type WeeklyProjectionRow,
} from "@/lib/weekly-cash-projection";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  today: string;
  cashPositions?: CashPositionByCurrency[];
  scheduledPayments?: TreasuryScheduledPayment[];
  manualCashMovements?: readonly ManualCashMovement[];
};

// ─── Status classes ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  WeeklyProjectionRow["status"],
  { bg: string; text: string; border: string }
> = {
  green: {
    bg: "bg-[var(--copilot-tone-positive-bg)]",
    text: "text-[var(--copilot-success-text-strong)]",
    border: "border-[var(--copilot-success-border)]",
  },
  orange: {
    bg: "bg-[var(--copilot-tone-warning-bg)]",
    text: "text-[var(--copilot-warning-text-strong)]",
    border: "border-[var(--copilot-warning-border)]",
  },
  red: {
    bg: "bg-[var(--copilot-tone-danger-bg)]",
    text: "text-[var(--copilot-danger-text-strong)]",
    border: "border-[var(--copilot-danger-border)]",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDelta(delta: number, prefix: string): string {
  const sign = delta >= 0 ? "+" : "-";
  const abs = Math.abs(delta);
  const formatted = abs.toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${sign}${prefix}${formatted}`;
}

function fmtDeltaUsd(delta: number): string {
  const sign = delta >= 0 ? "+" : "-";
  const abs = Math.abs(delta);
  const formatted = abs.toLocaleString("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}USD ${formatted}`;
}

// ─── Row card ─────────────────────────────────────────────────────────────────

function ProjectionRowCard({
  row,
  displayMode,
  fxRate,
}: {
  row: WeeklyProjectionRow;
  displayMode: "native" | "usd_equivalent";
  fxRate: number;
}) {
  const badge = STATUS_BADGE[row.status];
  const showDelta = !row.isToday;

  // Native mode risk labels
  const nativeRiskLabel =
    displayMode === "native" && !row.isToday
      ? [row.uyuNegative ? "UYU en riesgo" : null, row.usdNegative ? "USD en riesgo" : null]
          .filter(Boolean)
          .join(" · ")
      : null;

  const effectiveBadgeText = nativeRiskLabel || row.statusLabel;

  return (
    <div
      className={`flex w-[9.5rem] shrink-0 snap-start flex-col gap-1 rounded-xl border px-3 py-2.5 sm:w-[10.5rem]
        ${row.isToday ? "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]" : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]"}`}
    >
      {/* Date label */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
        {row.label}
      </p>

      {/* Main balance */}
      {displayMode === "usd_equivalent" ? (
        <div>
          <p className="whitespace-nowrap text-[1.2rem] font-semibold leading-none tracking-tight text-[var(--copilot-ink)]">
            {formatUsdEquivalent(row.usdEquivalent)}
          </p>
          {row.isToday && (
            <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
              equiv. USD · TC {fxRate}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          <p className="whitespace-nowrap text-[1rem] font-semibold leading-none tracking-tight text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(row.uyu, "UYU")}
          </p>
          <p className="whitespace-nowrap text-[1rem] font-semibold leading-none tracking-tight text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(row.usd, "USD")}
          </p>
        </div>
      )}

      {/* Delta vs hoy */}
      {showDelta && (
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">
          {displayMode === "usd_equivalent"
            ? `${fmtDeltaUsd(row.deltaUsdEquivalent)} vs hoy`
            : `${fmtDelta(row.deltaUyu, "$ ")} · ${fmtDelta(row.deltaUsd, "U$S ")} vs hoy`}
        </p>
      )}

      {/* Status badge */}
      <span
        className={`mt-auto inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold
          ${badge.bg} ${badge.text} ${badge.border}`}
      >
        {effectiveBadgeText}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HoyWeeklyCashProjection({
  today,
  cashPositions,
  scheduledPayments,
  manualCashMovements,
}: Props) {
  const { mode, fxRate } = useDisplayCurrency();

  const cashUyu = cashPositions?.find((p) => p.currency === "UYU")?.availableCash ?? 0;
  const cashUsd = cashPositions?.find((p) => p.currency === "USD")?.availableCash ?? 0;

  // Outflows: pagos programados pendientes con fecha futura
  const outflows = useMemo((): WeeklyCashEntry[] => {
    if (!scheduledPayments) return [];
    return scheduledPayments
      .filter((p) => p.status === "scheduled" || p.status === "overdue")
      .map((p) => ({ date: p.dueDate, currency: p.currency, amount: p.amount }));
  }, [scheduledPayments]);

  // Inflows: ingresos manuales con fecha futura (entradas programadas)
  const inflows = useMemo((): WeeklyCashEntry[] => {
    if (!manualCashMovements) return [];
    return (manualCashMovements as ManualCashMovement[])
      .filter(
        (m) =>
          m.movementType === "income" &&
          m.status === "active" &&
          m.affectsCashflow &&
          m.movementDate > today
      )
      .map((m) => ({ date: m.movementDate, currency: m.currencyCode, amount: m.amount }));
  }, [manualCashMovements, today]);

  const rows = useMemo(
    () =>
      buildWeeklyCashProjection({
        today,
        cashUyu,
        cashUsd,
        outflows,
        inflows,
        fxRate,
      }),
    [today, cashUyu, cashUsd, outflows, inflows, fxRate]
  );

  return (
    <CopilotCard className="w-full !p-3">
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
          {HOY_COPY.weeklyProjectionTitle}
        </h2>
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">
          {HOY_COPY.weeklyProjectionTip}
        </p>
      </div>

      {/* Timeline — scroll horizontal cuando hay varios viernes */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
        {rows.map((row) => (
          <ProjectionRowCard
            key={row.date}
            row={row}
            displayMode={mode}
            fxRate={fxRate}
          />
        ))}
      </div>
    </CopilotCard>
  );
}
