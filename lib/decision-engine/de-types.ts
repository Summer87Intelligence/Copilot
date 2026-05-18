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
// Phase 2A — Operational state machine
// ---------------------------------------------------------------------------

export type OperationalMachineState =
  | "new_risk"
  | "monitoring"
  | "follow_up"
  | "payment_promised"
  | "escalated"
  | "critical"
  | "recovered"
  | "paused"
  | "legal_review";

export const OPERATIONAL_MACHINE_STATE_LABELS: Record<OperationalMachineState, string> = {
  new_risk:         "Riesgo nuevo",
  monitoring:       "Monitoreo",
  follow_up:        "Seguimiento activo",
  payment_promised: "Promesa de pago",
  escalated:        "Escalado",
  critical:         "Crítico",
  recovered:        "Recuperado",
  paused:           "Pausado",
  legal_review:     "Revisión legal",
};

export type OperationalTransitionSeverity = "low" | "medium" | "high" | "critical";

export type PaymentEventKind = "none" | "partial" | "full";

export type StateTransitionInput = {
  current_state: OperationalMachineState | null;
  transitioned_at: string | null;
  action_type: string | null;
  action_status: string | null;
  risk_delta: number;
  risk_score: number;
  has_active_promise: boolean;
  has_broken_promise: boolean;
  has_escalation: boolean;
  oldest_days: number;
  days_since_contact: number | null;
  pending_balance: number;
  dominant_bucket: AgingBucket;
  payment_event: PaymentEventKind;
  is_paused: boolean;
  is_legal_review: boolean;
  sla_breached: boolean;
  sla_severity: OperationalTransitionSeverity;
  now?: Date;
};

export type StateTransitionResult = {
  next_state: OperationalMachineState;
  reason: string;
  severity: OperationalTransitionSeverity;
  transitioned: boolean;
  breached_sla: boolean;
};

export type OperationalSlaSeverity = OperationalTransitionSeverity;

export type OperationalSlaEvaluation = {
  breached: boolean;
  days_in_state: number;
  max_days: number | null;
  severity: OperationalSlaSeverity;
  priority_boost_steps: number;
  suggested_risk: RiskLevel;
  reason: string;
};

// ---------------------------------------------------------------------------
// Phase 1D — DB row types + helpers
// ---------------------------------------------------------------------------

export type DEOperationalStateRow = {
  customer_id: string;
  current_risk: RiskLevel;
  /** Estado formal Phase 2A (columna operational_state en DB). */
  machine_state: OperationalMachineState;
  /** Derivado para compatibilidad con follow-up engine Phase 1C. */
  legacy_follow_up_state: FollowUpState;
  previous_state: OperationalMachineState | null;
  transitioned_at: string | null;
  transition_reason: string | null;
  breached_sla: boolean;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  active_promise: boolean;
  escalated: boolean;
  updated_at: string;
  assigned_user_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  assignment_note: string | null;
};

export type OperationalOwnershipOperatorStats = {
  user_id: string;
  display_name: string;
  total_assigned: number;
  critical_assigned: number;
  overdue_assigned: number;
};

export type OperationalOwnershipStats = {
  total_assigned: number;
  overdue_assigned: number;
  unassigned_critical: number;
  high_workload: boolean;
  operators: OperationalOwnershipOperatorStats[];
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
  state_transition: StateTransitionResult;
  sla_evaluation: OperationalSlaEvaluation;
};

// ---------------------------------------------------------------------------
// Phase 2B — Daily Operations Queue
// ---------------------------------------------------------------------------

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskCategory =
  | "call_today"
  | "promise_follow_up"
  | "escalation_review"
  | "legal_review"
  | "payment_confirmation"
  | "stale_contact"
  | "high_concentration"
  | "recovery_watch";

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  call_today:            "Llamar hoy",
  promise_follow_up:     "Seguimiento de promesa",
  escalation_review:     "Revisar escalación",
  legal_review:          "Revisión legal",
  payment_confirmation:  "Confirmar pago",
  stale_contact:         "Contacto estancado",
  high_concentration:    "Alta concentración",
  recovery_watch:        "Monitoreo post-recuperación",
};

