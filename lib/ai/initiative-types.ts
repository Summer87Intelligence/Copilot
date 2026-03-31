/** Fila persistida en `initiatives` (Supabase). */
export type InitiativeRow = {
  id: string;
  company_name: string;
  source: string;
  trigger: string;
  score: number;
  status: string;
  created_at: string;
  /** Pipeline: `new` → `decision_made` (u otros estados futuros). */
  processing_stage?: string | null;
};
