// OIC — Operational Intelligence Center
// Tipos compartidos entre servicios, repositorios, API routes y hooks.

// ── Enums / unions ────────────────────────────────────────────────────────────

export type OicSnapshotType =
  | "health_score"
  | "pipeline_activity"
  | "reconciliation"
  | "financial_health"
  | "drift_summary"
  | "completeness_audit";

export type OicSeverity = "ok" | "warning" | "critical" | "degraded";

export type OicTriggeredBy = "cron" | "manual" | "pipeline" | "backfill";

// ── DB row ────────────────────────────────────────────────────────────────────

export type OicAuditSnapshotRow = {
  id: string;
  workspace_company_id: string;
  snapshot_type: OicSnapshotType;
  snapshot_date: string; // ISO date "YYYY-MM-DD"
  score_value: number | null;
  severity: OicSeverity | null;
  item_count: number | null;
  issue_count: number | null;
  payload: Record<string, unknown>;
  triggered_by: OicTriggeredBy;
  pipeline_run_id: string | null;
  computed_duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

export type OicAuditSnapshotInsert = Omit<
  OicAuditSnapshotRow,
  "id" | "created_at" | "updated_at"
>;

// ── Health Dashboard ──────────────────────────────────────────────────────────

export type OicHealthDimension = {
  key: string;
  label: string;
  score: number; // 0–100
  weight: number; // fraction, e.g. 0.30
  severity: OicSeverity;
  detail: string | null;
};

export type OicHealthDashboardData = {
  workspaceCompanyId: string;
  computedAt: string; // ISO datetime
  overallScore: number; // 0–100
  severity: OicSeverity;
  dimensions: OicHealthDimension[];
  lastPipelineRunAt: string | null;
  lastSyncAt: string | null;
  openViolations: number;
  pendingResyncJobs: number;
};

// ── Reconciliation ────────────────────────────────────────────────────────────

export type OicConflictiveInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  clienteName: string;
  currencyCode: string;
  balanceDb: number;
  balanceZeta: number | null;
  gapAmount: number;
  severity: OicSeverity;
  missingCount: number;
  lastSyncAt: string | null;
  registroId: string | null;
};

export type OicReconciliationSummary = {
  workspaceCompanyId: string;
  computedAt: string;
  totalInvoices: number;
  matchedCount: number;
  conflictCount: number;
  criticalCount: number;
  gapUsd: number;
  gapUyu: number;
  conflictiveInvoices: OicConflictiveInvoice[];
};

// ── Pipeline Activity ─────────────────────────────────────────────────────────

export type OicPipelineRunEvent = {
  runId: string;
  workspaceCompanyId: string;
  pipelineName: string;
  status: "running" | "completed" | "failed" | "partial";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  rowsProcessed: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
};

export type OicPipelineActivityData = {
  workspaceCompanyId: string;
  computedAt: string;
  recentRuns: OicPipelineRunEvent[];
  failureRateLastDay: number; // 0–1
  avgDurationMs: number | null;
  lastSuccessAt: string | null;
};

// ── Snapshots listing ─────────────────────────────────────────────────────────

export type OicSnapshotSummary = {
  id: string;
  snapshotType: OicSnapshotType;
  snapshotDate: string;
  scoreValue: number | null;
  severity: OicSeverity | null;
  itemCount: number | null;
  issueCount: number | null;
  triggeredBy: OicTriggeredBy;
  computedDurationMs: number | null;
  createdAt: string;
};

// ── API responses ─────────────────────────────────────────────────────────────

export type OicApiResponse<T> =
  | { ok: true; data: T; computedAt: string }
  | { ok: false; error: string; code?: string };
