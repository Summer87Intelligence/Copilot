/**
 * Phase 5D — Strategy Recommendation Engine.
 * Sintetiza 4 snapshots → 3-7 recomendaciones ejecutivas determinísticas.
 * Puro: sin imports de DB, sin side effects, sin LLM.
 */

import type {
  ActionEffectivenessSnapshot,
  AutomationEffectivenessSnapshot,
  ForecastCalibrationSnapshot,
  OperatorEffectivenessSnapshot,
  StrategyRecommendation,
  StrategyRecommendationCategory,
  StrategyRecommendationConfidence,
} from "./learning-types";

type RecommendationInput = {
  actionEffectiveness:    ActionEffectivenessSnapshot;
  operatorEffectiveness:  OperatorEffectivenessSnapshot;
  automationEffectiveness: AutomationEffectivenessSnapshot;
  forecastCalibration:    ForecastCalibrationSnapshot;
};

let _idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++_idCounter}`;
}

function confidence(evidenceCount: number): StrategyRecommendationConfidence {
  if (evidenceCount >= 5) return "high";
  if (evidenceCount >= 2) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** R1: Best action type has high effectiveness → amplify it */
function ruleTopActionAmplify(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const { by_action_type, data_source } = input.actionEffectiveness;
  if (data_source === "insufficient" || by_action_type.length < 2) return;
  const top = by_action_type[0]!;
  if (top.effectiveness_pct < 50) return;

  const evidence = [
    `"${top.action_label}" con ${top.effectiveness_pct}% de efectividad`,
    `${top.payment_within_7d_count} pagos obtenidos en 7 días`,
    `${top.sample_size} casos analizados`,
    ...(top.avg_days_to_payment !== null
      ? [`Promedio de cobro: ${top.avg_days_to_payment} días`]
      : []),
  ];

  out.push({
    id:         nextId("rec_action"),
    category:   "action" as StrategyRecommendationCategory,
    title:      `Ampliar uso de "${top.action_label}"`,
    reason:     `Es la acción con mayor efectividad (${top.effectiveness_pct}%). Aplicarla sistemáticamente puede mejorar los resultados del equipo.`,
    confidence: confidence(evidence.length),
    actionable: true,
    evidence,
  });
}

/** R2: Worst action type has very low effectiveness → reduce/stop */
function ruleWorstActionReduce(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const { by_action_type, data_source } = input.actionEffectiveness;
  if (data_source === "insufficient" || by_action_type.length < 2) return;
  const worst = by_action_type[by_action_type.length - 1]!;
  if (worst.effectiveness_pct >= 20) return;

  const evidence = [
    `"${worst.action_label}" con solo ${worst.effectiveness_pct}% de efectividad`,
    `${worst.no_response_count} casos sin respuesta detectados`,
    `${worst.sample_size} casos evaluados`,
  ];

  out.push({
    id:         nextId("rec_action"),
    category:   "action" as StrategyRecommendationCategory,
    title:      `Revisar o eliminar "${worst.action_label}"`,
    reason:     `Efectividad muy baja (${worst.effectiveness_pct}%). El esfuerzo podría redirigirse a acciones más efectivas.`,
    confidence: confidence(evidence.length),
    actionable: true,
    evidence,
  });
}

/** R3: Top operator has high recovery rate → assign critical cases */
function ruleTopOperatorAssignment(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const { by_operator, data_source } = input.operatorEffectiveness;
  if (data_source === "insufficient" || by_operator.length === 0) return;
  const top = by_operator[0]!;
  if (top.recovery_rate_pct < 60) return;

  const evidence = [
    `${top.display_name}: ${top.recovery_rate_pct}% tasa de recuperación`,
    `${top.recovered_cases} casos recuperados de ${top.total_cases_handled} gestionados`,
    ...(top.sla_compliance_pct >= 90
      ? [`Cumplimiento SLA: ${Math.round(top.sla_compliance_pct)}%`]
      : []),
  ];

  out.push({
    id:         nextId("rec_operator"),
    category:   "operator" as StrategyRecommendationCategory,
    title:      `Asignar casos críticos a ${top.display_name}`,
    reason:     `Tiene la mayor tasa de recuperación del equipo (${top.recovery_rate_pct}%). Los casos críticos se beneficiarán de su gestión.`,
    confidence: confidence(evidence.length),
    actionable: true,
    evidence,
  });
}

/** R4: Automation has noisy rules → review rules */
function ruleNoisyAutomation(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const { noisy_rules, overall_dedupe_ratio } = input.automationEffectiveness;
  if (noisy_rules.length === 0 || overall_dedupe_ratio < 0.3) return;

  const criticalRules = noisy_rules.filter((r) => r.noise_level === "critical");
  const topNoisy = noisy_rules[0]!;

  const evidence = [
    `Ratio de deduplicación global: ${Math.round(overall_dedupe_ratio * 100)}%`,
    `${noisy_rules.length} regla(s) con alto ruido`,
    `Regla más ruidosa: "${topNoisy.rule_label}" (${Math.round(topNoisy.dedupe_ratio * 100)}% deduplicada)`,
    ...(criticalRules.length > 0
      ? [`${criticalRules.length} regla(s) con nivel crítico`]
      : []),
  ];

  out.push({
    id:         nextId("rec_automation"),
    category:   "automation" as StrategyRecommendationCategory,
    title:      `Revisar ${noisy_rules.length} regla(s) de automatización ruidosas`,
    reason:     `El ${Math.round(overall_dedupe_ratio * 100)}% de acciones automáticas son deduplicadas. Las reglas generan ruido sin valor operativo.`,
    confidence: confidence(evidence.length),
    actionable: true,
    evidence,
  });
}

/** R5: Forecast calibration score low → recalibrate weights */
function ruleLowCalibration(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const { calibration_score, data_source, recommended_weight_adjustments } =
    input.forecastCalibration;
  if (data_source === "insufficient" || calibration_score >= 70) return;

  const evidence = [
    `Score de calibración: ${calibration_score}/100`,
    ...recommended_weight_adjustments.slice(0, 3),
  ];

  out.push({
    id:         nextId("rec_forecast"),
    category:   "forecast" as StrategyRecommendationCategory,
    title:      `Recalibrar modelo predictivo (score ${calibration_score}/100)`,
    reason:     `Las predicciones de recuperación tienen desviaciones significativas respecto a resultados reales.`,
    confidence: confidence(evidence.length),
    actionable: recommended_weight_adjustments.length > 0,
    evidence,
  });
}

/** R6: Overestimated high-probability segment → reduce false confidence */
function ruleOverestimatedHighBand(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const { overestimated_segments } = input.forecastCalibration;
  const highOverestimated = overestimated_segments.find(
    (s) => s.segment === "Alta probabilidad" && Math.abs(s.delta_pct) >= 15
  );
  if (!highOverestimated) return;

  const evidence = [
    `Segmento "Alta probabilidad": previsto ${highOverestimated.predicted_pct}%, real ${highOverestimated.actual_pct}%`,
    `Desviación: ${highOverestimated.delta_pct}pp (sobreestimado)`,
    `${highOverestimated.sample_size} casos en este segmento`,
  ];

  out.push({
    id:         nextId("rec_forecast"),
    category:   "forecast" as StrategyRecommendationCategory,
    title:      `Bajar expectativas para casos de "Alta probabilidad"`,
    reason:     `El modelo sobreestima la recuperación de clientes clasificados como alta probabilidad. Ajustar umbrales de confianza.`,
    confidence: confidence(evidence.length),
    actionable: true,
    evidence,
  });
}

/** R7: Multiple operators with very low SLA compliance → escalate workload review */
function ruleOperatorsSlaLow(
  input: RecommendationInput,
  out: StrategyRecommendation[]
): void {
  const lowSla = input.operatorEffectiveness.by_operator.filter(
    (o) => o.sla_compliance_pct < 70 && o.total_cases_handled >= 5
  );
  if (lowSla.length === 0) return;

  const evidence = [
    `${lowSla.length} operador(es) con SLA < 70%`,
    ...lowSla.slice(0, 3).map(
      (o) => `${o.display_name}: ${Math.round(o.sla_compliance_pct)}% SLA`
    ),
  ];

  out.push({
    id:         nextId("rec_operator"),
    category:   "operator" as StrategyRecommendationCategory,
    title:      `${lowSla.length} operador(es) con SLA crítico — revisar carga`,
    reason:     `El incumplimiento de SLA por operadores aumenta el riesgo de pérdida de recuperabilidad en casos activos.`,
    confidence: confidence(evidence.length),
    actionable: true,
    evidence,
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateStrategyRecommendations(
  input: RecommendationInput
): StrategyRecommendation[] {
  _idCounter = 0; // reset per call for determinism
  const out: StrategyRecommendation[] = [];

  ruleTopActionAmplify(input, out);
  ruleWorstActionReduce(input, out);
  ruleTopOperatorAssignment(input, out);
  ruleNoisyAutomation(input, out);
  ruleLowCalibration(input, out);
  ruleOverestimatedHighBand(input, out);
  ruleOperatorsSlaLow(input, out);

  // Sort by confidence (high → medium → low) then by actionable
  const ORDER: Record<StrategyRecommendationConfidence, number> = { high: 0, medium: 1, low: 2 };
  return out
    .sort((a, b) => {
      const cDiff = ORDER[a.confidence] - ORDER[b.confidence];
      if (cDiff !== 0) return cDiff;
      return Number(b.actionable) - Number(a.actionable);
    })
    .slice(0, 7);
}
