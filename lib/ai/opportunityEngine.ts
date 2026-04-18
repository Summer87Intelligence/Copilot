/**
 * @deprecated El motor mock de oportunidades está desactivado.
 * Los insights operativos se generan con `computeCopilotRealInsights` en `lib/copilot-real-insights.ts`.
 */

export type OpportunityInitiative = {
  company_name: string;
  source: string;
  trigger: string;
  score: number;
  status: string;
};

/** Siempre vacío: no insertar filas ficticias en `initiatives`. */
export function generateMockOpportunities(): OpportunityInitiative[] {
  return [];
}
