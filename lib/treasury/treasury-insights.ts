import type { TreasuryAlert } from "@/lib/treasury/treasury-alert-engine";
import type { TreasuryCashProjectionResult } from "@/lib/treasury/treasury-cash-projection";
import { daysUntilDue } from "@/lib/treasury/treasury-obligation-status";
import type {
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type TreasuryInsightPriority = "low" | "medium" | "high";

export type TreasuryInsight = {
  id: string;
  priority: TreasuryInsightPriority;
  title: string;
  description: string;
  recommendation?: string;
};

function addDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

export function buildExpenseTrendInsights(params: {
  asOfDate: string;
  manualMovements: readonly ManualCashMovement[];
  lookbackDays?: number;
}): TreasuryInsight[] {
  const lookbackDays = params.lookbackDays ?? 30;
  const fromDate = addDaysYmd(params.asOfDate, -lookbackDays);
  const insights: TreasuryInsight[] = [];

  for (const currency of ["UYU", "USD"] as const) {
    const expenses = params.manualMovements.filter((movement) => {
      if (movement.status !== "active" || movement.movementType !== "expense") return false;
      if (movement.currencyCode !== currency) return false;
      return movement.movementDate >= fromDate && movement.movementDate <= params.asOfDate;
    });
    if (expenses.length < 4) continue;

    const midpoint = addDaysYmd(params.asOfDate, -Math.floor(lookbackDays / 2));
    const recent = expenses
      .filter((movement) => movement.movementDate >= midpoint)
      .reduce((sum, movement) => sum + movement.amount, 0);
    const previous = expenses
      .filter((movement) => movement.movementDate < midpoint)
      .reduce((sum, movement) => sum + movement.amount, 0);
    if (previous <= 0 || recent <= previous) continue;

    const growth = ((recent - previous) / previous) * 100;
    insights.push({
      id: `expense-trend-${currency}`,
      priority: growth >= 20 ? "high" : "medium",
      title: `Egresos ${currency} en alza`,
      description: `Tus egresos crecieron ${Math.round(growth)}% vs el promedio del período anterior.`,
      recommendation: "Revise categorías con mayor variación y valide si son recurrentes.",
    });
  }

  return insights;
}

export function buildUpcomingRiskInsights(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
}): TreasuryInsight[] {
  const insights: TreasuryInsight[] = [];
  for (const obligation of params.obligations) {
    const days = daysUntilDue(obligation.dueDate, params.asOfDate);
    if (days == null || days < 0 || days > 7) continue;
    insights.push({
      id: `upcoming-risk-${obligation.id}`,
      priority: days <= 3 ? "high" : "medium",
      title: `${obligation.title} vence pronto`,
      description: `${obligation.title} vencerá en ${days} día${days === 1 ? "" : "s"}.`,
      recommendation: "Reserve fondos o confirme la fecha de pago efectiva.",
    });
  }
  return insights;
}

export function buildLiquidityInsights(params: {
  projection: TreasuryCashProjectionResult;
  obligations: readonly PlannedCashObligation[];
  cashByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
  asOfDate: string;
}): TreasuryInsight[] {
  const insights: TreasuryInsight[] = [];
  const negative = params.projection.snapshots.find(
    (snapshot) => snapshot.projectedCashUyu < 0 || snapshot.projectedCashUsd < 0
  );
  if (negative) {
    insights.push({
      id: `liquidity-negative-${negative.date}`,
      priority: "high",
      title: "Caja proyectada negativa",
      description: `Caja proyectada negativa para el ${negative.date}.`,
      recommendation: "Ajuste el calendario de pagos o acelere cobranzas.",
    });
  }

  if (params.projection.runwayDays != null && params.projection.runwayDays < 15) {
    insights.push({
      id: "liquidity-runway",
      priority: params.projection.runwayDays < 7 ? "high" : "medium",
      title: "Runway financiero acotado",
      description: `El runway estimado es de ${params.projection.runwayDays} días.`,
      recommendation: "Priorice liquidez y reduzca compromisos discrecionales.",
    });
  }

  for (const currency of ["UYU", "USD"] as const) {
    const cash = params.cashByCurrency[currency] ?? 0;
    if (cash <= 0) continue;
    const upcoming = params.obligations
      .filter((obligation) => {
        const days = daysUntilDue(obligation.dueDate, params.asOfDate);
        return days != null && days >= 0 && days <= 30 && obligation.currencyCode === currency;
      })
      .reduce((sum, obligation) => sum + (obligation.amountFinal ?? obligation.amountEstimated), 0);
    if (upcoming <= 0) continue;
    const share = upcoming / cash;
    if (share < 0.25) continue;
    insights.push({
      id: `liquidity-share-${currency}`,
      priority: share >= 0.4 ? "high" : "medium",
      title: `Compromisos ${currency} relevantes`,
      description: `Tus obligaciones próximas representan ${Math.round(share * 100)}% de la caja.`,
      recommendation: "Distribuya pagos o confirme ingresos esperados del mes.",
    });
  }

  return insights;
}

export function buildTreasuryInsights(params: {
  asOfDate: string;
  alerts: readonly TreasuryAlert[];
  projection: TreasuryCashProjectionResult;
  obligations: readonly PlannedCashObligation[];
  manualMovements: readonly ManualCashMovement[];
  cashByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
}): TreasuryInsight[] {
  const insights = [
    ...buildExpenseTrendInsights({
      asOfDate: params.asOfDate,
      manualMovements: params.manualMovements,
    }),
    ...buildUpcomingRiskInsights({
      asOfDate: params.asOfDate,
      obligations: params.obligations,
    }),
    ...buildLiquidityInsights({
      projection: params.projection,
      obligations: params.obligations,
      cashByCurrency: params.cashByCurrency,
      asOfDate: params.asOfDate,
    }),
  ];

  for (const alert of params.alerts) {
    if (alert.type !== "unreconciled_bank_movements") continue;
    insights.push({
      id: `insight-${alert.id}`,
      priority: "medium",
      title: "Pagos bancarios no registrados",
      description: "Detectamos pagos bancarios no registrados o sin conciliar.",
      recommendation: alert.recommendation,
    });
    break;
  }

  const priorityRank: Record<TreasuryInsightPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return insights.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}
