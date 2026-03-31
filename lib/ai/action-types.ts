/** Fila persistida en `actions` (Supabase). */
export type ActionPayloadJson = {
  suggested_message: string;
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
};

/** Respuesta enriquecida para UI (GET). */
export type ActionListItem = ActionRow & {
  company_name: string | null;
};
