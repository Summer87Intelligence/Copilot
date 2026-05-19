/**
 * Phase 5C — Executive Decision Engine.
 * Produce un ExecutiveDecisionBrief determinístico a partir de señales del sistema.
 * Puro: sin imports de DB, sin side effects.
 */

import type {
  AutomationActionRow,
  AutomationRunRow,
  OperationalAnalyticsSnapshot,
  PortfolioScore,
  RankedClient,
} from "@/lib/decision-engine/de-types";
import type { PredictiveSnapshot } from "@/lib/decision-engine/predictive/predictive-types";
import type { StrategyRecommendation } from "@/lib/decision-engine/learning/learning-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutiveDecisionUrgency = "critical" | "high" | "medium" | "low";

export type ExecutiveDecisionActionType =
  | "recover_cash"
  | "reduce_concentration"
  | "fix_sla"
  | "rebalance_workload"
  | "review_pipeline"
  | "monitor";

export type ExecutiveDecision = {
  id: string;
  rank: number;
  title: string;
  reason: string;
  urgency: ExecutiveDecisionUrgency;
  action_type: ExecutiveDecisionActionType;
  linked_customer_id?: string;
  linked_customer_name?: string;
  expected_impact: {
    cash_recovery?: number;
    risk_reduction?: string;
    sla_improvement?: string;
    workload_improvement?: string;
  };
  recommended_action: string;
  evidence: string[];
};

export type ExecutiveDecisionBrief = {
  generated_at: string;
  executive_summary: string;
  top_decisions: ExecutiveDecision[];
  today_priorities: string[];
  business_risks: string[];
  expected_business_impact: string;
  recommended_focus: string;
  confidence_pct: number;
  source_signals: string[];
};

export type PipelineSignal = {
  name: string;
  ok: boolean;
  stale: boolean;
};

export type ExecutiveDecisionEngineInput = {
  portfolio_score: PortfolioScore | null;
  analytics: OperationalAnalyticsSnapshot | null;
  predictive: PredictiveSnapshot | null;
  ranked_clients: RankedClient[];
  automation_runs: AutomationRunRow[];
  automation_actions: AutomationActionRow[];
  pipeline_signals: PipelineSignal[];
  strategy_recommendations?: StrategyRecommendation[];
  calibration_score?: number | null;
  now?: Date;
};

// ---------------------------------------------------------------------------
// Urgency ordering
// ---------------------------------------------------------------------------

const URGENCY_ORDER: Record<ExecutiveDecisionUrgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Decision rules
// ---------------------------------------------------------------------------

function ruleHighConcentration(
  ranked: RankedClient[],
  decisions: ExecutiveDecision[]
): void {
  const critical = ranked.filter(
    (c) => c.concentration_pct > 40 && c.risk_assessment.level === "critical"
  );
  if (critical.length === 0) return;

  const top = critical[0]!;
  decisions.push({
    id: "concentration_critical",
    rank: 0,
    title: `${top.company_name} concentra ${Math.round(top.concentration_pct)}% de cartera`,
    reason: `Cliente crítico con alta concentración aumenta exposición patrimonial.`,
    urgency: "critical",
    action_type: "reduce_concentration",
    linked_customer_id: top.company_id,
    linked_customer_name: top.company_name,
    expected_impact: {
      cash_recovery: top.pending_amount,
      risk_reduction: "alta",
    },
    recommended_action: `Priorizar recuperación de ${top.company_name} y revisar límite de crédito.`,
    evidence: [
      `Concentración: ${Math.round(top.concentration_pct)}% de cartera total`,
      `Estado: ${top.risk_assessment.level}`,
      `Antigüedad: ${top.oldest_days}d`,
      ...(top.collection_status ? [`Colección: ${top.collection_status}`] : []),
    ],
  });
}

