/**
 * ZETA-13: Tipos para el sistema enterprise de sincronización confiable.
 * Completeness audit, divergence detection, integrity checks, re-sync jobs.
 */

// ── Entidades auditables ──────────────────────────────────────────────────────

export type ZetaAuditableEntity = "invoices" | "receipts" | "installments" | "contacts";

// ── Completeness Audit ────────────────────────────────────────────────────────

export type CompletenessAuditSeverity = "ok" | "warning" | "critical";

/**
 * Metadata del audit de invoices: estadísticas del classifier aplicado
 * para alinear el conteo Zeta con lo que el pipeline efectivamente persiste.
 * Solo presente en audits de entity='invoices'.
 */
export type CompletenessAuditMetadata = {
  /** Total de filas devueltas por Zeta antes de clasificar. */
  zeta_raw_count?: number;
  /** Filas aceptadas por el classifier (= zeta_count usado para severidad). */
  zeta_accepted_count?: number;
  /** Filas descartadas por el classifier (recibo_text + cfe_type_not_dgi). */
  zeta_skipped_count?: number;
  /** Conteos por código de rechazo. */
  skipped_classifier_counts?: {
    recibo_text?: number;
    cfe_type_not_dgi?: number;
  };
  /** Hasta 5 muestras para diagnóstico. */
  sample_skipped_classifier?: Array<{
    registro_id: string | null;
    reject_code: string;
    cfe_tipo?: number;
    tipo_nombre?: string | null;
  }>;
  /**
   * Registros locales ZETA:CCV1: sin zeta_registro_id — históricos pre-trazabilidad.
   * Excluidos del drift operacional. Informacional únicamente.
   */
  legacy_untraceable_count?: number;
};

export type CompletenessAuditResult = {
  entity: ZetaAuditableEntity;
  audit_scope: string;
  period_year?: number;
  period_month?: number;
  /**
   * Para invoices: count de filas ACEPTADAS por el classifier (excluye cfe_type_not_dgi / recibo_text).
   * Para receipts/contacts: count total de filas Zeta (sin clasificar).
   */
  zeta_count: number;
  local_count: number;
  drift: number;                       // local_count - zeta_count (negativo = faltan locales)
  drift_pct: number;                   // |drift| / zeta_count * 100
  missing_registro_ids: string[];      // En Zeta (accepted) pero no en local
  orphan_registro_ids: string[];       // En local pero no en Zeta
  severity: CompletenessAuditSeverity;
  notes?: string;
  zeta_error?: string;                 // Si Zeta falló durante el audit (parcial)
  metadata?: CompletenessAuditMetadata;
};

export type CompletenessAuditRow = CompletenessAuditResult & {
  id: string;
  workspace_company_id: string;
  auto_resync_triggered: boolean;
  audited_at: string;
};

// ── Divergence Detection ─────────────────────────────────────────────────────

export type DivergenceSeverity = "info" | "warning" | "critical";
export type DivergenceStatus = "open" | "resolved" | "auto_fixed" | "acknowledged";

export type SyncDivergence = {
  entity: ZetaAuditableEntity;
  zeta_registro_id: string;
  local_record_id?: string;
  field_name: string;
  zeta_value: string | null;
  local_value: string | null;
  severity: DivergenceSeverity;
};

