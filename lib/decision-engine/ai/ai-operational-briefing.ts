/**
 * Phase 5A — briefing operacional narrativo (determinístico).
 */

import { buildClientOperationalSummaries } from "@/lib/decision-engine/client-operational-summary-builder";
import { QUEUE_SECTION_ORDER } from "@/lib/decision-engine/daily-operations-queue-panel.helpers";
import type { AIIntelligenceContext, AIOperationalBriefing, AIOperationalPriority } from "@/lib/decision-engine/ai/ai-types";
import { detectOperationalAnomalies } from "@/lib/decision-engine/ai/ai-anomaly-detector";
import { buildOperatorInsights } from "@/lib/decision-engine/ai/ai-operator-insights";

function countCriticalRisks(ctx: AIIntelligenceContext): number {
  const g = ctx.analytics?.global;
  let n = g?.critical_open ?? 0;
  if (ctx.ownership?.unassigned_critical) n += ctx.ownership.unassigned_critical;
  return Math.max(n, ctx.client_summaries.filter((s) => s.highest_priority === "critical").length);
}

function buildPriorities(ctx: AIIntelligenceContext): AIOperationalPriority[] {
  const summaries =
    ctx.client_summaries.length > 0
      ? ctx.client_summaries
      : ctx.queue
        ? buildClientOperationalSummaries(
            QUEUE_SECTION_ORDER.flatMap((sec) => ctx.queue!.sections[sec] ?? [])
          )
        : [];

  return summaries
    .filter((s) => s.actionable_now || s.sla_breached || s.highest_priority === "critical")
    .sort((a, b) => b.primary_action.priority_score - a.primary_action.priority_score)
    .slice(0, 5)
    .map((s, i) => ({
      rank: i + 1,
      customer_id: s.customer_id,
      customer_name: s.customer_name,
      label: s.primary_action.action_label,
      reason: s.reasons[0] ?? s.primary_action.reason,
    }));
}

export function buildOperationalBriefing(ctx: AIIntelligenceContext): AIOperationalBriefing {
  const criticalCount = countCriticalRisks(ctx);
  const anomalies = detectOperationalAnomalies(ctx);
  const operatorInsights = buildOperatorInsights(ctx.analytics);
  const priorities = buildPriorities(ctx);
  const g = ctx.analytics?.global;
  const q = ctx.queue?.stats;

  const key_points: string[] = [];
  const emerging_risks: string[] = [];
  const workload_warnings: string[] = [];

  if (criticalCount > 0) {
    key_points.push(`${criticalCount} riesgo(s) operacional(es) crítico(s) requieren atención hoy.`);
  }

  const top = priorities[0];
  if (top) {
    const conc = ctx.client_summaries.find((s) => s.customer_id === top.customer_id)?.concentration_percent;
    const days = ctx.client_summaries.find((s) => s.customer_id === top.customer_id)?.primary_action.oldest_days;
    if (conc != null && conc >= 40 && days != null && days >= 14) {
      key_points.push(
        `• ${top.customer_name} concentra ${Math.round(conc)}% del riesgo y lleva ${days} días sin contacto efectivo.`
      );
    }
  }

  const promiseCount = q?.promises_due_today ?? 0;
  if (promiseCount > 0) {
    key_points.push(`• Hay ${promiseCount} promesa(s) de pago vencida(s) o con vencimiento hoy.`);
  }

  if (g && g.operational_backlog >= 15) {
    const pctHint = g.operational_backlog >= 20 ? "elevado" : "en alza";
    key_points.push(`• El backlog operativo está ${pctHint} (${g.operational_backlog} ítems activos).`);
  }

  const overloadedOps = ctx.analytics?.operators.filter(
    (o) => o.workload_band === "overloaded" || o.workload_band === "critical"
  );
  if (overloadedOps && overloadedOps.length > 0) {
    const names = overloadedOps.map((o) => o.display_name).join(", ");
    key_points.push(
      `• Existe ${overloadedOps.length} operador(es) en estado SOBRECARGA/CRÍTICA: ${names}.`
    );
    workload_warnings.push(`${overloadedOps.length} operador(es) con carga crítica — redistribuir casos.`);
  }

  for (const a of anomalies.filter((x) => x.severity === "critical" || x.severity === "high").slice(0, 3)) {
    emerging_risks.push(a.description);
  }

  if (ctx.ownership && ctx.ownership.unassigned_critical > 0) {
    emerging_risks.push(`${ctx.ownership.unassigned_critical} casos críticos sin dueño asignado.`);
  }

  if (g && g.breached_sla_cases > 0 && g.breached_sla_cases / Math.max(1, g.active_cases) > 0.25) {
    emerging_risks.push(
      `SLA deteriorado: ${g.breached_sla_cases} de ${g.active_cases} casos activos con incumplimiento.`
    );
  }

  for (const ins of operatorInsights.filter((i) => i.severity === "critical" || i.severity === "high").slice(0, 2)) {
    workload_warnings.push(ins.message);
  }

  const summary =
    criticalCount > 0
      ? `Hoy hay ${criticalCount} riesgos operacionales críticos.`
      : "La operación del día se mantiene en rango controlable con señales a monitorear.";

  if (key_points.length === 0) {
    key_points.push("Sin alertas críticas nuevas — mantener ritmo de contacto y seguimiento de promesas.");
  }

  return {
    summary,
    key_points,
    operational_priorities: priorities,
    emerging_risks: emerging_risks.slice(0, 5),
    workload_warnings: workload_warnings.slice(0, 4),
  };
}
