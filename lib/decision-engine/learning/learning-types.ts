/**
 * Phase 5D — Strategic Learning Layer — tipos compartidos.
 * Puro: sin imports de DB, sin side effects.
 */

import type {
  AutomationActionRow,
  AutomationRunRow,
  DecisionEngineDataBundle,
  OperationalAnalyticsSnapshot,
} from "@/lib/decision-engine/de-types";
import type { PredictiveSnapshot } from "@/lib/decision-engine/predictive/predictive-types";

// ---------------------------------------------------------------------------
// Outcome tracking
// ---------------------------------------------------------------------------

export type LearningOutcomeSourceType =
  | "manual_action"
  | "automation_action"
  | "follow_up"
  | "forecast"
  | "executive_decision";

export type LearningOutcomeType =
  | "payment_received"
  | "promise_kept"
  | "promise_broken"
  | "no_response"
  | "escalated"
  | "recovered"
  | "worsened"
  | "neutral";

export const LEARNING_OUTCOME_LABELS: Record<LearningOutcomeType, string> = {
  payment_received: "Pago recibido",
  promise_kept:     "Promesa cumplida",
  promise_broken:   "Promesa incumplida",
  no_response:      "Sin respuesta",
  escalated:        "Escalado",
  recovered:        "Recuperado",
  worsened:         "Deterioro",
  neutral:          "Sin cambio",
};

export type LearningOutcome = {
  id: string;
  workspace_company_id: string;
  customer_id: string;
  source_type: LearningOutcomeSourceType;
  source_id: string;
  outcome_type: LearningOutcomeType;
  outcome_amount: number | null;
  currency_code: string | null;
  observed_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DetectedOutcome = Omit<LearningOutcome, "id" | "created_at"> & {
  dedupe_key: string;
};

// ---------------------------------------------------------------------------
// Action Effectiveness
// ---------------------------------------------------------------------------

export type ActionEffectivenessRow = {
  action_type: string;
  action_label: string;
  total_actions: number;
  payment_within_7d_count: number;
  promise_kept_count: number;
  promise_broken_count: number;
  no_response_count: number;
  recovered_count: number;
  avg_recovery_amount: number;
  avg_days_to_payment: number | null;
  effectiveness_pct: number;
  sample_size: number;
};

export type ActionEffectivenessSnapshot = {
  generated_at: string;
  total_outcomes_analyzed: number;
  by_action_type: ActionEffectivenessRow[];
  top_performing_action: string | null;
  worst_performing_action: string | null;
  insight: string;
  data_source: "outcomes" | "proxy" | "insufficient";
};

// ---------------------------------------------------------------------------
// Operator Effectiveness
// ---------------------------------------------------------------------------

export type OperatorEffectivenessRow = {
  user_id: string;
  display_name: string;
  total_cases_handled: number;
  recovered_cases: number;
  recovery_rate_pct: number;
  avg_response_hours: number | null;
  sla_compliance_pct: number;
  promise_kept_rate_pct: number;
  sample_size: number;
  insight: string | null;
};

export type OperatorEffectivenessSnapshot = {
  generated_at: string;
  total_outcomes_analyzed: number;
  by_operator: OperatorEffectivenessRow[];
  top_operator_id: string | null;
  insight: string;
  data_source: "outcomes" | "proxy" | "insufficient";
};

// ---------------------------------------------------------------------------
// Automation Effectiveness
// ---------------------------------------------------------------------------

export type AutomationNoiseLevel = "low" | "medium" | "high" | "critical";

export type AutomationRuleEffectivenessRow = {
  rule_key: string;
  rule_label: string;
  total_triggered: number;
  deduped_count: number;
  executed_count: number;
  outcomes_positive: number;
  dedupe_ratio: number;
  noise_level: AutomationNoiseLevel;
  recommendation: string;
};

export type AutomationEffectivenessSnapshot = {
  generated_at: string;
  total_rules_evaluated: number;
  noisy_rules: AutomationRuleEffectivenessRow[];
  effective_rules: AutomationRuleEffectivenessRow[];
  all_rules: AutomationRuleEffectivenessRow[];
  overall_dedupe_ratio: number;
  insight: string;
};

// ---------------------------------------------------------------------------
// Forecast Calibration
// ---------------------------------------------------------------------------

export type ForecastCalibrationDirection = "overestimated" | "underestimated" | "accurate";

export type ForecastCalibrationSegment = {
  segment: string;
  predicted_pct: number;
  actual_pct: number;
  delta_pct: number;
  direction: ForecastCalibrationDirection;
  sample_size: number;
};

export type ForecastCalibrationSnapshot = {
  generated_at: string;
  calibration_score: number;
  overestimated_segments: ForecastCalibrationSegment[];
  underestimated_segments: ForecastCalibrationSegment[];
  all_segments: ForecastCalibrationSegment[];
  recommended_weight_adjustments: string[];
  insight: string;
  data_source: "full" | "partial" | "insufficient";
};

// ---------------------------------------------------------------------------
// Strategy Recommendations
// ---------------------------------------------------------------------------

export type StrategyRecommendationCategory =
  | "action"
  | "operator"
  | "automation"
  | "forecast"
  | "portfolio";

export type StrategyRecommendationConfidence = "high" | "medium" | "low";

export type StrategyRecommendation = {
  id: string;
  category: StrategyRecommendationCategory;
  title: string;
  reason: string;
  confidence: StrategyRecommendationConfidence;
  actionable: boolean;
  evidence: string[];
};

// ---------------------------------------------------------------------------
// Strategic Learning Snapshot
// ---------------------------------------------------------------------------

export type StrategicLearningMetrics = {
  outcomes_detected: number;
  positive_outcomes: number;
  noisy_rules: number;
  calibration_score: number;
  generation_ms: number;
};

export type StrategicLearningSnapshot = {
  generated_at: string;
  outcomes_total: number;
  action_effectiveness: ActionEffectivenessSnapshot;
  operator_effectiveness: OperatorEffectivenessSnapshot;
  automation_effectiveness: AutomationEffectivenessSnapshot;
  forecast_calibration: ForecastCalibrationSnapshot;
  strategy_recommendations: StrategyRecommendation[];
  metrics: StrategicLearningMetrics;
  source_snapshot_ids: {
    bundle_loaded_at: string | null;
    analytics_generated_at: string | null;
    predictive_generated_at: string | null;
  };
};

export type StrategicLearningBundle = StrategicLearningSnapshot & {
  cached: boolean;
  expires_at: string | null;
};

// ---------------------------------------------------------------------------
// Context for engines
// ---------------------------------------------------------------------------

export type StrategicLearningContext = {
  bundle: DecisionEngineDataBundle;
  analytics: OperationalAnalyticsSnapshot | null;
  automationRuns: AutomationRunRow[];
  automationActions: AutomationActionRow[];
  predictive: PredictiveSnapshot | null;
  existingOutcomes: LearningOutcome[];
  loadedAt: string;
};
