/**
 * Phase 5B — forecast de deterioro de cartera (7/14/30 días).
 */

import type { PredictiveContext, PortfolioDeteriorationForecast } from "@/lib/decision-engine/predictive/predictive-types";
import type { DeteriorationBand } from "@/lib/decision-engine/predictive/predictive-types";

const HORIZONS = [7, 14, 30] as const;

function bandFromDelta(delta: number, criticalProjected: number): DeteriorationBand {
  if (delta >= 25 || criticalProjected >= 12) return "severe";
  if (delta >= 15 || criticalProjected >= 8) return "deteriorating";
  if (delta >= 8 || criticalProjected >= 5) return "watch";
  return "stable";
}

export function buildPortfolioDeteriorationForecasts(
  ctx: PredictiveContext
): PortfolioDeteriorationForecast[] {
  const g = ctx.analytics?.global;
  const summaries = ctx.client_summaries;
  const noContact = summaries.filter((s) => {
    const h = ctx.hydration_by_customer[s.customer_id];
    const days = h?.last_action_at
      ? Math.floor((Date.now() - new Date(h.last_action_at).getTime()) / 86_400_000)
      : 999;
    return days >= 14 || s.primary_action.category === "stale_contact";
  }).length;

  const nearBucket = summaries.filter((s) => {
    const d = s.primary_action.oldest_days;
    return (d >= 55 && d < 60) || (d >= 85 && d < 90);
  }).length;

  const slaBreached = summaries.filter((s) => s.sla_breached).length;
  const criticalNow = summaries.filter(
    (s) => s.highest_priority === "critical" || s.risk_level === "critical"
  ).length;

  const totalPending = summaries.reduce((s, c) => s + c.total_pending_amount, 0);
  const highConc = summaries.filter((s) => (s.concentration_percent ?? 0) >= 40).length;
  const backlog = g?.operational_backlog ?? summaries.length;

  return HORIZONS.map((horizon_days) => {
    const horizonFactor = horizon_days / 30;
    const projected_risk_delta_pct = Math.min(
      45,
      Math.round(
        (noContact * 1.2 + nearBucket * 2 + slaBreached * 1.5 + highConc) *
          horizonFactor *
          0.8
      )
    );

    const projected_critical_cases = Math.round(
      criticalNow + noContact * 0.15 * horizonFactor + slaBreached * 0.1 * horizonFactor
    );

    const projected_overdue_amount = Math.round(
      totalPending * (projected_risk_delta_pct / 100) * (0.5 + horizonFactor * 0.5)
    );

    const deterioration_band = bandFromDelta(projected_risk_delta_pct, projected_critical_cases);

    const drivers: string[] = [];
    if (noContact > 0) drivers.push(`${noContact} clientes sin contacto reciente`);
    if (nearBucket > 0) drivers.push(`${nearBucket} casos cerca de cambiar bucket de aging`);
    if (slaBreached > 0) drivers.push(`${slaBreached} con SLA vencido hoy`);
    if (highConc > 0) drivers.push(`${highConc} con concentración crítica`);
    if (backlog >= 20) drivers.push(`Backlog operativo de ${backlog} ítems`);

    const recommended_countermeasures: string[] = [];
    if (deterioration_band !== "stable") {
      recommended_countermeasures.push("Priorizar contacto en casos +60d sin interacción");
    }
    if (slaBreached >= 3) {
      recommended_countermeasures.push("Redistribuir casos con SLA vencido entre operadores");
    }
    if (highConc >= 2) {
      recommended_countermeasures.push("Plan de contención en top concentradores");
    }
    if (recommended_countermeasures.length === 0) {
      recommended_countermeasures.push("Mantener ritmo de seguimiento y monitoreo semanal");
    }

    return {
      horizon_days,
      projected_risk_delta_pct,
      projected_overdue_amount,
      projected_critical_cases,
      deterioration_band,
      drivers: drivers.slice(0, 5),
      recommended_countermeasures: recommended_countermeasures.slice(0, 4),
    };
  });
}
