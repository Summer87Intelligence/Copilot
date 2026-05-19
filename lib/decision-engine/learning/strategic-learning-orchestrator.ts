/**
 * Phase 5D — Strategic Learning Orchestrator.
 * Corre los 4 motores y sintetiza el StrategicLearningSnapshot.
 * Puro: sin imports de DB, sin side effects.
 */

import { computeActionEffectiveness } from "./action-effectiveness-engine";
import { computeAutomationEffectiveness } from "./automation-effectiveness-engine";
import { computeForecastCalibration } from "./forecast-calibration-engine";
import { computeOperatorEffectiveness } from "./operator-effectiveness-engine";
import { generateStrategyRecommendations } from "./strategy-recommendation-engine";
import type {
  StrategicLearningContext,
  StrategicLearningSnapshot,
} from "./learning-types";

export function generateStrategicLearningSnapshot(
  context: StrategicLearningContext
): StrategicLearningSnapshot {
  const startMs = Date.now();
  const nowIso  = context.loadedAt;

  const actionEffectiveness    = computeActionEffectiveness(context);
  const operatorEffectiveness  = computeOperatorEffectiveness(context);
  const automationEffectiveness = computeAutomationEffectiveness(context);
  const forecastCalibration    = computeForecastCalibration(context);

  const strategyRecommendations = generateStrategyRecommendations({
    actionEffectiveness,
    operatorEffectiveness,
    automationEffectiveness,
    forecastCalibration,
  });

  const positiveOutcomeTypes = new Set([
    "payment_received",
    "promise_kept",
    "recovered",
  ]);
  const positiveOutcomes = context.existingOutcomes.filter((o) =>
    positiveOutcomeTypes.has(o.outcome_type)
  ).length;

  const noisyRules = automationEffectiveness.noisy_rules.length;

  return {
    generated_at:           nowIso,
    outcomes_total:         context.existingOutcomes.length,
    action_effectiveness:   actionEffectiveness,
    operator_effectiveness: operatorEffectiveness,
    automation_effectiveness: automationEffectiveness,
    forecast_calibration:   forecastCalibration,
    strategy_recommendations: strategyRecommendations,
    metrics: {
      outcomes_detected:   context.existingOutcomes.length,
      positive_outcomes:   positiveOutcomes,
      noisy_rules:         noisyRules,
      calibration_score:   forecastCalibration.calibration_score,
      generation_ms:       Date.now() - startMs,
    },
    source_snapshot_ids: {
      bundle_loaded_at:        context.bundle.loadedAt,
      analytics_generated_at:  context.analytics?.generated_at ?? null,
      predictive_generated_at: context.predictive?.generated_at ?? null,
    },
  };
}
