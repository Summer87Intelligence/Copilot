/**
 * Proyección Hoy ↔ Tesorería (pagos programados). Puro, sin LLM.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { CurrencyCode } from "@/lib/copilot-hoy-executive";
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

export function buildHoyTreasuryAlerts(p: {
  summaries: readonly TreasuryOutflowSummary[];
  pendingByCurrency: CarteraCurrencyTotals;
  overdueCritical30: CarteraCurrencyTotals;
}): HoyTreasuryAlert[] {
  const alerts: HoyTreasuryAlert[] = [];
  const anyConfigured = p.summaries.some((s) => s.itemsCount > 0);

  if (!anyConfigured) {
    alerts.push({
      id: "treasury_no_outflows",
      tone: "attention",
      message: "No hay egresos futuros configurados.",
    });
    return alerts;
  }

  for (const code of ["UYU", "USD"] as const) {
    const summary = p.summaries.find((s) => s.currency === code);
    const pending = p.pendingByCurrency[code] ?? 0;
    const scheduled = summary?.next30Days ?? 0;
    const overdue30 = p.overdueCritical30[code] ?? 0;

    if (scheduled <= 0) continue;

    const { projected, coverageStatus } = projectedBalanceCoverage(pending, scheduled);
    if (coverageStatus === "critical") {
      alerts.push({
        id: `treasury_deficit_${code}`,
        tone: "critical",
        message: `En los próximos 30 días, los pagos programados superan lo pendiente por cobrar en ${code}.`,
      });
    } else if (pending >= scheduled && pending > 0) {
      alerts.push({
        id: `treasury_covers_${code}`,
        tone: "healthy",
        message: `La deuda activa en ${code} cubre los pagos programados de los próximos 30 días.`,
      });
    }

    if (overdue30 > 0 && scheduled > 0 && scheduled >= overdue30 * 0.5) {
      alerts.push({
        id: `treasury_debt_and_outflows_${code}`,
        tone: "attention",
        message: `Hay deuda atrasada y egresos próximos relevantes en ${code}.`,
      });
    }

    if (projected > 0 && coverageStatus === "healthy" && pending > scheduled) {
      // Mensaje positivo ya emitido arriba; evitar duplicar
    }
  }

  return alerts.slice(0, 4);
}

export function treasurySummaryForCurrency(
  summaries: readonly TreasuryOutflowSummary[],
  currency: CurrencyCode
): TreasuryOutflowSummary | null {
  return summaries.find((s) => s.currency === currency) ?? null;
}

export function buildTreasuryBlockExtensionAmounts(p: {
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

  if (!hasConfigured) {
    return {
      scheduledOutflows30d: null,
      projectedBalance30d: null,
      coverageStatus: "healthy",
      hasConfiguredOutflows: false,
    };
  }

  const { projected, coverageStatus } = projectedBalanceCoverage(p.pending, scheduled);

  return {
    scheduledOutflows30d: scheduled,
    projectedBalance30d: projected,
    coverageStatus,
    hasConfiguredOutflows: true,
  };
}
