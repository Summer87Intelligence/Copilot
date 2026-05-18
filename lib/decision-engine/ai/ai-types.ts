/**
 * Phase 5A — tipos de la capa de interpretación operacional (determinística, sin LLM).
 */

import type {
  ClientOperationalHydrationRecord,
  ClientOperationalSummary,
  DailyOperationsQueue,
  OperationalAnalyticsSnapshot,
  AutomationActionRow,
  AutomationRunRow,
  OperationalOwnershipStats,
  OperationalTask,
} from "@/lib/decision-engine/de-types";

export type AIInsightSeverity = "low" | "medium" | "high" | "critical";

export type AIOperationalPriority = {
  rank: number;
  customer_id: string;
  customer_name: string;
  label: string;
  reason: string;
};

export type AIOperationalBriefing = {
  summary: string;
  key_points: string[];
  operational_priorities: AIOperationalPriority[];
  emerging_risks: string[];
  workload_warnings: string[];
};

export type AIRiskNarrativeInput = {
  customer_id: string;
  customer_name: string;
  machine_state: string | null;
  risk_level: string;
  oldest_days: number;
  concentration_percent: number | null;
  sla_breached: boolean;
  breached_sla: boolean;
  assignee_display_name: string | null;
  is_unassigned: boolean;
  last_contact_days: number | null;
  pending_amount: number;
  currency_code: string;
  reasons: string[];
};

export type AIRiskNarrative = {
  narrative: string;
  top_risk_factors: string[];
  urgency_reason: string;
  recommended_focus: string;
};

export type OperatorInsightKind =
  | "overloaded"
  | "slow_response"
  | "sla_below_avg"
  | "high_critical_load"
  | "low_throughput";

export type OperatorInsight = {
  user_id: string;
  display_name: string;
  kind: OperatorInsightKind;
  severity: AIInsightSeverity;
  message: string;
  metrics: Record<string, number | string | null>;
};

export type OperationalAnomalyKind =
  | "backlog_spike"
  | "sla_spike"
  | "critical_growth"
  | "inactive_operator"
  | "follow_up_abandonment"
  | "concentration_surge"
  | "unassigned_critical";

export type OperationalAnomaly = {
  id: string;
  kind: OperationalAnomalyKind;
  severity: AIInsightSeverity;
  title: string;
  description: string;
  customer_id: string | null;
};

export type AIPriorityExplanation = {
  explanation: string;
  contributing_factors: string[];
  expected_outcome: string;
};

export type AIPriorityExplainerInput = {
  summary: ClientOperationalSummary;
  hydration?: ClientOperationalHydrationRecord | null;
};

export type AIIntelligenceContext = {
  analytics: OperationalAnalyticsSnapshot | null;
  queue: DailyOperationsQueue | null;
  ownership: OperationalOwnershipStats | null;
  automation_runs: AutomationRunRow[];
  automation_actions: AutomationActionRow[];
  client_summaries: ClientOperationalSummary[];
  loaded_at: string;
};

export type AIOperationalIntelligencePayload = {
  generated_at: string;
  briefing: AIOperationalBriefing;
  anomalies: OperationalAnomaly[];
  operator_insights: OperatorInsight[];
  metrics: {
    anomalies_detected: number;
    critical_insights: number;
    workload_alerts: number;
    generation_ms: number;
  };
  source_snapshot_ids: {
    analytics_generated_at: string | null;
    queue_generated_at: string | null;
  };
};

export type AIIntelligenceBundle = AIOperationalIntelligencePayload & {
  cached: boolean;
  expires_at: string | null;
};

export type AIRiskSummaryResponse = {
  customer_id: string;
  customer_name: string;
  narrative: AIRiskNarrative;
  priority: AIPriorityExplanation | null;
  task: OperationalTask | null;
};