function rulePortfolioScoreLow(
  score: PortfolioScore,
  decisions: ExecutiveDecision[]
): void {
  if (score.score >= 60) return;

  const urgency: ExecutiveDecisionUrgency = score.score < 40 ? "critical" : "high";
  decisions.push({
    id: "portfolio_score_low",
    rank: 0,
    title: `Score de cartera bajo: ${score.score}/100`,
    reason: `La cartera requiere intervención directa. Efectividad ${Math.round(score.effectiveness_pct * 100)}%, deuda 90+: ${Math.round(score.over90_pct)}%.`,
    urgency,
    action_type: "recover_cash",
    expected_impact: {
      risk_reduction: "media-alta",
    },
    recommended_action: "Foco ejecutivo en recuperación activa y reducción de aging crítico.",
    evidence: [
      `Score: ${score.score}/100 (${score.band})`,
      `Deuda 90+: ${Math.round(score.over90_pct)}%`,
      `Efectividad: ${Math.round(score.effectiveness_pct * 100)}%`,
      `Deudores activos: ${score.active_debtors_count}`,
    ],
  });
}

function ruleSlaCompliance(
  analytics: OperationalAnalyticsSnapshot,
  decisions: ExecutiveDecision[]
): void {
  const compliance = analytics.sla.compliance_pct;
  if (compliance >= 85) return;

  const urgency: ExecutiveDecisionUrgency = compliance < 70 ? "critical" : "high";
  decisions.push({
    id: "sla_compliance_low",
    rank: 0,
    title: `SLA de cobranza al ${Math.round(compliance)}%`,
    reason: `El equipo no está cumpliendo los tiempos de respuesta mínimos antes de escalar.`,
    urgency,
    action_type: "fix_sla",
    expected_impact: {
      sla_improvement: `+${Math.round(85 - compliance)} pp hasta objetivo`,
    },
    recommended_action: "Revisar carga operativa y asignar responsables a casos sin dueño.",
    evidence: [
      `Cumplimiento SLA: ${Math.round(compliance)}%`,
      `Incumplimientos: ${analytics.sla.breached_total}`,
      `Backlog operativo: ${analytics.global.operational_backlog}`,
    ],
  });
}

function ruleOverloadedOperators(
  analytics: OperationalAnalyticsSnapshot,
  decisions: ExecutiveDecision[]
): void {
  const overloaded = analytics.queue_signals.overloaded_operators_count;
  if (overloaded === 0) return;

  const names = analytics.operators
    .filter((o) => o.workload_band === "overloaded" || o.workload_band === "critical")
    .map((o) => o.display_name)
    .join(", ");

  decisions.push({
    id: "operators_overloaded",
    rank: 0,
    title: `${overloaded} operador(es) con sobrecarga`,
    reason: `Operadores sobrecargados reducen velocidad de respuesta y aumentan riesgo de SLA.`,
    urgency: "high",
    action_type: "rebalance_workload",
    expected_impact: {
      workload_improvement: `Distribuir ${overloaded} carga(s) activas`,
    },
    recommended_action: "Redistribuir casos hacia operadores con capacidad disponible.",
    evidence: [
      `Sobrecargados: ${names || overloaded}`,
      `Casos sin asignar: ${analytics.global.unassigned_cases}`,
      `Follow-ups hoy: ${analytics.queue_signals.followups_due_today}`,
    ],
  });
}

function ruleRecoveryOpportunities(
  predictive: PredictiveSnapshot,
  decisions: ExecutiveDecision[]
): void {
  const opportunities = predictive.recovery_opportunities.filter(
    (o) => o.urgency === "critical" || o.urgency === "high" || o.opportunity_type === "quick_win"
  );
  if (opportunities.length === 0) return;

  const totalAmount = opportunities.reduce((s, o) => s + o.recovery_amount, 0);
  const top = opportunities[0]!;

  decisions.push({
    id: "recovery_opportunities",
    rank: 0,
    title: `${opportunities.length} oportunidad(es) de recuperación rápida`,
    reason: `Hay casos con alta probabilidad de cobro que pueden atacarse hoy.`,
    urgency: "medium",
    action_type: "recover_cash",
    linked_customer_id: top.customer_id,
    linked_customer_name: top.customer_name,
    expected_impact: {
      cash_recovery: totalAmount,
    },
    recommended_action: `Atacar primero ${top.customer_name}: ${top.recommended_action}`,
    evidence: [
      `Oportunidades: ${opportunities.length}`,
      `Recuperación estimada: ${totalAmount.toLocaleString("es-UY")}`,
      `Top: ${top.customer_name} — ${top.reason}`,
    ],
  });
}

