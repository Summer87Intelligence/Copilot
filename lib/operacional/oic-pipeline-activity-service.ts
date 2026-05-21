import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OicPipelineActivityData,
  OicPipelineRunEvent,
} from "@/lib/operacional/types";

type PipelineRunRow = {
  id: string;
  pipeline_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  rows_processed: number | null;
  error_summary: string | null;
  metadata: Record<string, unknown> | null;
};

type SyncRunRow = {
  id: string;
  resource_flow: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_processed: number | null;
  error_summary: string | null;
};

function mapStatus(
  raw: string
): OicPipelineRunEvent["status"] {
  if (raw === "succeeded") return "completed";
  if (raw === "failed") return "failed";
  if (raw === "partial") return "partial";
  if (raw === "running") return "running";
  return "completed";
}

function durationMs(
  started: string,
  finished: string | null,
  stored: number | null
): number | null {
  if (stored != null) return stored;
  if (finished) {
    return new Date(finished).getTime() - new Date(started).getTime();
  }
  return null;
}

export async function computeOicPipelineActivity(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  limit = 40
): Promise<OicPipelineActivityData> {
  const computedAt = new Date().toISOString();
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pipelineRes, syncRes] = await Promise.all([
    supabase
      .from("zeta_pipeline_runs")
      .select(
        "id, pipeline_name, status, started_at, finished_at, duration_ms, rows_processed, error_summary, metadata"
      )
      .gte("started_at", since48h)
      .order("started_at", { ascending: false })
      .limit(limit),
    supabase
      .from("zeta_sync_runs")
      .select(
        "id, resource_flow, status, started_at, finished_at, records_processed, error_summary"
      )
      .eq("company_id", workspaceCompanyId)
      .gte("started_at", since48h)
      .order("started_at", { ascending: false })
      .limit(limit),
  ]);

  const pipelineRows: PipelineRunRow[] = (pipelineRes.data ?? []) as PipelineRunRow[];
  const syncRows: SyncRunRow[] = (syncRes.data ?? []) as SyncRunRow[];

  // Merge and sort all events by started_at desc
  const events: OicPipelineRunEvent[] = [
    ...pipelineRows.map((r) => ({
      runId: r.id,
      workspaceCompanyId: workspaceCompanyId,
      pipelineName: r.pipeline_name,
      status: mapStatus(r.status),
      startedAt: r.started_at,
      completedAt: r.finished_at,
      durationMs: durationMs(r.started_at, r.finished_at, r.duration_ms),
      rowsProcessed: r.rows_processed,
      errorMessage: r.error_summary,
      metadata: r.metadata ?? {},
    })),
    ...syncRows.map((r) => ({
      runId: r.id,
      workspaceCompanyId: workspaceCompanyId,
      pipelineName: `sync:${r.resource_flow}`,
      status: mapStatus(r.status),
      startedAt: r.started_at,
      completedAt: r.finished_at,
      durationMs: durationMs(r.started_at, r.finished_at, null),
      rowsProcessed: r.records_processed,
      errorMessage: r.error_summary,
      metadata: {},
    })),
  ].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  // Failure rate last 24h
  const last24hEvents = events.filter((e) => e.startedAt >= since24h);
  const failureRateLastDay =
    last24hEvents.length === 0
      ? 0
      : last24hEvents.filter((e) => e.status === "failed").length /
        last24hEvents.length;

  // Average duration of completed runs
  const completedWithDuration = events.filter(
    (e) => e.status === "completed" && e.durationMs != null
  );
  const avgDurationMs =
    completedWithDuration.length === 0
      ? null
      : completedWithDuration.reduce((acc, e) => acc + e.durationMs!, 0) /
        completedWithDuration.length;

  const lastSuccess = events.find((e) => e.status === "completed");

  return {
    workspaceCompanyId,
    computedAt,
    recentRuns: events.slice(0, limit),
    failureRateLastDay,
    avgDurationMs: avgDurationMs != null ? Math.round(avgDurationMs) : null,
    lastSuccessAt: lastSuccess?.startedAt ?? null,
  };
}
