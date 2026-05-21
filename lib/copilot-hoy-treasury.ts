/**
 * Proyección Hoy ↔ Tesorería (caja actual + pagos programados). Puro, sin LLM.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { CurrencyCode } from "@/lib/copilot-hoy-executive";
import {
  projectedBalanceCoverage,
  type CoverageStatus,
  type TreasuryOutflowSummary,
} from "@/lib/treasury/treasury-scheduled-payments";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";

export type { CoverageStatus };

export type HoyTreasuryAlert = {
  id: string;
  tone: "healthy" | "attention" | "critical";
  message: string;
};

export type HoyCashPositionBlock = {
  currency: CurrencyCode;
  openingConfigured: boolean;
  currentCash: number;
  manualIncome: number;
  manualExpense: number;
  lastMovement: { date: string; concept: string } | null;
  scheduledOutflows30d: number | null;
  projectedBalance30d: number | null;
  coverageStatus: CoverageStatus;
  hasConfiguredOutflows: boolean;
};

function positionForCurrency(
  positions: readonly CashPositionByCurrency[] | undefined,
  currency: CurrencyCode
): CashPositionByCurrency | undefined {
  return positions?.find((p) => p.currency === currency);
}

export function buildHoyCashPositionBlocks(p: {
  cashPositions?: readonly CashPositionByCurrency[];
  pendingByCurrency: CarteraCurrencyTotals;
  treasurySummaries: readonly TreasuryOutflowSummary[];
}): HoyCashPositionBlock[] {
  const codes: CurrencyCode[] = ["UYU", "USD"];
  const blocks: HoyCashPositionBlock[] = [];

  for (const currency of codes) {
    const pos = positionForCurrency(p.cashPositions, currency);
    const pending = p.pendingByCurrency[currency] ?? 0;
    const summary = p.treasurySummaries.find((s) => s.currency === currency) ?? null;
    const scheduled = summary?.next30Days ?? 0;
    const hasConfigured = (summary?.itemsCount ?? 0) > 0;
    const currentCash = pos?.currentCash ?? 0;

    const { projected, coverageStatus } = hasConfigured
      ? projectedBalanceCoverage(currentCash, pending, scheduled)
      : { projected: null as number | null, coverageStatus: "healthy" as CoverageStatus };

    const hasActivity =
      (pos?.movementsCount ?? 0) > 0 ||
      pos?.openingConfigured ||
      pending > 0 ||
      hasConfigured;

    if (!hasActivity) continue;

    blocks.push({
      currency,
      openingConfigured: pos?.openingConfigured ?? false,
      currentCash,
      manualIncome: pos?.manualIncome ?? 0,
      manualExpense: pos?.manualExpense ?? 0,
      lastMovement: pos?.lastMovement ?? null,
      scheduledOutflows30d: hasConfigured ? scheduled : null,
      projectedBalance30d: hasConfigured ? projected : null,
      coverageStatus,
      hasConfiguredOutflows: hasConfigured,
    });
  }

  return blocks;
}

export function buildHoyTreasuryAlerts(p: {
  cashPositions?: readonly CashPositionByCurrency[];
  summaries: readonly TreasuryOutflowSummary[];
  pendingByCurrency: CarteraCurrencyTotals;
  overdueCritical30: CarteraCurrencyTotals;
  /** Egresos manuales altos en ventana (ej. últimos 30 días), por moneda. */
  manualExpenseInPeriod?: CarteraCurrencyTotals;
}): HoyTreasuryAlert[] {
  const alerts: HoyTreasuryAlert[] = [];
  const anyConfigured = p.summaries.some((s) => s.itemsCount > 0);
  const anyOpeningMissing = (p.cashPositions ?? []).some((pos) => !pos.openingConfigured);

  if (anyOpeningMissing) {
    alerts.push({
      id: "treasury_opening_missing",
      tone: "attention",
      message:
        "No hay caja inicial configurada. Configurala para proyectar liquidez.",
    });
  }

  if (!anyConfigured) {
    alerts.push({
      id: "treasury_no_outflows",
      tone: "attention",
      message: "No hay egresos futuros configurados.",
    });
  }

  for (const code of ["UYU", "USD"] as const) {
    const summary = p.summaries.find((s) => s.currency === code);
    const pending = p.pendingByCurrency[code] ?? 0;
    const scheduled = summary?.next30Days ?? 0;
    const pos = positionForCurrency(p.cashPositions, code);
    const currentCash = pos?.currentCash ?? 0;
    const manualExpensePeriod = p.manualExpenseInPeriod?.[code] ?? 0;

    if (scheduled > 0) {
      const { projected, coverageStatus } = projectedBalanceCoverage(
        currentCash,
        pending,
        scheduled
      );
      if (coverageStatus === "critical") {
        alerts.push({
          id: `treasury_deficit_${code}`,
          tone: "critical",
          message: `Con los pagos programados actuales, la caja proyectada queda negativa en ${code}.`,
        });
      } else if (projected >= 0 && coverageStatus === "healthy") {
        alerts.push({
          id: `treasury_covers_${code}`,
          tone: "healthy",
          message: `La caja proyectada cubre los pagos programados de los próximos 30 días en ${code}.`,
        });
      }
    }

    if (manualExpensePeriod > 0 && currentCash > 0 && manualExpensePeriod >= currentCash * 0.5) {
      alerts.push({
        id: `treasury_high_manual_expense_${code}`,
        tone: "attention",
        message: `Los egresos manuales del período fueron altos en ${code}.`,
      });
    }

    const overdue30 = p.overdueCritical30[code] ?? 0;
    if (overdue30 > 0 && scheduled > 0 && scheduled >= overdue30 * 0.5) {
      alerts.push({
        id: `treasury_debt_and_outflows_${code}`,
        tone: "attention",
        message: `Hay deuda atrasada y egresos próximos relevantes en ${code}.`,
      });
    }
  }

  return alerts.slice(0, 6);
}

export function treasurySummaryForCurrency(
  summaries: readonly TreasuryOutflowSummary[],
  currency: CurrencyCode
): TreasuryOutflowSummary | null {
  return summaries.find((s) => s.currency === currency) ?? null;
}

/** @deprecated Usar buildHoyCashPositionBlocks — mantiene compat con currencyBlocks legacy. */
export function buildTreasuryBlockExtensionAmounts(p: {
  currentCash?: number;
  pending: number;
  summary: TreasuryOutflowSummary | null;
}): {
  scheduledOutflows30d: number | null;
  projectedBalance30d: number | null;
  coverageStatus: CoverageStatus;
  hasConfiguredOutflows: boolean;
} {
  const scheduled = p.summary?.next30Days ?? 0;
  const hasConfigured = (p.summary?.itemsCount ?? 0) > 0;
  const currentCash = p.currentCash ?? 0;

  if (!hasConfigured) {
    return {
      scheduledOutflows30d: null,
      projectedBalance30d: null,
      coverageStatus: "healthy",
      hasConfiguredOutflows: false,
    };
  }

  const { projected, coverageStatus } = projectedBalanceCoverage(
    currentCash,
    p.pending,
    scheduled
  );

  return {
    scheduledOutflows30d: scheduled,
    projectedBalance30d: projected,
    coverageStatus,
    hasConfiguredOutflows: true,
  };
}