export type TaskImpact = "critical" | "high" | "medium" | "low";

export type TaskSource =
  | "state_machine"
  | "sla_engine"
  | "risk_ranker"
  | "portfolio"
  | "follow_up"
  | "automated";

export type QueueSection =
  | "urgent_today"
  | "high_impact"
  | "this_week"
  | "monitoring"
  | "automated";

export const QUEUE_SECTION_LABELS: Record<QueueSection, string> = {
  urgent_today:  "Urgente hoy",
  high_impact:   "Alto impacto",
  this_week:     "Esta semana",
  monitoring:    "Monitoreo",
  automated:     "Automatizado",
};

export type OperationalTask = {
  id: string;
  customer_id: string;
  company_name: string;
  section: QueueSection;
  category: TaskCategory;
  priority: TaskPriority;
  impact: TaskImpact;
  source: TaskSource;
  title: string;
  action_label: string;
  reason: string;
  priority_score: number;
  currency_code: string;
  pending_amount: number;
  oldest_days: number;
  risk_level: RiskLevel;
  machine_state: OperationalMachineState;
  breached_sla: boolean;
  group_key: string | null;
  group_label: string | null;
  due_at: string | null;
};

export type QueueGroupKind =
  | "risk_band"
  | "promise_due_today"
  | "critical_concentration";

export type QueueGroup = {
  key: string;
  label: string;
  kind: QueueGroupKind;
  task_ids: string[];
};

export type DailyOperationsQueueStats = {
  total_tasks: number;
  urgent_count: number;
  sla_breach_count: number;
  promises_due_today: number;
  by_section: Record<QueueSection, number>;
  by_category: Partial<Record<TaskCategory, number>>;
};

export type DailyOperationsQueue = {
  generated_at: string;
  sections: Record<QueueSection, OperationalTask[]>;
  groups: QueueGroup[];
  stats: DailyOperationsQueueStats;
};

export type DailyOperationsQueueInput = {
  bundle: DecisionEngineDataBundle;
  ranked: RankedClient[];
  portfolio_score: PortfolioScore;
  now?: Date;
};

// ---------------------------------------------------------------------------
// Phase 3A — Client-centric operational queue (view-model)
// ---------------------------------------------------------------------------

export type ExpectedImpactRiskReduction = "low" | "medium" | "high";

export type ClientOperationalExpectedImpact = {
  recovery_amount: number;
  risk_reduction: ExpectedImpactRiskReduction;
  concentration_reduction: number | null;
};

export type ClientOperationalSummary = {
  customer_id: string;
  customer_name: string;
  highest_priority: TaskPriority;
  machine_state: OperationalMachineState | null;
  risk_level: RiskLevel;
  primary_action: OperationalTask;
  secondary_actions: OperationalTask[];
  reasons: string[];
  total_pending_amount: number;
  pending_currency_breakdown: {
    uyu: number;
    usd: number;
  };
  concentration_percent: number | null;
  expected_impact: ClientOperationalExpectedImpact;
  sla_breached: boolean;
  actionable_now: boolean;
  tasks_count: number;
  generated_from: TaskSource[];
};

// ---------------------------------------------------------------------------
// Phase 3C — Operational hydration (API + UI view-model)
// ---------------------------------------------------------------------------

export type ClientOperationalTimelinePreviewItem = {
  id: string;
  at: string;
  action_type: string;
  summary: string;
};

/** Payload por cliente en GET daily-queue (no persiste en snapshot). */
export type ClientOperationalHydrationRecord = {
  customer_id: string;
  machine_state: OperationalMachineState | null;
  previous_state: OperationalMachineState | null;
  transitioned_at: string | null;
  transition_reason: string | null;
  breached_sla: boolean;
  next_follow_up_at: string | null;
  pending_follow_up_id: string | null;
  pending_follow_up_reason: string | null;
  last_action_at: string | null;
  last_action_type: string | null;
  last_action_summary: string | null;
  timeline_preview: ClientOperationalTimelinePreviewItem[];
  assigned_user_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  assignment_note: string | null;
  assignee_display_name: string | null;
};

