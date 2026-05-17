/**
 * ZETA-16: Repository for zeta_sync_metrics_history.
 *
 * Append-only. Each pipeline run writes one row with its execution metrics.
 * Used for trend analysis, dashboards, and alerting thresholds.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SyncMetricsHistoryInput,
  SyncMetricsHistoryRow,
} from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

const TABLE = "zeta_sync_metrics_history";

/** Appends one metrics row for a completed pipeline run. */
export async function appendSyncMetrics(
  supabase: SupabaseClient,
  input: SyncMetricsHistoryInput
): Promise<SyncMetricsHistoryRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      workspace_company_id: input.workspace_company_id,
      pipeline_name: input.pipeline_name,
      pipeline_run_id: input.pipeline_run_id ?? null,
      recorded_at: input.recorded_at ?? new Date().toISOString(),
      duration_ms: input.duration_ms ?? null,
      rows_fetched: input.rows_fetched ?? 0,
      rows_upserted: input.rows_upserted ?? 0,
      rows_inserted: input.rows_inserted ?? 0,
      rows_updated: input.rows_updated ?? 0,
      rows_skipped: input.rows_skipped ?? 0,
      rows_failed: input.rows_failed ?? 0,
      retry_count: input.retry_count ?? 0,
      error_count: input.error_count ?? 0,
      status: input.status ?? "succeeded",
      drift_count: input.drift_count ?? null,
      drift_pct: input.drift_pct ?? null,
      api_latency_ms: input.api_latency_ms ?? null,
      metadata: input.metadata ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-sync-metrics-history-repo", kind: "insert_error", error: error.message })
    );
    return null;
  }
  return data as SyncMetricsHistoryRow;
}

/** Returns metrics rows for a workspace and pipeline, newest first. */
export async function getSyncMetricsHistory(
  supabase: SupabaseClient,
  workspaceId: string,
  pipelineName: string,
  limit = 30
): Promise<SyncMetricsHistoryRow[]> {
  const { data } = await supabase
    .from(TABLE)
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .eq("pipeline_name", pipelineName)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SyncMetricsHistoryRow[];
}

/** Returns all pipeline metrics in a time window across all workspaces. */
export async function getSyncMetricsTrend(
  supabase: SupabaseClient,
  pipelineName: string,
  days = 7
): Promise<SyncMetricsHistoryRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString();
  const { data } = await supabase
    .from(TABLE)
    .select("*")
    .eq("pipeline_name", pipelineName)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(500);
  return (data ?? []) as SyncMetricsHistoryRow[];
}

/** Returns the last N runs for a specific pipeline_run_id. */
export async function getMetricsForRun(
  supabase: SupabaseClient,
  pipelineRunId: string
): Promise<SyncMetricsHistoryRow[]> {
  const { data } = await supabase
    .from(TABLE)
    .select("*")
    .eq("pipeline_run_id", pipelineRunId)
    .order("recorded_at", { ascending: true });
  return (data ?? []) as SyncMetricsHistoryRow[];
}