function ruleForecastDeterioration(
  predictive: PredictiveSnapshot,
  decisions: ExecutiveDecision[]
): void {
  const pf30 = predictive.portfolio_forecasts.find((f) => f.horizon_days === 30);
  if (!pf30) return;
  if (pf30.deterioration_band === "stable" || pf30.deterioration_band === "watch") return;

  const urgency: ExecutiveDecisionUrgency =
    pf30.deterioration_band === "severe" ? "critical" : "high";

  decisions.push({
    id: "forecast_deterioration",
    rank: 0,
    title: `Cartera proyectada deteriorándose a 30 días`,
    reason: `El modelo predictivo indica deterioro ${pf30.deterioration_band} si no se actúa esta semana.`,
    urgency,
    action_type: "monitor",
    expected_impact: {
      risk_reduction: "alta si se actúa en 7 días",
    },
    recommended_action: pf30.recommended_countermeasures[0] ?? "Implementar plan preventivo inmediato.",
    evidence: [
      `Banda: ${pf30.deterioration_band}`,
      `Riesgo proyectado +${pf30.projected_risk_delta_pct}%`,
      `Casos críticos esperados: ${pf30.projected_critical_cases}`,
      ...(pf30.drivers.slice(0, 2)),
    ],
  });
}

function ruleAutomationDedupeHigh(
  runs: AutomationRunRow[],
  decisions: ExecutiveDecision[]
): void {
  const lastRun = runs[0];
  if (!lastRun) return;
  const deduped = lastRun.actions_deduped ?? 0;
  if (deduped < 5) return;

  decisions.push({
    id: "automation_dedupe_high",
    rank: 0,
    title: `Alta deduplicación en automatización (${deduped} acciones)`,
    reason: `Muchas acciones automáticas están siendo bloqueadas por deduplicación, lo que puede ocultar problemas reales.`,
    urgency: "low",
    action_type: "review_pipeline",
    expected_impact: {
      risk_reduction: "baja",
    },
    recommended_action: "Revisar reglas de automatización antes de expandir el alcance.",
    evidence: [
      `Deduplicadas: ${deduped}`,
      `Generadas: ${lastRun.actions_generated}`,
      `Ejecutadas: ${lastRun.actions_executed}`,
    ],
  });
}

function rulePipelinesUnhealthy(
  signals: PipelineSignal[],
  decisions: ExecutiveDecision[]
): void {
  const unhealthy = signals.filter((s) => !s.ok || s.stale);
  if (unhealthy.length === 0) return;

  decisions.push({
    id: "pipelines_unhealthy",
    rank: 0,
    title: `${unhealthy.length} pipeline(s) con problemas`,
    reason: `Datos stale o pipelines fallidos reducen confiabilidad de decisiones.`,
    urgency: "high",
    action_type: "review_pipeline",
    expected_impact: {
      risk_reduction: "requerido antes de accionar",
    },
    recommended_action: "Verificar sincronización Zeta y re-correr pipelines afectados.",
    evidence: unhealthy.map((s) => `${s.name}: ${s.stale ? "stale" : "fallido"}`),
  });
}