export type ClientOperationalOwnershipHydrated = {
  assigned_user_id: string | null;
  assigned_at: string | null;
  assignee_display_name: string;
  assignment_note: string | null;
  is_mine: boolean;
  is_unassigned: boolean;
  ownership_overdue: boolean;
  assigned_duration_label: string | null;
  ownership_status_label: string;
};

export type ClientOperationalLiveStateHydrated = {
  last_action_label: string | null;
  next_follow_up_label: string | null;
  state_label: string;
  sla_label: string;
  assignee_label: string;
  transitioned_at: string | null;
  transition_reason: string | null;
};

export type ClientOperationalLiveSlaHydrated = {
  breached: boolean;
  label: string;
  next_follow_up_at: string | null;
};

export type ClientOperationalLiveFollowUpHydrated = {
  id: string | null;
  scheduled_for: string | null;
  reason: string | null;
};

export type ClientOperationalSummaryHydrated = ClientOperationalSummary & {
  live_state: ClientOperationalLiveStateHydrated;
  live_sla: ClientOperationalLiveSlaHydrated;
  live_follow_up: ClientOperationalLiveFollowUpHydrated;
  live_timeline: ClientOperationalTimelinePreviewItem[];
  live_ownership: ClientOperationalOwnershipHydrated;
  hydration_source: "db" | "fallback";
};

// ---------------------------------------------------------------------------
// Phase 4B — Operator Analytics & SLA Dashboard
// ---------------------------------------------------------------------------

export type WorkloadBand = "normal" | "elevated" | "overloaded" | "critical";

export const WORKLOAD_BAND_LABELS: Record<WorkloadBand, string> = {
  normal:     "NORMAL",
  elevated:   "ELEVADA",
  overloaded: "SOBRECARGA",
  critical:   "CRÍTICA",
};

export type OperationalAnalyticsGlobal = {
  active_cases: number;
  unassigned_cases: number;
  breached_sla_cases: number;
  avg_time_to_first_action_hours: number | null;
  avg_resolution_time_hours: number | null;
  critical_open: number;
  recovered_today: number;
  followups_due_today: number;
  operational_backlog: number;
};

export type OperatorAnalyticsRow = {
  user_id: string;
  display_name: string;
  assigned_total: number;
  active_critical: number;
  sla_breaches: number;
  completed_today: number;
  avg_response_time_hours: number | null;
  avg_resolution_time_hours: number | null;
  overload_score: number;
  workload_band: WorkloadBand;
  workload_score: number;
  critical_ratio: number;
  overdue_ratio: number;
};

export type SlaBreachAgingBucket = "<24h" | "1-3d" | "3-7d" | "+7d";

export type SlaBreachAgingCounts = Record<SlaBreachAgingBucket, number>;

export type SlaBreachTrendPoint = {
  date: string;
  breached: number;
  compliant: number;
};

export type OperatorSlaPerformanceRow = {
  user_id: string;
  display_name: string;
  compliance_pct: number;
  breaches: number;
  assigned_active: number;
};

export type OperationalSlaAnalyticsSnapshot = {
  compliance_pct: number;
  breach_trend: SlaBreachTrendPoint[];
  operator_sla: OperatorSlaPerformanceRow[];
  breached_aging_buckets: SlaBreachAgingCounts;
  breached_total: number;
};

export type OperationalAnalyticsQueueSignals = {
  sla_breached_count: number;
  overloaded_operators_count: number;
  followups_due_today: number;
};

export type OperationalAnalyticsSnapshot = {
  generated_at: string;
  global: OperationalAnalyticsGlobal;
  operators: OperatorAnalyticsRow[];
  sla: OperationalSlaAnalyticsSnapshot;
  queue_signals: OperationalAnalyticsQueueSignals;
};

export type OperatorAnalyticsInput = {
  operationalStates: DEOperationalStateRow[];
  pendingFollowUps: DEFollowUpRow[];
  recentActions: DECollectionAction[];
  operatorNames: Map<string, string>;
  loadedAt: string;
};
