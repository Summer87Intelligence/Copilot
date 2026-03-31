/**
 * Decision Engine — genera decisiones automáticas a partir de iniciativas.
 */

export type InitiativeForDecision = {
  id: string;
  company_name: string;
  trigger: string;
  score: number;
};

export type GeneratedDecisionPayload = {
  initiative_id: string;
  decision_type: string;
  recommended_channel: string;
  priority_rank: number;
  confidence_score: number;
  suggested_message: string;
};

const MAX_MSG = 280;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function mapScoreToDecision(score: number): Omit<
  GeneratedDecisionPayload,
  "initiative_id" | "suggested_message"
> {
  if (score > 80) {
    return {
      decision_type: "high_priority_outreach",
      recommended_channel: "whatsapp",
      priority_rank: 1,
      confidence_score: 0.9,
    };
  }
  if (score >= 60 && score <= 80) {
    return {
      decision_type: "linkedin_contact",
      recommended_channel: "linkedin",
      priority_rank: 2,
      confidence_score: 0.75,
    };
  }
  return {
    decision_type: "low_priority_nurture",
    recommended_channel: "email",
    priority_rank: 3,
    confidence_score: 0.6,
  };
}

function buildSuggestedMessage(companyName: string, trigger: string): string {
  const base = `Seguimiento sugerido para ${companyName}. Contexto: ${trigger}`;
  return truncate(base, MAX_MSG);
}

/**
 * Genera un payload de decisión por iniciativa (sin persistir).
 */
export function generateDecisionsForInitiatives(
  initiatives: InitiativeForDecision[]
): GeneratedDecisionPayload[] {
  return initiatives.map((i) => {
    const mapped = mapScoreToDecision(Number(i.score));
    return {
      initiative_id: i.id,
      ...mapped,
      suggested_message: buildSuggestedMessage(i.company_name, i.trigger),
    };
  });
}
