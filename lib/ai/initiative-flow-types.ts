import type { ActionPayloadJson } from "@/lib/ai/action-types";

export type InitiativeFlowStatus =
  | "new"
  | "decision_generated"
  | "action_pending"
  | "executed"
  | "with_outcome"
  | "closed_no_response";

export type InitiativeFlowItem = {
  initiative: {
    id: string;
    company_name: string;
    source: string;
    trigger: string;
    score: number;
    status: string;
    created_at: string;
    processing_stage: string | null;
  };
  decision: {
    id: string;
    decision_type: string;
    recommended_channel: string;
    priority_rank: number;
    confidence_score: number;
    suggested_message: string;
    created_at: string;
  } | null;
  action: {
    id: string;
    decision_id: string;
    action_type: string;
    channel: string;
    execution_status: string;
    action_payload: ActionPayloadJson;
    created_at: string;
  } | null;
  outcome: {
    id: string;
    action_id: string;
    outcome_type: string;
    outcome_category: string;
    revenue_amount: number | null;
    notes: string | null;
    created_at: string;
  } | null;
  flow_status: InitiativeFlowStatus;
  flow_status_label: string;
};
