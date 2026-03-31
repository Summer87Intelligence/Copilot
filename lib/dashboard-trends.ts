import type { DashboardSnapshot } from "@/lib/dashboard-data";

/** Dirección de evolución entre dos mediciones del mismo indicador. */
export type TrendDirection = "up" | "down" | "flat";

/**
 * Señales de tendencia entre un snapshot actual y uno anterior.
 * Pensado para enriquecer el Copilot y vistas del dashboard sin acoplarse aún a la UI.
 */
export type SnapshotTrends = {
  salesTrend: TrendDirection;
  expensesTrend: TrendDirection;
  cashTrend: TrendDirection;
};

export type SnapshotTrendsOptions = {
  /**
   * Umbral relativo por debajo del cual el cambio se considera "flat"
   * (ej. 0.005 = 0,5 % respecto del valor anterior).
   */
  flatRelativeEpsilon?: number;
};

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

/**
 * Compara dos valores del mismo KPI: sube, baja o estable según delta y umbral relativo.
 */
export function compareMetricTrend(
  current: number,
  previous: number,
  flatRelativeEpsilon: number
): TrendDirection {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) {
    return "flat";
  }
  if (previous === 0 && current === 0) {
    return "flat";
  }
  if (previous === 0) {
    return current > 0 ? "up" : current < 0 ? "down" : "flat";
  }

  const delta = current - previous;
  const relative = Math.abs(delta / previous);
  if (relative < flatRelativeEpsilon) {
    return "flat";
  }
  return delta > 0 ? "up" : "down";
}

const DEFAULT_FLAT_EPSILON = 0.005;

/**
 * Deriva tendencias de ventas, gastos y caja entre dos snapshots consecutivos
 * (p. ej. mes actual vs mes anterior cuando existan dos filas en el tiempo).
 */
export function getSnapshotTrends(
  currentSnapshot: DashboardSnapshot,
  previousSnapshot: DashboardSnapshot,
  options?: SnapshotTrendsOptions
): SnapshotTrends {
  const eps = options?.flatRelativeEpsilon ?? DEFAULT_FLAT_EPSILON;

  return {
    salesTrend: compareMetricTrend(
      currentSnapshot.monthlySales,
      previousSnapshot.monthlySales,
      eps
    ),
    expensesTrend: compareMetricTrend(
      currentSnapshot.monthlyExpenses,
      previousSnapshot.monthlyExpenses,
      eps
    ),
    cashTrend: compareMetricTrend(
      currentSnapshot.cashAvailable,
      previousSnapshot.cashAvailable,
      eps
    ),
  };
}