function ruleLearningRecommendations(
  recommendations: StrategyRecommendation[],
  decisions: ExecutiveDecision[]
): void {
  const highConfidence = recommendations.filter(
    (r) => r.confidence === "high" && r.actionable
  );
  for (const rec of highConfidence.slice(0, 2)) {
    const actionTypeMap: Record<string, ExecutiveDecisionActionType> = {
      action:     "recover_cash",
      operator:   "rebalance_workload",
      automation: "review_pipeline",
      forecast:   "monitor",
      portfolio:  "recover_cash",
    };
    decisions.push({
      id:           `learning_${rec.id}`,
      rank:         0,
      title:        rec.title,
      reason:       rec.reason,
      urgency:      "medium",
      action_type:  actionTypeMap[rec.category] ?? "monitor",
      expected_impact: {},
      recommended_action: rec.evidence[0] ?? rec.reason,
      evidence: rec.evidence,
    });
  }
}

function ruleStaleData(
  portfolioScore: PortfolioScore | null,
  analytics: OperationalAnalyticsSnapshot | null,
  decisions: ExecutiveDecision[]
): void {
  if (portfolioScore !== null && analytics !== null) return;

  const missing: string[] = [];
  if (portfolioScore === null) missing.push("score de cartera");
  if (analytics === null) missing.push("analytics operacional");

  decisions.push({
    id: "stale_data_guard",
    rank: 0,
    title: "Verificar sincronización de datos antes de accionar",
    reason: `Faltan señales críticas: ${missing.join(", ")}. Las decisiones podrían ser incompletas.`,
    urgency: "critical",
    action_type: "review_pipeline",
    expected_impact: {
      risk_reduction: "requerido para confiabilidad",
    },
    recommended_action: "Revisar estado de pipelines Zeta y snapshots del motor de decisiones.",
    evidence: [`Señales faltantes: ${missing.join(", ")}`],
  });
}

// ---------------------------------------------------------------------------
// Sorting + ranking
// ---------------------------------------------------------------------------

