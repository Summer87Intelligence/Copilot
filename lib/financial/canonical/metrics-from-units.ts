/**
 * FINANCIAL CANONICAL LAYER — Métricas desde debt units.
 *
 * Deuda y aging derivan EXCLUSIVAMENTE de `CanonicalDebtUnit[]`. Son la fuente
 * única que consumen Cliente 360, Cartera y Hoy tras la migración de FASE 1.
 */

import { classifyOperatingDelay } from "@/lib/copilot/operating-aging";

import { roundMoney } from "./currency";
import { isDebtUnitOverdue } from "./debt-units";
import type {
  CanonicalAgingMetrics,
  CanonicalDebtMetrics,
  CanonicalDebtUnit,
  FinancialCurrency,
} from "./types";

export function buildCanonicalDebtMetricsFromUnits(
  units: readonly CanonicalDebtUnit[],
  currency: FinancialCurrency,
  cutoffDate: string
): CanonicalDebtMetrics {
  let pendingBalance = 0;
  let overdueBalance = 0;
  let balanceWithoutDueDate = 0;
  const openClients = new Set<string>();
  const overdueClients = new Set<string>();

  for (const u of units) {
    if (u.currency !== currency) continue;
    if (!(u.openBalance > 0)) continue;

    pendingBalance = roundMoney(pendingBalance + u.openBalance);
    if (u.companyId) openClients.add(u.companyId);

    if (u.dueDate === null) {
      balanceWithoutDueDate = roundMoney(balanceWithoutDueDate + u.openBalance);
      continue;
    }
    if (isDebtUnitOverdue(u, cutoffDate)) {
      overdueBalance = roundMoney(overdueBalance + u.openBalance);
      if (u.companyId) overdueClients.add(u.companyId);
    }
  }

  return {
    currency,
    pendingBalance,
    overdueBalance,
    currentBalance: roundMoney(Math.max(0, pendingBalance - overdueBalance)),
    overdueClients: overdueClients.size,
    totalOpenClients: openClients.size,
    balanceWithoutDueDate,
  };
}

export function buildCanonicalAgingMetricsFromUnits(
  units: readonly CanonicalDebtUnit[],
  currency: FinancialCurrency,
  cutoffDate: string
): CanonicalAgingMetrics {
  let current = 0;
  let overdue1To7 = 0;
  let overdue8To14 = 0;
  let overdue15To30 = 0;
  let overdue31Plus = 0;

  for (const u of units) {
    if (u.currency !== currency) continue;
    if (!(u.openBalance > 0)) continue;

    if (u.dueDate === null) {
      current = roundMoney(current + u.openBalance);
      continue;
    }

    const { bucket } = classifyOperatingDelay(u.dueDate, cutoffDate);
    switch (bucket) {
      case "late_1_7":
        overdue1To7 = roundMoney(overdue1To7 + u.openBalance);
        break;
      case "late_8_14":
        overdue8To14 = roundMoney(overdue8To14 + u.openBalance);
        break;
      case "late_15_30":
        overdue15To30 = roundMoney(overdue15To30 + u.openBalance);
        break;
      case "late_30_plus":
        overdue31Plus = roundMoney(overdue31Plus + u.openBalance);
        break;
      case "on_time":
      default:
        current = roundMoney(current + u.openBalance);
        break;
    }
  }

  return {
    currency,
    current,
    overdue1To7,
    overdue8To14,
    overdue15To30,
    overdue31Plus,
    total: roundMoney(current + overdue1To7 + overdue8To14 + overdue15To30 + overdue31Plus),
  };
}
