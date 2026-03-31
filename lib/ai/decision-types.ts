/** Fila persistida en `decisions` (Supabase). */
export type DecisionRow = {
  id: string;
  initiative_id: string;
  decision_type: string;
  recommended_channel: string;
  priority_rank: number;
  confidence_score: number;
  suggested_message: string;
  created_at: string;
};
