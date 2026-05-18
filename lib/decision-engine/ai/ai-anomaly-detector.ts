/**
 * Phase 5A — detección de anomalías operacionales (heurísticas).
 */

import type {
  DailyOperationsQueue,
  OperationalAnalyticsSnapshot,
  OperationalOwnershipStats,
} from "@/lib/decision-engine/de-types";
import type {
  AIIntelligenceContext,
  OperationalAnomaly,
  OperationalAnomalyKind,
} from "@/lib/decision-engine/ai/ai-types";

let anomalyCounter = 0;
function aid(kind: OperationalAnomalyKind): string {
  anomalyCounter += 1;
  return `${kind}:${anomalyCounter}`;
}

export function detectOperationalAnomalies(ctx: AIIntelligenceContext): OperationalAnomaly[] {
  anomalyCounter = 0;
  const out: OperationalAnomaly[] = [];
  const g = ctx.analytics?.global;
  const q = ctx.queue;

  if (g && g.operational_backlog >= 25) {
    out.push({
      id: aid("backlog_spike"),
      kind: "backlog_spike",
      severity: g.operational_backlog >= 50 ? "critical" : "high",
      title: "Backlog operativo elevado",
      description: `El backlog operativo suma ${g.operational_backlog} ítems activos (casos + follow-ups).`,
      customer_id: null,
    });
  }

  if (g && g.breached_sla_cases >= 5) {
    out.push({
      id: aid("sla_spike"),
      kind: "sla_spike",
      severity: g.breached_sla_cases >= 10 ? "critical" : "high",
      title: "Pico de SLA vencidos",
      description: `${g.breached_sla_cases} casos con SLA operativo incumplido.`,
      customer_id: null,
    });
  }

  if (g && g.critical_open >= 8) {
    out.push({
      id: aid("critical_growth"),
      kind: "critical_growth",
      severity: "high",
      title: "Crecimiento de casos críticos",
      description: `${g.critical_open} casos críticos abiertos simultáneamente.`,
      customer_id: null,
    });
  }

  if (ctx.ownership && ctx.ownership.unassigned_critical >= 2) {
    out.push({
      id: aid("unassigned_critical"),
      kind: "unassigned_critical",
      severity: "critical",
      title: "Críticos sin responsable",
      description: `${ctx.ownership.unassigned_critical} casos críticos sin operador asignado.`,
      customer_id: null,
    });
  }

  const overloaded = ctx.analytics?.operators.filter(
    (o) => o.workload_band === "overloaded" || o.workload_band === "critical"
  ).length ?? 0;
  if (overloaded >= 2) {
    out.push({
      id: aid("inactive_operator"),
      kind: "inactive_operator",
      severity: "medium",
      title: "Presión de carga en equipo",
      description: `${overloaded} operadores en estado de sobrecarga.`,
      customer_id: null,
    });
  }

  if (q && q.stats.promises_due_today >= 3 && g && g.followups_due_today === 0) {
    out.push({
      id: aid("follow_up_abandonment"),
      kind: "follow_up_abandonment",
      severity: "medium",
      title: "Promesas sin follow-up calendarizado",
      description: `${q.stats.promises_due_today} promesas vencen hoy sin follow-ups programados visibles.`,
      customer_id: null,
    });
  }

  for (const summary of ctx.client_summaries) {
    if (summary.concentration_percent != null && summary.concentration_percent >= 45) {
      out.push({
        id: aid("concentration_surge"),
        kind: "concentration_surge",
        severity: summary.concentration_percent >= 50 ? "high" : "medium",
        title: `Concentración: ${summary.customer_name}`,
        description: `${summary.customer_name} concentra ${Math.round(summary.concentration_percent)}% del riesgo operativo visible.`,
        customer_id: summary.customer_id,
      });
    }
  }

  const recentAuto = ctx.automation_actions.filter((a) => a.executed).length;
  if (recentAuto >= 10) {
    out.push({
      id: aid("backlog_spike"),
      kind: "backlog_spike",
      severity: "low",
      title: "Alta actividad de automatización",
      description: `${recentAuto} acciones automáticas ejecutadas recientemente — revisar impacto en cola.`,
      customer_id: null,
    });
  }

  const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]).slice(0, 12);
}

export function anomaliesFromSnapshots(
  analytics: OperationalAnalyticsSnapshot | null,
  queue: DailyOperationsQueue | null,
  ownership: OperationalOwnershipStats | null
): OperationalAnomaly[] {
  return detectOperationalAnomalies({
    analytics,
    queue,
    ownership,
    automation_runs: [],
    automation_actions: [],
    client_summaries: [],
    loaded_at: new Date().toISOString(),
  });
}
