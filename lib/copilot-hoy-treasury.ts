/**
 * Proyección Hoy ↔ Tesorería. Puro, sin LLM.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { CurrencyCode } from "@/lib/copilot-hoy-executive";
import {
  mergeCollectedIntoCashPositions,
  projectedCashBalance30d,
  type CashPositionByCurrency,
} from "@/lib/treasury/treasury-cash-position";
import {
  projectedBalanceCoverage,
  type CoverageStatus,
  type TreasuryOutflowSummary,
} from "@/lib/treasury/treasury-scheduled-payments";

export type { CoverageStatus };

export type HoyTreasuryAlert = {
  id: string;
  tone: "healthy" | "attention" | "critical";
  message: string;
};

export type HoyCashPositionBlock = {
  currency: CurrencyCode;
  openingConfigured: boolean;
  openingBalance: number;
  collectedFromClients: number;
  manualIncome: number;
  manualExpense: number;
  availableCash: number;
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
  collectedByCurrency?: CarteraCurrencyTotals;
  pendingByCurrency: CarteraCurrencyTotals;
  treasurySummaries: readonly TreasuryOutflowSummary[];
}): HoyCashPositionBlock[] {
  const raw = p.cashPositions ?? [];
  const enriched =
    p.collectedByCurrency && Object.keys(p.collectedByCurrency).length > 0
      ? mergeCollectedIntoCashPositions(raw, p.collectedByCurrency)
      : raw;

  const codes: CurrencyCode[] = ["UYU", "USD"];
  const blocks: HoyCashPositionBlock[] = [];

  for (const currency of codes) {
    const pos = positionForCurrency(enriched, currency);
    const pending = p.pendingByCurrency[currency] ?? 0;
    const summary = p.treasurySummaries.find((s) => s.currency === currency) ?? null;
    const scheduled = summary?.next30Days ?? 0;
    const hasConfigured = (summary?.itemsCount ?? 0) > 0;
    const availableCash = pos?.availableCash ?? 0;
    const collectedFromClients = pos?.collectedFromClients ?? 0;

    const { projected, coverageStatus } = hasConfigured
      ? projectedBalanceCoverage(availableCash, pending, scheduled)
      : { projected: null as number | null, coverageStatus: "healthy" as CoverageStatus };

    const hasActivity =
      collectedFromClients > 0 ||
      (pos?.movementsCount ?? 0) > 0 ||
      pos?.openingConfigured ||
      pending > 0 ||
      hasConfigured;

    if (!hasActivity) continue;

    blocks.push({
      currency,
      openingConfigured: pos?.openingConfigured ?? false,
      openingBalance: pos?.openingBalance ?? 0,
      collectedFromClients,
      manualIncome: pos?.manualIncome ?? 0,
      manualExpense: pos?.manualExpense ?? 0,
      availableCash,
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
  collectedByCurrency?: CarteraCurrencyTotals;
  summaries: readonly TreasuryOutflowSummary[];
  pendingByCurrency: CarteraCurrencyTotals;
  overdueCritical30: CarteraCurrencyTotals;
  manualExpenseInPeriod?: CarteraCurrencyTotals;
}): HoyTreasuryAlert[] {
  const alerts: HoyTreasuryAlert[] = [];
  const anyConfigured = p.summaries.some((s) => s.itemsCount > 0);

  const enriched =
    p.collectedByCurrency && Object.keys(p.collectedByCurrency).length > 0
      ? mergeCollectedIntoCashPositions(p.cashPositions ?? [], p.collectedByCurrency)
      : p.cashPositions ?? [];

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
    const pos = positionForCurrency(enriched, code);
    const availableCash = pos?.availableCash ?? 0;
    const manualExpensePeriod = p.manualExpenseInPeriod?.[code] ?? 0;

    if (scheduled > 0) {
      const { projected, coverageStatus } = projectedBalanceCoverage(
        availableCash,
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

    if (manualExpensePeriod > 0 && availableCash > 0 && manualExpensePeriod >= availableCash * 0.5) {
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

export function buildTreasuryBlockExtensionAmounts(p: {
  availableCash?: number;
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
  const availableCash = p.availableCash ?? p.currentCash ?? 0;

  if (!hasConfigured) {
    return {
      scheduledOutflows30d: null,
      projectedBalance30d: null,
      coverageStatus: "healthy",
      hasConfiguredOutflows: false,
    };
  }

  const { projected, coverageStatus } = projectedBalanceCoverage(
    availableCash,
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
