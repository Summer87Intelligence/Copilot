/**
 * Phase 5A — insights por operador (heurísticas).
 */

import type { OperationalAnalyticsSnapshot } from "@/lib/decision-engine/de-types";
import type { AIInsightSeverity, OperatorInsight, OperatorInsightKind } from "@/lib/decision-engine/ai/ai-types";

function severityForCriticalLoad(critical: number): AIInsightSeverity {
  if (critical >= 8) return "critical";
  if (critical >= 5) return "high";
  if (critical >= 3) return "medium";
  return "low";
}

export function buildOperatorInsights(
  analytics: OperationalAnalyticsSnapshot | null
): OperatorInsight[] {
  if (!analytics || analytics.operators.length === 0) return [];

  const insights: OperatorInsight[] = [];
  const avgSla =
    analytics.operators.length > 0
      ? analytics.sla.compliance_pct
      : 100;
  const avgAssigned =
    analytics.operators.reduce((s, o) => s + o.assigned_total, 0) /
    Math.max(1, analytics.operators.length);
  const avgCompleted =
    analytics.operators.reduce((s, o) => s + o.completed_today, 0) /
    Math.max(1, analytics.operators.length);

  for (const op of analytics.operators) {
    if (op.workload_band === "overloaded" || op.workload_band === "critical") {
      const sev: AIInsightSeverity = op.workload_band === "critical" ? "critical" : "high";
      insights.push({
        user_id: op.user_id,
        display_name: op.display_name,
        kind: "overloaded",
        severity: sev,
        message: `${op.display_name} acumula ${op.active_critical} casos críticos y ${op.assigned_total} activos (carga ${op.workload_band.toUpperCase()}).`,
        metrics: {
          assigned_total: op.assigned_total,
          active_critical: op.active_critical,
          overload_score: op.overload_score,
        },
      });
    }

    const opSla = analytics.sla.operator_sla.find((s) => s.user_id === op.user_id);
    const compliance = opSla?.compliance_pct ?? 100;
    if (compliance < avgSla - 15 && op.assigned_total >= 2) {
      insights.push({
        user_id: op.user_id,
        display_name: op.display_name,
        kind: "sla_below_avg",
        severity: compliance < 70 ? "high" : "medium",
        message: `${op.display_name} presenta SLA compliance (${compliance}%) por debajo del promedio del equipo.`,
        metrics: { compliance_pct: compliance, breaches: opSla?.breaches ?? 0 },
      });
    }

    if (
      op.avg_response_time_hours != null &&
      op.avg_response_time_hours > 48 &&
      op.assigned_total >= 2
    ) {
      insights.push({
        user_id: op.user_id,
        display_name: op.display_name,
        kind: "slow_response",
        severity: "medium",
        message: `${op.display_name} muestra tiempo de respuesta elevado (${op.avg_response_time_hours}h promedio).`,
        metrics: { avg_response_time_hours: op.avg_response_time_hours },
      });
    }

    if (op.active_critical >= 5) {
      insights.push({
        user_id: op.user_id,
        display_name: op.display_name,
        kind: "high_critical_load",
        severity: severityForCriticalLoad(op.active_critical),
        message: `${op.display_name} concentra ${op.active_critical} casos críticos activos.`,
        metrics: { active_critical: op.active_critical },
      });
    }

    if (op.assigned_total > avgAssigned * 1.8 && avgAssigned > 0 && op.completed_today < avgCompleted * 0.5) {
      insights.push({
        user_id: op.user_id,
        display_name: op.display_name,
        kind: "low_throughput",
        severity: "medium",
        message: `${op.display_name} tiene backlog alto con bajo throughput hoy (${op.completed_today} cierres).`,
        metrics: {
          assigned_total: op.assigned_total,
          completed_today: op.completed_today,
        },
      });
    }
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
