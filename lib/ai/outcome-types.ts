/** Fila persistida en `outcomes` (Supabase). */
export type OutcomeRow = {
  id: string;
  action_id: string;
  initiative_id: string;
  outcome_type: string;
  outcome_category: string;
  revenue_amount: number | null;
  notes: string | null;
  after_note: string | null;
  created_at: string;
};

export const OUTCOME_TYPES = [
  "no_response",
  "response",
  "meeting",
  "sale",
] as const;

export type OutcomeTypeValue = (typeof OUTCOME_TYPES)[number];