function rankAndSort(decisions: ExecutiveDecision[]): ExecutiveDecision[] {
  return decisions
    .sort((a, b) => {
      const uDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (uDiff !== 0) return uDiff;
      const aAmount = a.expected_impact.cash_recovery ?? 0;
      const bAmount = b.expected_impact.cash_recovery ?? 0;
      return bAmount - aAmount;
    })
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildExecutiveSummary(
  input: ExecutiveDecisionEngineInput,
  decisions: ExecutiveDecision[]
): string {
  const parts: string[] = [];

  if (input.portfolio_score) {
    const score = input.portfolio_score;
    parts.push(
      `Cartera en banda ${score.band} (score ${score.score}/100, efectividad ${Math.round(score.effectiveness_pct * 100)}%).`
    );
  }

  const critical = decisions.filter((d) => d.urgency === "critical");
  if (critical.length > 0) {
    parts.push(`${critical.length} decisión(es) crítica(s) requieren acción inmediata.`);
  } else if (decisions.length > 0) {
    parts.push(`${decisions.length} prioridad(es) ejecutiva(s) identificadas para hoy.`);
  } else {
    parts.push("No se detectaron alertas urgentes.");
  }

  if (input.predictive?.recovery_opportunities?.length) {
    parts.push(`${input.predictive.recovery_opportunities.length} oportunidad(es) de recuperación activas.`);
  }

  return parts.join(" ");
}

function buildTodayPriorities(decisions: ExecutiveDecision[]): string[] {
  return decisions.slice(0, 3).map((d) => d.title);
}

function buildBusinessRisks(
  input: ExecutiveDecisionEngineInput,
  decisions: ExecutiveDecision[]
): string[] {
  const risks: string[] = [];

  const critHigh = decisions.filter(
    (d) => d.urgency === "critical" || d.urgency === "high"
  );
  for (const d of critHigh.slice(0, 3)) {
    risks.push(d.reason);
  }

  if (input.predictive) {
    const pf30 = input.predictive.portfolio_forecasts.find((f) => f.horizon_days === 30);
    if (pf30 && (pf30.deterioration_band === "deteriorating" || pf30.deterioration_band === "severe")) {
      risks.push(`Deterioro proyectado 30d: +${pf30.projected_risk_delta_pct}% riesgo.`);
    }
  }

  return risks.slice(0, 4);
}

function buildExpectedImpact(decisions: ExecutiveDecision[]): string {
  const totalCash = decisions.reduce(
    (s, d) => s + (d.expected_impact.cash_recovery ?? 0),
    0
  );
  if (totalCash > 0) {
    return `Recuperación potencial estimada: ${totalCash.toLocaleString("es-UY")} si se ejecutan las acciones prioritarias.`;
  }
  const criticalCount = decisions.filter((d) => d.urgency === "critical").length;
  if (criticalCount > 0) {
    return `${criticalCount} acción(es) crítica(s) con impacto directo en riesgo de cartera.`;
  }
  return "Impacto incremental en estabilización operacional.";
}

function buildRecommendedFocus(decisions: ExecutiveDecision[]): string {
  const top = decisions[0];
  if (!top) return "Monitorear estado operacional.";
  return top.recommended_action;
}

function buildConfidence(input: ExecutiveDecisionEngineInput): number {
  let score = 100;
  if (!input.portfolio_score) score -= 25;
  if (!input.analytics) score -= 25;
  if (!input.predictive) score -= 15;
  if (input.pipeline_signals.some((s) => !s.ok || s.stale)) score -= 10;
  if (input.calibration_score !== undefined && input.calibration_score !== null && input.calibration_score < 50) {
    score -= 10; // Low forecast calibration reduces confidence in predictions
  }
  return Math.max(score, 20);
}

function buildSourceSignals(input: ExecutiveDecisionEngineInput): string[] {
  const signals: string[] = [];
  if (input.portfolio_score) signals.push("portfolio_score");
  if (input.analytics) signals.push("analytics_snapshot");
  if (input.predictive) signals.push("predictive_snapshot");
  if (input.ranked_clients.length > 0) signals.push(`ranked_clients(${input.ranked_clients.length})`);
  if (input.automation_runs.length > 0) signals.push("automation_runs");
  if (input.pipeline_signals.length > 0) signals.push("pipeline_health");
  return signals;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateExecutiveBrief(
  input: ExecutiveDecisionEngineInput
): ExecutiveDecisionBrief {
  const rawDecisions: ExecutiveDecision[] = [];

  // Rule 8: stale data guard (must run first — blocks other analysis)
  ruleStaleData(input.portfolio_score, input.analytics, rawDecisions);

  // Only run other rules if we have minimum viable data
  const hasMinData = input.portfolio_score !== null;

  if (hasMinData) {
    ruleHighConcentration(input.ranked_clients, rawDecisions);
    rulePortfolioScoreLow(input.portfolio_score!, rawDecisions);
  }

  if (input.analytics) {
    ruleSlaCompliance(input.analytics, rawDecisions);
    ruleOverloadedOperators(input.analytics, rawDecisions);
  }

  if (input.predictive) {
    ruleRecoveryOpportunities(input.predictive, rawDecisions);
    ruleForecastDeterioration(input.predictive, rawDecisions);
  }

  ruleAutomationDedupeHigh(input.automation_runs, rawDecisions);

  if (input.pipeline_signals.length > 0) {
    rulePipelinesUnhealthy(input.pipeline_signals, rawDecisions);
  }

  if (input.strategy_recommendations && input.strategy_recommendations.length > 0) {
    ruleLearningRecommendations(input.strategy_recommendations, rawDecisions);
  }

  const top_decisions = rankAndSort(rawDecisions);

  return {
    generated_at: (input.now ?? new Date()).toISOString(),
    executive_summary: buildExecutiveSummary(input, top_decisions),
    top_decisions,
    today_priorities: buildTodayPriorities(top_decisions),
    business_risks: buildBusinessRisks(input, top_decisions),
    expected_business_impact: buildExpectedImpact(top_decisions),
    recommended_focus: buildRecommendedFocus(top_decisions),
    confidence_pct: buildConfidence(input),
    source_signals: buildSourceSignals(input),
  };
}
