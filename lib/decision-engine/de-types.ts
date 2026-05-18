/**
 * Decision Engine — tipos compartidos.
 * Puro: sin imports de DB, sin side effects.
 */

// ---------------------------------------------------------------------------
// Tipos base del motor
// ---------------------------------------------------------------------------

export type DecisionBand = "saludable" | "atencion" | "riesgo_moderado" | "critico";

export const DECISION_BAND_LABELS: Record<DecisionBand, string> = {
  saludable:        "Saludable",
  atencion:         "Requiere atención",
  riesgo_moderado:  "Riesgo moderado",
  critico:          "Crítico",
};

export type AgingBucket = "not_due" | "0-30" | "31-60" | "61-90" | "90+";

export type ClientInstruction =
  | "llamar_hoy"
  | "escalar"
  | "recordatorio"
  | "seguimiento"
  | "monitorear"
  | "esperar_promesa";

export const CLIENT_INSTRUCTION_LABELS: Record<ClientInstruction, string> = {
  llamar_hoy:      "Llamar hoy",
  escalar:         "Escalar",
  recordatorio:    "Enviar recordatorio",
  seguimiento:     "Seguimiento esta semana",
  monitorear:      "Monitorear",
  esperar_promesa: "Esperar fecha prometida",
};

// ---------------------------------------------------------------------------
// Bundle de datos crudos (salida del data loader)
// ---------------------------------------------------------------------------

export type DEPendingInvoice = {
  id: string;
  company_id: string;
  currency_code: string;
  total_amount: number;
  balance_amount: number;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
};

export type DERecentInvoice = {
  id: string;
  company_id: string;
  currency_code: string;
  total_amount: number;
  issue_date: string;
};

export type DERecentReceipt = {
  id: string;
  company_id: string | null;
  currency_code: string;
  amount: number;
  receipt_date: string;
};

export type DECompany = {
  id: string;
  name: string;
};

export type DECollectionAction = {
  id: string;
  company_id: string;
  action_type: string;
  status: string;
  priority: string;
  notes: string | null;
  promise_date: string | null;
  promise_amount: number | null;
  promise_currency: string | null;
  contact_date: string | null;
  created_at: string;
};

export type DecisionEngineDataBundle = {
  pendingInvoices: DEPendingInvoice[];
  recentInvoices: DERecentInvoice[];
  recentReceipts: DERecentReceipt[];
  companies: DECompany[];
  recentActions: DECollectionAction[];
  loadedAt: string;
};

// ---------------------------------------------------------------------------
// Portfolio Score
// ---------------------------------------------------------------------------

export type PortfolioScore = {
  score: number;
  band: DecisionBand;
  band_label: string;
  effectiveness_score: number;
  aging_score: number;
  concentration_score: number;
  total_pending_uyu: number;
  total_pending_usd: number;
  active_debtors_count: number;
  effectiveness_pct: number;
  over90_pct: number;
};

// ---------------------------------------------------------------------------
// Client Ranking
// ---------------------------------------------------------------------------

export type SimpleEvidence = {
  label: string;
  value: string;
  is_decisive: boolean;
};

export type RankedClient = {
  company_id: string;
  company_name: string;
  currency_code: string;
  pending_amount: number;
  invoice_count: number;
  oldest_days: number;
  dominant_bucket: AgingBucket;
  score: number;
  instruction: ClientInstruction;
  instruction_label: string;
  reason: string;
  evidence: SimpleEvidence[];
  collection_status: string | null;
  last_action_date: string | null;
  has_active_promise: boolean;
  promise_date: string | null;
  promise_amount: number | null;
  promise_currency: string | null;
  concentration_pct: number;
  risk_assessment: RiskAssessment;
  recommendation: ActionRecommendation;
};

// ---------------------------------------------------------------------------
// Alertas del briefing
// ---------------------------------------------------------------------------

export type BriefingAlert = {
  id: string;
  severity: "high" | "medium";
  title: string;
  description: string;
  currency_code?: string;
};

// ---------------------------------------------------------------------------
// Daily Briefing
// ---------------------------------------------------------------------------

export type DailyBriefing = {
  generated_at: string;
  portfolio_score: PortfolioScore;
  urgent: RankedClient[];
  important: RankedClient[];
  alerts: BriefingAlert[];
  total_pending_uyu: number;
  total_pending_usd: number;
  total_debtors: number;
};

// ---------------------------------------------------------------------------
// Phase 1B — Risk Assessment & Action Recommendations
// ---------------------------------------------------------------------------

export type RecommendedAction =
  | "send_reminder"
  | "manual_call"
  | "escalate"
  | "payment_plan"
  | "hold_credit"
  | "monitor"
  | "no_action";

export const RECOMMENDED_ACTION_LABELS: Record<RecommendedAction, string> = {
  send_reminder: "Enviar recordatorio",
  manual_call:   "Llamar directamente",
  escalate:      "Escalar",
  payment_plan:  "Proponer plan de pago",
  hold_credit:   "Retener crédito",
  monitor:       "Monitorear",
  no_action:     "Sin acción requerida",
};

export type RecommendedChannel = "whatsapp" | "email" | "phone" | "internal";

export const RECOMMENDED_CHANNEL_LABELS: Record<RecommendedChannel, string> = {
  whatsapp: "WhatsApp",
  email:    "Email",
  phone:    "Teléfono",
  internal: "Interno",
};

export type UrgencyLevel = "critical" | "high" | "medium" | "low";

export const URGENCY_LEVEL_LABELS: Record<UrgencyLevel, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Medio",
  low:      "Bajo",
};

export type RiskLevel = "critical" | "high" | "medium" | "low";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  critical: "Riesgo crítico",
  high:     "Riesgo alto",
  medium:   "Riesgo medio",
  low:      "Riesgo bajo",
};

export type RiskAssessment = {
  score: number;
  level: RiskLevel;
  aging_component: number;
  concentration_component: number;
  behavior_component: number;
  contact_component: number;
};

export type ActionRecommendation = {
  action: RecommendedAction;
  channel: RecommendedChannel | null;
  urgency: UrgencyLevel;
  rationale: string[];
  confidence: number;
  next_suggested_at: string | null;
};

export type RiskScoringInput = {
  oldest_days: number;
  dominant_bucket: AgingBucket;
  concentration_pct: number;
  has_active_promise: boolean;
  has_broken_promise: boolean;
  days_since_contact: number | null;
  invoice_count: number;
};

export type RecommendationInput = {
  risk_assessment: RiskAssessment;
  oldest_days: number;
  dominant_bucket: AgingBucket;
  has_active_promise: boolean;
  has_broken_promise: boolean;
  has_escalation: boolean;
  days_since_contact: number | null;
  instruction: ClientInstruction;
};

export type DEActionTimeline = {
  id: string;
  company_id: string;
  action_type: string;
  channel: string | null;
  summary: string | null;
  outcome: string | null;
  created_by: string | null;
  created_at: string;
  next_follow_up_at: string | null;
};
