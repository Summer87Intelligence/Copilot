/**
 * ZETA-15: Operational sync metrics — thin append-only writer for zeta_sync_metrics.
 *
 * All functions are fire-and-forget safe: errors are logged but never thrown.
 * Table DDL: supabase/zeta-15-03-sync-metrics.sql
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletenessAuditSeverity } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

const TABLE = "zeta_sync_metrics";

export type SyncMetricTags = Record<string, string | number | boolean>;

async function insert(
  supabase: SupabaseClient,
  pipeline: string,
  workspaceId: string | null,
  metric: string,
  value: number,
  tags?: SyncMetricTags
): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({
    pipeline_name: pipeline,
    workspace_company_id: workspaceId ?? null,
    metric_name: metric,
    metric_value: value,
    tags: tags ?? null,
  });

  if (error) {
    console.warn(
      JSON.stringify({ source: "zeta-sync-metrics", kind: "insert_error", pipeline, metric, error: error.message })
    );
  }
}

/** Record an arbitrary named metric for a pipeline. */
export async function recordSyncMetric(
  supabase: SupabaseClient,
  pipeline: string,
  workspaceId: string | null,
  metric: string,
  value: number,
  tags?: SyncMetricTags
): Promise<void> {
  try {
    await insert(supabase, pipeline, workspaceId, metric, value, tags);
  } catch {
    // never throw
  }
}

/**
 * Records drift and severity for a completeness audit result.
 * Emits two metrics: `drift_absolute` and `drift_pct`.
 */
export async function recordDriftMetric(
  supabase: SupabaseClient,
  pipeline: string,
  workspaceId: string,
  entity: string,
  drift: number,
  severity: CompletenessAuditSeverity,
  tags?: SyncMetricTags
): Promise<void> {
  const baseTags: SyncMetricTags = { entity, severity, ...tags };
  await Promise.all([
    recordSyncMetric(supabase, pipeline, workspaceId, "drift_absolute", Math.abs(drift), baseTags),
    recordSyncMetric(supabase, pipeline, workspaceId, "drift_signed", drift, baseTags),
  ]);
}

/**
 * Records job lifecycle metrics for the resync worker.
 * Emits `job_duration_ms` and `job_outcome` (1 = success, 0 = failure).
 */
export async function recordResyncJobMetric(
  supabase: SupabaseClient,
  workspaceId: string,
  entity: string,
  durationMs: number,
  success: boolean,
  tags?: SyncMetricTags
): Promise<void> {
  const baseTags: SyncMetricTags = { entity, ...tags };
  await Promise.all([
    recordSyncMetric(supabase, "zeta-resync-worker", workspaceId, "job_duration_ms", durationMs, baseTags),
    recordSyncMetric(supabase, "zeta-resync-worker", workspaceId, "job_outcome", success ? 1 : 0, baseTags),
  ]);
}
