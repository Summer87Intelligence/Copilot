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
  operationalStates: DEOperationalStateRow[];
  pendingFollowUps: DEFollowUpRow[];
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
  follow_up_result: FollowUpResult;
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
  follow_up_queue: FollowUpQueueItem[];
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

// ---------------------------------------------------------------------------
// Phase 1C — Follow-up Engine + Action Impact Engine
// ---------------------------------------------------------------------------

export type SlaStatus =
  | "critical"
  | "overdue"
  | "due_today"
  | "due_soon"
  | "ok"
  | "no_contact";

export const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  critical:   "SLA crítico",
  overdue:    "Vencido",
  due_today:  "Vence hoy",
  due_soon:   "Próximo",
  ok:         "Al día",
  no_contact: "Sin contacto",
};

export const SLA_STATUS_COLORS: Record<SlaStatus, string> = {
  critical:   "bg-rose-100 text-rose-800 border border-rose-300",
  overdue:    "bg-rose-50 text-rose-700 border border-rose-200",
  due_today:  "bg-amber-50 text-amber-700 border border-amber-200",
  due_soon:   "bg-blue-50 text-blue-700 border border-blue-200",
  ok:         "bg-emerald-50 text-emerald-700 border border-emerald-200",
  no_contact: "bg-slate-50 text-slate-600 border border-slate-200",
};

export type FollowUpState =
  | "awaiting_promise"
  | "retry_call"
  | "retry_email"
  | "payment_cleared"
  | "escalated_active"
  | "overdue_no_contact"
  | "monitor";

export const FOLLOW_UP_STATE_LABELS: Record<FollowUpState, string> = {
  awaiting_promise:   "Esperando pago prometido",
  retry_call:         "Reintentar llamada",
  retry_email:        "Reintentar email",
  payment_cleared:    "Pago confirmado",
  escalated_active:   "Escalación activa",
  overdue_no_contact: "Sin contacto — vencido",
  monitor:            "Monitorear",
};

export type FollowUpResult = {
  next_follow_up_at: string | null;
  sla_status: SlaStatus;
  pending_action: string;
  snoozed_until: string | null;
  follow_up_reason: string;
  operational_state: FollowUpState;
};

export const FALLBACK_FOLLOW_UP_RESULT: FollowUpResult = {
  next_follow_up_at: null,
  sla_status:        "ok",
  pending_action:    "Revisar",
  snoozed_until:     null,
  follow_up_reason:  "Sin datos de seguimiento calculados.",
  operational_state: "monitor",
};

export type FollowUpInput = {
  last_action_type: string | null;
  last_action_date: string | null;
  last_action_status: string | null;
  promise_date: string | null;
  has_active_promise: boolean;
  has_broken_promise: boolean;
  has_escalation: boolean;
  oldest_days: number;
  risk_score: number;
  days_since_contact: number | null;
};

export type ActionImpactInput = {
  action_type: string;
  action_status: string;
  current_risk_score: number;
  has_active_promise: boolean;
  has_broken_promise: boolean;
  has_escalation: boolean;
  ignored_call_count: number;
};

export type ActionImpact = {
  risk_delta: number;
  urgency_delta: number;
  recommendation_override: RecommendedAction | null;
  snooze_hours: number;
  requires_follow_up: boolean;
  operational_state: FollowUpState;
};

export type FollowUpQueueItem = {
  company_id: string;
  company_name: string;
  currency_code: string;
  pending_amount: number;
  oldest_days: number;
  risk_level: RiskLevel;
  risk_score: number;
  follow_up_result: FollowUpResult;
  recommendation: ActionRecommendation;
  collection_status: string | null;
  last_action_date: string | null;
  promise_date: string | null;
};

// ---------------------------------------------------------------------------
// Phase 1D — DB row types + helpers
// ---------------------------------------------------------------------------

export type DEOperationalStateRow = {
  customer_id: string;
  current_risk: RiskLevel;
  operational_state: FollowUpState;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  active_promise: boolean;
  escalated: boolean;
  updated_at: string;
};

export type DEFollowUpRow = {
  id: string;
  customer_id: string;
  status: "pending" | "in_progress" | "completed" | "snoozed" | "cancelled";
  scheduled_for: string;
  reason: string | null;
  source_action_id: string | null;
  priority: "low" | "medium" | "high" | "critical";
};

export const RISK_LEVEL_SCORES: Record<RiskLevel, number> = {
  critical: 80,
  high:     60,
  medium:   35,
  low:      10,
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export type DEActionOperationalPayload = {
  operational_state: DEOperationalStateRow;
  follow_up: DEFollowUpRow | null;
  action_impact: ActionImpact;
  follow_up_result: FollowUpResult;
};