export type SyncDivergenceRow = SyncDivergence & {
  id: string;
  workspace_company_id: string;
  status: DivergenceStatus;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

// ── Integrity Violations ─────────────────────────────────────────────────────

export type IntegrityCheckName =
  | "invoice_balance_exceeds_total"
  | "invoice_null_currency"
  | "invoice_null_balance_pending"
  | "invoice_duplicate_number"
  | "receipt_null_currency"
  | "receipt_negative_amount"
  | "installment_orphan_no_invoice"
  | "installment_overdue_invoice_open"
  | "cross_contact_unmatched_in_workspace";

export type IntegrityViolationSeverity = "info" | "warning" | "critical";
export type IntegrityViolationStatus = "open" | "resolved" | "suppressed";
export type IntegrityEntity = ZetaAuditableEntity | "cross";

export type IntegrityViolation = {
  check_name: IntegrityCheckName | string;
  entity: IntegrityEntity;
  record_id?: string;
  record_key?: string;
  description: string;
  severity: IntegrityViolationSeverity;
  metadata?: Record<string, unknown>;
};

export type IntegrityViolationRow = IntegrityViolation & {
  id: string;
  workspace_company_id: string;
  status: IntegrityViolationStatus;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

// ── Integrity Check Run Result ────────────────────────────────────────────────

export type IntegrityCheckRunResult = {
  entity: IntegrityEntity;
  check_name: string;
  violations_found: number;
  violations_new: number;
  violations_resolved: number;
  violations_critical: number;
  duration_ms: number;
  error?: string;
};

// ── Re-sync Jobs ─────────────────────────────────────────────────────────────

export type ResyncEntity = ZetaAuditableEntity | "saldos";
export type ResyncScope =
  | `period:${string}`
  | `client:${string}`
  | `registro_id:${string}`
  | "full";

export type ResyncTriggeredBy = "manual" | "completeness_audit" | "integrity_check" | "divergence_detection";
export type ResyncJobStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "dead_letter";

export type CreateResyncJobInput = {
  workspace_company_id: string;
  entity: ResyncEntity;
  scope: string;
  triggered_by: ResyncTriggeredBy;
  dry_run?: boolean;
  metadata?: Record<string, unknown>;
};

export type ResyncJobRow = CreateResyncJobInput & {
  id: string;
  status: ResyncJobStatus;
  rows_fetched: number | null;
  rows_synced: number | null;
  rows_skipped: number | null;
  error_summary: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  retry_after: string | null;
};

// ── Acknowledged Drifts ───────────────────────────────────────────────────────

export type AcknowledgedDrift = {
  workspace_company_id: string;
  entity: string;
  audit_scope: string;
  acknowledged_by: string;
  acknowledgement_reason: string;
  acknowledgement_expires_at?: string | null;
  last_known_drift: number;
  last_known_zeta_count: number;
  last_known_local_count: number;
};

export type AcknowledgedDriftRow = AcknowledgedDrift & {
  id: string;
  acknowledged_at: string;
};

// ── Daily Snapshots ───────────────────────────────────────────────────────────

export type DailySnapshotInput = {
  workspace_company_id: string;
  snapshot_date: string; // ISO date string YYYY-MM-DD
  invoices_count?: number | null;
  receipts_count?: number | null;
  contacts_count?: number | null;
  cuotas_count?: number | null;
  open_invoices_count?: number | null;
  total_balance_pending?: number | null;
  sync_runs_today?: number;
  sync_errors_today?: number;
  integrity_violations_open?: number;
  critical_violations_open?: number;
  resync_jobs_completed?: number;
  resync_jobs_failed?: number;
  dead_letter_jobs?: number;
  metadata?: Record<string, unknown>;
};

export type DailySnapshotRow = DailySnapshotInput & {
  id: string;
  created_at: string;
};

// ── Enterprise Health Summary ─────────────────────────────────────────────────

export type EntityHealthSummary = {
  entity: ZetaAuditableEntity;
  last_audit_at: string | null;
  last_severity: CompletenessAuditSeverity | null;
  last_drift: number | null;
  last_drift_pct: number | null;
  open_violations: number;
  critical_violations: number;
};

export type EnterpriseSyncHealth = {
  generated_at: string;
  workspace_company_id: string;
  entities: EntityHealthSummary[];
  total_open_violations: number;
  total_critical_violations: number;
  recent_resync_jobs: ResyncJobRow[];
};

// ── Sync Metrics History ──────────────────────────────────────────────────────

export type SyncMetricsHistoryStatus = "succeeded" | "partial" | "failed";

export type SyncMetricsHistoryInput = {
  workspace_company_id: string;
  pipeline_name: string;
  pipeline_run_id?: string | null;
  recorded_at?: string;
  duration_ms?: number | null;
  rows_fetched?: number;
  rows_upserted?: number;
  rows_inserted?: number;
  rows_updated?: number;
  rows_skipped?: number;
  rows_failed?: number;
  retry_count?: number;
  error_count?: number;
  status?: SyncMetricsHistoryStatus;
  drift_count?: number | null;
  drift_pct?: number | null;
  api_latency_ms?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type SyncMetricsHistoryRow = Required<SyncMetricsHistoryInput> & {
  id: string;
};

// ── Contract Snapshot ─────────────────────────────────────────────────────────

export type ContractSnapshotInput = {
  endpoint: string;
  workspace_company_id?: string | null;
  schema_version?: string;
  field_names?: string[];
  unknown_fields?: string[];
  validation_errors?: string[];
  is_valid?: boolean;
  row_count_in_batch?: number;
};

export type ContractSnapshotRow = ContractSnapshotInput & {
  id: string;
  sampled_at: string;
};

// ── Alert Events ──────────────────────────────────────────────────────────────

export type AlertEventType =
  | "critical_integrity_violation"
  | "stale_pipeline"
  | "dead_letter_spike"
  | "api_auth_failure"
  | "sync_stopped"
  | "queue_congestion";

export type AlertSeverity = "warning" | "critical";

export type AlertEvent = {
  event_type: AlertEventType;
  severity: AlertSeverity;
  workspace_company_id: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
};
