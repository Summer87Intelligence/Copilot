/**
 * Proyección Hoy ↔ Tesorería. Puro, sin LLM.
 *
 * Fórmulas (por moneda, sin conversión):
 * - cajaActualEstimada = cobrado acumulado clientes + ingresos manuales − egresos manuales
 *   (+ saldo inicial opcional + ajustes + transferencias netas vía treasury-cash-position)
 * - porCobrar = saldo pendiente de clientes (deuda abierta) — NO entra en caja disponible
 * - pagosProgramados = obligaciones planificadas próximos 30 días
 * - cajaSegura30d = cajaActualEstimada − pagosProgramados  → card «Después de pagos»
 * - cajaEsperada30d = cajaActualEstimada + porCobrar − pagosProgramados (escenario, no caja hoy)
 *
 * Cobro sincronizado: pending Cartera ↓; caja ↑ solo si el recibo impactó tesorería.
 * Ver `HOY_COLLECTION_SYNC_BEHAVIOR` en `lib/copilot-hoy-money-rules.ts`.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

type CurrencyCode = TreasuryCurrencyCode;
import {
  expectedCashBalance30d,
  mergeCollectedIntoCashPositions,
  safeCashBalance30d,
  type CashPositionByCurrency,
} from "@/lib/treasury/treasury-cash-position";
import type { CoverageStatus, TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

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
};

export type HoyProjection30dBlock = {
  currency: CurrencyCode;
  /** Caja actual estimada (solo dinero ya disponible). */
  currentCash: number;
  /** Pagos programados próximos 30 días. */
  scheduledPayments: number;
  /** cajaSegura30d */
  safeCash30d: number;
  /** porCobrar — deuda de clientes, no es caja. */
  pendingReceivables: number;
  /** cajaEsperada30d */
  expectedCash30d: number;
  hasConfiguredPayments: boolean;
  safeCoverageStatus: CoverageStatus;
};

function positionForCurrency(
  positions: readonly CashPositionByCurrency[] | undefined,
  currency: CurrencyCode
): CashPositionByCurrency | undefined {
  return positions?.find((p) => p.currency === currency);
}

function safeCoverageStatus(safeCash: number, scheduledPayments: number): CoverageStatus {
  if (scheduledPayments <= 0) return safeCash >= 0 ? "healthy" : "critical";
  if (safeCash < 0) return "critical";
  const ratio = scheduledPayments > 0 ? safeCash / scheduledPayments : 1;
  if (ratio < 0.15) return "attention";
  return "healthy";
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
    const hasConfigured = (summary?.itemsCount ?? 0) > 0;
    const collectedFromClients = pos?.collectedFromClients ?? 0;
    const availableCash = pos?.availableCash ?? 0;

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
    });
  }

  return blocks;
}

export function buildHoyProjection30dBlocks(p: {
  cashPositionBlocks: readonly HoyCashPositionBlock[];
  pendingByCurrency: CarteraCurrencyTotals;
  treasurySummaries: readonly TreasuryOutflowSummary[];
}): HoyProjection30dBlock[] {
  const blocks: HoyProjection30dBlock[] = [];

  for (const currency of ["UYU", "USD"] as const) {
    const cash = p.cashPositionBlocks.find((b) => b.currency === currency);
    const pending = p.pendingByCurrency[currency] ?? 0;
    const summary = p.treasurySummaries.find((s) => s.currency === currency) ?? null;
    const scheduled = summary?.next30Days ?? 0;
    const hasConfigured = (summary?.itemsCount ?? 0) > 0;
    const currentCash = cash?.availableCash ?? 0;

    const hasActivity = currentCash !== 0 || pending > 0 || hasConfigured;
    if (!hasActivity) continue;

    const safeCash30d = hasConfigured
      ? safeCashBalance30d(currentCash, scheduled)
      : currentCash;
    const expectedCash30d = hasConfigured
      ? expectedCashBalance30d(currentCash, pending, scheduled)
      : currentCash + pending;

    blocks.push({
      currency,
      currentCash,
      scheduledPayments: hasConfigured ? scheduled : 0,
      safeCash30d,
      pendingReceivables: pending,
      expectedCash30d,
      hasConfiguredPayments: hasConfigured,
      safeCoverageStatus: hasConfigured
        ? safeCoverageStatus(safeCash30d, scheduled)
        : "healthy",
    });
  }

  return blocks;
}

export function buildHoyTreasuryAlerts(p: {
  projectionBlocks: readonly HoyProjection30dBlock[];
  summaries: readonly TreasuryOutflowSummary[];
  overdueCritical30: CarteraCurrencyTotals;
  manualExpenseInPeriod?: CarteraCurrencyTotals;
  cashPositionBlocks?: readonly HoyCashPositionBlock[];
}): HoyTreasuryAlert[] {
  const alerts: HoyTreasuryAlert[] = [];
  const anyConfigured = p.summaries.some((s) => s.itemsCount > 0);

  if (!anyConfigured) {
    alerts.push({
      id: "treasury_no_outflows",
      tone: "attention",
      message: "No hay egresos futuros configurados.",
    });
  }

  for (const block of p.projectionBlocks) {
    const code = block.currency;
    const pending = block.pendingReceivables;
    const scheduled = block.scheduledPayments;

    if (pending > 0) {
      alerts.push({
        id: `treasury_pending_not_cash_${code}`,
        tone: "attention",
        message: "No contar deuda pendiente como caja disponible hasta cobrarla.",
      });
    }

    if (!block.hasConfiguredPayments || scheduled <= 0) continue;

    const { safeCash30d, expectedCash30d } = block;

    if (safeCash30d < 0) {
      alerts.push({
        id: `treasury_safe_deficit_${code}`,
        tone: "critical",
        message:
          "Sin cobrar deuda pendiente, la caja no cubre los pagos programados de los próximos 30 días.",
      });
    } else {
      alerts.push({
        id: `treasury_safe_covers_${code}`,
        tone: "healthy",
        message: "La caja actual cubre los pagos programados de los próximos 30 días.",
      });
    }

    if (expectedCash30d >= 0 && safeCash30d < 0) {
      alerts.push({
        id: `treasury_depends_collection_${code}`,
        tone: "attention",
        message: "Dependés de cobrar deuda pendiente para cubrir los próximos pagos.",
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

  for (const code of ["UYU", "USD"] as const) {
    const cash = p.cashPositionBlocks?.find((b) => b.currency === code);
    const manualExpensePeriod = p.manualExpenseInPeriod?.[code] ?? 0;
    const availableCash = cash?.availableCash ?? 0;
    if (manualExpensePeriod > 0 && availableCash > 0 && manualExpensePeriod >= availableCash * 0.5) {
      alerts.push({
        id: `treasury_high_manual_expense_${code}`,
        tone: "attention",
        message: `Los egresos manuales del período fueron altos en ${code}.`,
      });
    }
  }

  return alerts.slice(0, 8);
}

export function treasurySummaryForCurrency(
  summaries: readonly TreasuryOutflowSummary[],
  currency: CurrencyCode
): TreasuryOutflowSummary | null {
  return summaries.find((s) => s.currency === currency) ?? null;
}

/** @deprecated Usar buildHoyProjection30dBlocks. */
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

  const expected = expectedCashBalance30d(availableCash, p.pending, scheduled);
  const safe = safeCashBalance30d(availableCash, scheduled);

  return {
    scheduledOutflows30d: scheduled,
    projectedBalance30d: expected,
    coverageStatus: safeCoverageStatus(safe, scheduled),
    hasConfiguredOutflows: true,
  };
}
