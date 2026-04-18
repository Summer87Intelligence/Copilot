/** Fila persistida en `actions` (Supabase). */
export type ActionPayloadJson = {
  suggested_message: string;
};

/** Outcome único por acción (JOIN en GET /api/copilot/actions). */
export type ActionOutcomeSummary = {
  id: string;
  outcome_type: string;
  revenue_amount: number | null;
  notes: string | null;
  after_note: string | null;
  created_at: string;
};

export type ActionRow = {
  id: string;
  decision_id: string;
  initiative_id: string;
  action_type: string;
  channel: string;
  execution_status: string;
  action_payload: ActionPayloadJson;
  created_at: string;
  assignee_name: string | null;
  expected_result: string | null;
  before_note: string | null;
  updated_at: string;
  outcome: ActionOutcomeSummary | null;
};

/** Respuesta enriquecida para UI (GET). */
export type ActionListItem = ActionRow & {
  company_name: string | null;
};
