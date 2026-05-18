/**
 * UI adapters — OperationalTask ↔ RankedClient / acciones de cobranza.
 */

import type { CollectionActionType, CollectionStatus } from "@/lib/copilot-collection-types";
import type {
  ActionRecommendation,
  FollowUpResult,
  OperationalTask,
  RankedClient,
  RiskAssessment,
  TaskCategory,
} from "@/lib/decision-engine/de-types";
import { FALLBACK_FOLLOW_UP_RESULT } from "@/lib/decision-engine/de-types";
import { machineStateToFollowUpState } from "@/lib/decision-engine/operational-state-bridge";

const FALLBACK_RISK: RiskAssessment = {
  score: 0,
  level: "low",
  aging_component: 0,
  concentration_component: 0,
  behavior_component: 0,
  contact_component: 0,
};

const FALLBACK_RECOMMENDATION: ActionRecommendation = {
  action: "monitor",
  channel: "phone",
  urgency: "medium",
  rationale: [],
  confidence: 50,
  next_suggested_at: null,
};

export function defaultActionForCategory(
  category: TaskCategory
): { actionType: CollectionActionType; status: CollectionStatus; notes: string } {
  switch (category) {
    case "call_today":
    case "stale_contact":
      return { actionType: "call", status: "contacted", notes: "" };
    case "promise_follow_up":
      return { actionType: "payment_promise", status: "promised_payment", notes: "" };
    case "escalation_review":
      return { actionType: "escalation", status: "escalated", notes: "" };
    case "legal_review":
      return { actionType: "dispute", status: "disputed", notes: "" };
    case "payment_confirmation":
      return { actionType: "internal_note", status: "paid", notes: "" };
    default:
      return { actionType: "internal_note", status: "pending_review", notes: "" };
  }
}

export function rankedClientFromOperationalTask(task: OperationalTask): RankedClient {
  const legacyState = machineStateToFollowUpState(task.machine_state);
  const follow_up_result: FollowUpResult = {
    ...FALLBACK_FOLLOW_UP_RESULT,
    operational_state: legacyState,
    pending_action: task.action_label,
    follow_up_reason: task.reason,
    next_follow_up_at: task.due_at,
  };

  return {
    company_id: task.customer_id,
    company_name: task.company_name,
    currency_code: task.currency_code,
    pending_amount: task.pending_amount,
    invoice_count: 1,
    oldest_days: task.oldest_days,
    dominant_bucket: task.oldest_days > 90 ? "90+" : task.oldest_days > 60 ? "61-90" : "0-30",
    score: task.priority_score,
    instruction: "seguimiento",
    instruction_label: "Seguimiento",
    reason: task.reason,
    evidence: [],
    collection_status: null,
    last_action_date: null,
    has_active_promise: task.category === "promise_follow_up",
    promise_date: task.due_at,
    promise_amount: null,
    promise_currency: null,
    concentration_pct: task.category === "high_concentration" ? 45 : 0,
    risk_assessment: { ...FALLBACK_RISK, score: task.priority_score, level: task.risk_level },
    recommendation: {
      ...FALLBACK_RECOMMENDATION,
      action: task.category === "call_today" ? "manual_call" : "monitor",
      urgency: task.priority === "critical" ? "critical" : task.priority === "high" ? "high" : "medium",
      confidence: task.priority_score,
    },
    follow_up_result,
  };
}
