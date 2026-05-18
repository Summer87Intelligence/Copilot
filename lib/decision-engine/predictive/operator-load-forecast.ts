/**
 * Phase 5B — forecast de carga futura por operador.
 */

import type { OperationalAnalyticsSnapshot } from "@/lib/decision-engine/de-types";
import type { OperatorLoadForecast } from "@/lib/decision-engine/predictive/predictive-types";

function projectedBand(score: number): OperatorLoadForecast["projected_band"] {
  if (score >= 85) return "critical";
  if (score >= 70) return "overloaded";
  if (score >= 50) return "elevated";
  return "normal";
}

export function buildOperatorLoadForecasts(
  analytics: OperationalAnalyticsSnapshot | null
): OperatorLoadForecast[] {
  if (!analytics || analytics.operators.length === 0) return [];

  const avgAssigned =
    analytics.operators.reduce((s, o) => s + o.assigned_total, 0) /
    Math.max(1, analytics.operators.length);

  return analytics.operators.map((op) => {
    const growthFactor = op.workload_band === "overloaded" || op.workload_band === "critical" ? 1.15 : 1.05;
    const projected_critical_cases = Math.round(op.active_critical * growthFactor + op.sla_breaches * 0.2);
    const projected_load_score = Math.min(
      100,
      Math.round(
        op.workload_score * growthFactor +
          op.sla_breaches * 3 +
          (op.avg_response_time_hours != null && op.avg_response_time_hours > 48 ? 10 : 0)
      )
    );

    const overload_probability_pct = Math.min(
      95,
      Math.round(
        (projected_load_score / 100) * 70 +
          (op.active_critical / Math.max(1, op.assigned_total)) * 30
      )
    );

    const drivers: string[] = [];
    if (op.active_critical >= 5) drivers.push(`${op.active_critical} casos críticos activos`);
    if (op.sla_breaches > 0) drivers.push(`${op.sla_breaches} incumplimientos SLA`);
    if (op.assigned_total > avgAssigned * 1.5) drivers.push("Carga por encima del promedio del equipo");
    if (op.completed_today <= 1 && op.assigned_total >= 5) {
      drivers.push("Bajo throughput hoy");
    }

    const recommendations: string[] = [];
    if (projected_load_score >= 70) {
      recommendations.push("Redistribuir 1-2 casos críticos a operadores con banda normal");
    }
    if (op.sla_breaches >= 2) {
      recommendations.push("Priorizar cierre de SLA vencidos antes de nuevos casos");
    }
    if (recommendations.length === 0) {
      recommendations.push("Mantener ritmo actual de cierre diario");
    }

    return {
      user_id: op.user_id,
      display_name: op.display_name,
      projected_load_score,
      projected_band: projectedBand(projected_load_score),
      overload_probability_pct,
      projected_critical_cases,
      drivers: drivers.slice(0, 4),
      recommendations: recommendations.slice(0, 3),
    };
  }).sort((a, b) => b.projected_load_score - a.projected_load_score);
}
