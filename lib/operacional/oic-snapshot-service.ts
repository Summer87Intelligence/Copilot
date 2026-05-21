import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OicSnapshotType,
  OicAuditSnapshotRow,
  OicSnapshotSummary,
} from "@/lib/operacional/types";
import {
  upsertAuditSnapshot,
  selectLatestSnapshotByType,
  selectRecentSnapshotSummaries,
} from "@/lib/data/operational-audit-snapshots-repository";
import { computeOicHealthDashboard } from "@/lib/operacional/oic-health-aggregator";
import { computeOicReconciliationSummary } from "@/lib/operacional/oic-reconciliation-service";
import { computeOicPipelineActivity } from "@/lib/operacional/oic-pipeline-activity-service";

// Max age before we recompute instead of serving the cached snapshot
const CACHE_TTL_MS: Record<OicSnapshotType, number> = {
  health_score: 5 * 60 * 1000,          // 5 min
  pipeline_activity: 2 * 60 * 1000,     // 2 min
  reconciliation: 15 * 60 * 1000,       // 15 min
  financial_health: 10 * 60 * 1000,     // 10 min
  drift_summary: 30 * 60 * 1000,        // 30 min
  completeness_audit: 60 * 60 * 1000,   // 60 min
};

function isSnapshotStale(
  row: OicAuditSnapshotRow,
  type: OicSnapshotType
): boolean {
  const age = Date.now() - new Date(row.updated_at).getTime();
  return age > (CACHE_TTL_MS[type] ?? 10 * 60 * 1000);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Compute + upsert for health_score ─────────────────────────────────────────

export async function computeAndPersistHealthSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicAuditSnapshotRow> {
  const t0 = Date.now();
  const data = await computeOicHealthDashboard(supabase, workspaceCompanyId);
  const durationMs = Date.now() - t0;

  return upsertAuditSnapshot(supabase, {
    workspace_company_id: workspaceCompanyId,
    snapshot_type: "health_score",
    snapshot_date: todayDateString(),
    score_value: data.overallScore,
    severity: data.severity,
    item_count: data.dimensions.length,
    issue_count: data.openViolations,
    payload: data as unknown as Record<string, unknown>,
    triggered_by: "manual",
    pipeline_run_id: null,
    computed_duration_ms: durationMs,
  });
}

// ── Compute + upsert for reconciliation ───────────────────────────────────────

export async function computeAndPersistReconciliationSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicAuditSnapshotRow> {
  const t0 = Date.now();
  const data = await computeOicReconciliationSummary(supabase, workspaceCompanyId);
  const durationMs = Date.now() - t0;

  return upsertAuditSnapshot(supabase, {
    workspace_company_id: workspaceCompanyId,
    snapshot_type: "reconciliation",
    snapshot_date: todayDateString(),
    score_value: null,
    severity: data.criticalCount > 0 ? "critical" : data.conflictCount > 0 ? "warning" : "ok",
    item_count: data.totalInvoices,
    issue_count: data.conflictCount,
    payload: data as unknown as Record<string, unknown>,
    triggered_by: "manual",
    pipeline_run_id: null,
    computed_duration_ms: durationMs,
  });
}

// ── Compute + upsert for pipeline_activity ────────────────────────────────────

export async function computeAndPersistActivitySnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicAuditSnapshotRow> {
  const t0 = Date.now();
  const data = await computeOicPipelineActivity(supabase, workspaceCompanyId);
  const durationMs = Date.now() - t0;

  const failedCount = data.recentRuns.filter((r) => r.status === "failed").length;

  return upsertAuditSnapshot(supabase, {
    workspace_company_id: workspaceCompanyId,
    snapshot_type: "pipeline_activity",
    snapshot_date: todayDateString(),
    score_value: null,
    severity:
      data.failureRateLastDay > 0.5
        ? "critical"
        : data.failureRateLastDay > 0.2
          ? "warning"
          : "ok",
    item_count: data.recentRuns.length,
    issue_count: failedCount,
    payload: data as unknown as Record<string, unknown>,
    triggered_by: "manual",
    pipeline_run_id: null,
    computed_duration_ms: durationMs,
  });
}

// ── Get or refresh (cache-first) ─────────────────────────────────────────────

export async function getOrRefreshHealthSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicAuditSnapshotRow> {
  const cached = await selectLatestSnapshotByType(
    supabase,
    workspaceCompanyId,
    "health_score"
  );
  if (cached && !isSnapshotStale(cached, "health_score")) return cached;
  return computeAndPersistHealthSnapshot(supabase, workspaceCompanyId);
}

export async function getOrRefreshReconciliationSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicAuditSnapshotRow> {
  const cached = await selectLatestSnapshotByType(
    supabase,
    workspaceCompanyId,
    "reconciliation"
  );
  if (cached && !isSnapshotStale(cached, "reconciliation")) return cached;
  return computeAndPersistReconciliationSnapshot(supabase, workspaceCompanyId);
}

export async function getOrRefreshActivitySnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicAuditSnapshotRow> {
  const cached = await selectLatestSnapshotByType(
    supabase,
    workspaceCompanyId,
    "pipeline_activity"
  );
  if (cached && !isSnapshotStale(cached, "pipeline_activity")) return cached;
  return computeAndPersistActivitySnapshot(supabase, workspaceCompanyId);
}

// ── List snapshots ────────────────────────────────────────────────────────────

export async function listRecentOicSnapshots(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  limit = 50
): Promise<OicSnapshotSummary[]> {
  return selectRecentSnapshotSummaries(supabase, workspaceCompanyId, limit);
}
