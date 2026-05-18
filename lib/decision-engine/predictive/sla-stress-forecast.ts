/**
 * Phase 5B — forecast de estrés SLA futuro.
 */

import type { PredictiveContext, SLAStressForecast, SLAStressBand } from "@/lib/decision-engine/predictive/predictive-types";

const HORIZONS = [7, 14] as const;

function stressBand(projected: number, current: number): SLAStressBand {
  const total = projected + current;
  if (total >= 15 || projected >= 8) return "critical";
  if (total >= 10 || projected >= 5) return "high";
  if (total >= 6 || projected >= 3) return "elevated";
  return "normal";
}

export function buildSLAStressForecasts(ctx: PredictiveContext): SLAStressForecast[] {
  const g = ctx.analytics?.global;
  const q = ctx.queue?.stats;
  const signals = ctx.analytics?.queue_signals;

  const currentBreached = g?.breached_sla_cases ?? ctx.client_summaries.filter((s) => s.sla_breached).length;
  const followupsDue = q?.promises_due_today ?? signals?.followups_due_today ?? 0;
  const unassignedCritical = ctx.ownership?.unassigned_critical ?? 0;
  const overloadedOps =
    ctx.analytics?.operators.filter(
      (o) => o.workload_band === "overloaded" || o.workload_band === "critical"
    ) ?? [];

  const lowThroughput = ctx.analytics?.operators.filter(
    (o) => o.assigned_total >= 5 && o.completed_today <= 1
  );

  return HORIZONS.map((horizon_days) => {
    const factor = horizon_days / 7;
    const projected_sla_breaches = Math.round(
      currentBreached * 0.15 * factor +
        followupsDue * 0.4 * factor +
        unassignedCritical * 0.6 * factor +
        (ctx.client_summaries.filter((s) => !ctx.hydration_by_customer[s.customer_id]?.assigned_user_id)
          .length *
          0.05 *
          factor)
    );

    const band = stressBand(projected_sla_breaches, currentBreached);

    const drivers: string[] = [];
    if (currentBreached > 0) drivers.push(`${currentBreached} SLA vencidos actuales`);
    if (followupsDue > 0) drivers.push(`${followupsDue} follow-ups/promesas con vencimiento`);
    if (unassignedCritical > 0) drivers.push(`${unassignedCritical} críticos sin asignar`);
    if (overloadedOps.length > 0) {
      drivers.push(`${overloadedOps.length} operador(es) en sobrecarga`);
    }
    if ((g?.operational_backlog ?? 0) >= 20) {
      drivers.push(`Backlog operativo ${g!.operational_backlog}`);
    }

    const operators_at_risk = [
      ...overloadedOps.map((o) => o.display_name),
      ...(lowThroughput?.map((o) => o.display_name) ?? []),
    ].slice(0, 5);

    const recommended_actions: string[] = [];
    if (band === "critical" || band === "high") {
      recommended_actions.push("Asignar dueños a críticos sin responsable hoy");
      recommended_actions.push("Reducir carga en operadores en SOBRECARGA");
    }
    if (followupsDue > 0) {
      recommended_actions.push("Cerrar o reprogramar promesas vencidas antes del fin de semana");
    }
    if (recommended_actions.length === 0) {
      recommended_actions.push("Mantener compliance SLA con revisión diaria de cola urgente");
    }

    return {
      horizon_days,
      projected_sla_breaches,
      stress_band: band,
      drivers: drivers.slice(0, 5),
      operators_at_risk: [...new Set(operators_at_risk)],
      recommended_actions: recommended_actions.slice(0, 4),
    };
  });
}
