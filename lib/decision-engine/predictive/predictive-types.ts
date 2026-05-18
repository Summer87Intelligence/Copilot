/**
 * Phase 5B — tipos de inteligencia predictiva (determinística, sin ML/LLM).
 */

import type {
  ClientOperationalHydrationRecord,
  ClientOperationalSummary,
  DailyOperationsQueue,
  DECollectionAction,
  DEFollowUpRow,
  DERecentReceipt,
  OperationalAnalyticsSnapshot,
  OperationalOwnershipStats,
} from "@/lib/decision-engine/de-types";

export type RecoveryLikelihoodBand = "high" | "medium" | "low" | "very_low";

export type DeteriorationBand = "stable" | "watch" | "deteriorating" | "severe";

export type SLAStressBand = "normal" | "elevated" | "high" | "critical";

export type RecoveryLikelihoodInput = {
  customer_id: string;
  customer_name: string;
  oldest_days: number;
  pending_amount: number;
  currency_code: string;
  machine_state: string | null;
  breached_sla: boolean;
  last_action_at: string | null;
  last_contact_days: number | null;
  has_active_promise: boolean;
  promise_overdue: boolean;
  is_unassigned: boolean;
  has_recent_partial_payment: boolean;
  category: string;
  risk_level: string;
  recent_payment_count_30d: number;
};

export type RecoveryLikelihood = {
  customer_id: string;
  customer_name: string;
  probability_pct: number;
  band: RecoveryLikelihoodBand;
  confidence_pct: number;
  main_drivers: string[];
  negative_drivers: string[];
  recommended_recovery_strategy: string;
  expected_recovery_window_days: string;
};

export type PortfolioDeteriorationForecast = {
  horizon_days: number;
  projected_risk_delta_pct: number;
  projected_overdue_amount: number;
  projected_critical_cases: number;
  deterioration_band: DeteriorationBand;
  drivers: string[];
  recommended_countermeasures: string[];
};

export type SLAStressForecast = {
  horizon_days: number;
  projected_sla_breaches: number;
  stress_band: SLAStressBand;
  drivers: string[];
  operators_at_risk: string[];
  recommended_actions: string[];
};

export type OperatorLoadForecast = {
  user_id: string;
  display_name: string;
  projected_load_score: number;
  projected_band: "normal" | "elevated" | "overloaded" | "critical";
  overload_probability_pct: number;
  projected_critical_cases: number;
  drivers: string[];
  recommendations: string[];
};

export type RecoveryOpportunityType =
  | "quick_win"
  | "high_amount_medium_risk"
  | "promise_near_term"
  | "partial_payment_residual"
  | "assigned_recent_contact";

export type RecoveryOpportunity = {
  customer_id: string;
  customer_name: string;
  opportunity_type: RecoveryOpportunityType;
  recovery_amount: number;
  confidence_pct: number;
  reason: string;
  recommended_action: string;
  urgency: "low" | "medium" | "high" | "critical";
};

export type PredictiveSnapshotMetrics = {
  predicted_critical_cases: number;
  projected_sla_breaches_7d: number;
  recovery_opportunities_count: number;
  avg_recovery_likelihood_pct: number;
  generation_ms: number;
};

export type PredictiveSnapshot = {
  generated_at: string;
  recovery_likelihoods: RecoveryLikelihood[];
  portfolio_forecasts: PortfolioDeteriorationForecast[];
  sla_forecasts: SLAStressForecast[];
  operator_load_forecasts: OperatorLoadForecast[];
  recovery_opportunities: RecoveryOpportunity[];
  executive_prediction_summary: string;
  metrics: PredictiveSnapshotMetrics;
  source_snapshot_ids: {
    analytics_generated_at: string | null;
    queue_generated_at: string | null;
  };
};

export type PredictiveBundle = PredictiveSnapshot & {
  cached: boolean;
  expires_at: string | null;
};

export type PredictiveContext = {
  analytics: OperationalAnalyticsSnapshot | null;
  queue: DailyOperationsQueue | null;
  ownership: OperationalOwnershipStats | null;
  client_summaries: ClientOperationalSummary[];
  hydration_by_customer: Record<string, ClientOperationalHydrationRecord>;
  recent_actions_by_customer: Map<string, DECollectionAction[]>;
  follow_ups_by_customer: Map<string, DEFollowUpRow>;
  recent_receipts_by_customer: Map<string, DERecentReceipt[]>;
  loaded_at: string;
};
