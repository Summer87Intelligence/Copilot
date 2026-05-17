/**
 * ZETA-16: Operational Health Score — 0-100, multi-dimensional.
 *
 * Separates operational failures from historical mismatches:
 *
 *   OPERATIONAL (affects score):
 *     - Stale/failed pipelines
 *     - Dead letter jobs
 *     - Critical integrity violations
 *     - Queue congestion
 *     - API failure rate
 *
 *   HISTORICAL (informational only, NOT counted in score):
 *     - Acknowledged drifts
 *     - Known orphan records
 *     - Historical completeness mismatches
 *
 * Score thresholds:
 *   80-100 → healthy
 *   60-79  → warning
 *   40-59  → degraded
 *   0-39   → critical
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthStatus = "healthy" | "warning" | "degraded" | "critical";

export type DimensionScore = {
  score: number;
  weight: number;
  issues: string[];
  data: Record<string, unknown>;
};

export type ZetaHealthScore = {
  score: number;
  status: HealthStatus;
  dimensions: {
    pipeline_health: DimensionScore;
    sync_freshness: DimensionScore;
    integrity: DimensionScore;
    queue_health: DimensionScore;
    api_health: DimensionScore;
  };
  /** Drifts that are suppressed from scoring due to acknowledgement. */
  acknowledged_drifts: number;
  /** Drifts present but not acknowledged — visible as informational. */
  historical_mismatches: number;
  computed_at: string;
};

function statusFromScore(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 60) return "warning";
  if (score >= 40) return "degraded";
  return "critical";
}

// ── Dimension: Pipeline Health ────────────────────────────────────────────────

async function scorePipelineHealth(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<DimensionScore> {
  const issues: string[] = [];
  const STALE_THRESHOLD_HOURS = 26; // allow 2h overrun on 24h crons

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1_000).toISOString();

  // Recent failed pipeline runs (last 24h)
  const { data: failed } = await supabase
    .from("zeta_pipeline_runs")
    .select("pipeline_name,started_at")
    .eq("status", "failed")
    .gte("started_at", cutoff)
    .limit(20);

  // Stale running pipeline runs (stuck)
  const staleRunCutoff = new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString();
  const { data: stale } = await supabase
    .from("zeta_pipeline_runs")
    .select("pipeline_name,started_at")
    .eq("status", "running")
    .lt("started_at", staleRunCutoff)
    .limit(10);

  const failedCount = (failed ?? []).length;
  const staleCount = (stale ?? []).length;

  if (failedCount > 0) issues.push(`${failedCount} pipeline run(s) failed in last 26h`);
  if (staleCount > 0) issues.push(`${staleCount} pipeline run(s) stuck in running state`);

  let score = 100;
  score -= Math.min(failedCount * 20, 60);
  score -= Math.min(staleCount * 30, 60);
  score = Math.max(0, score);

  return {
    score,
    weight: 30,
    issues,
    data: { failed_runs: failedCount, stale_runs: staleCount },
  };
}

// ── Dimension: Sync Freshness ─────────────────────────────────────────────────

async function scoreSyncFreshness(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<DimensionScore> {
  const issues: string[] = [];

  // Check last successful run for key pipelines
  const KEY_PIPELINES = ["zeta-sync-vouchers", "zeta-sync-saldos", "zeta-sync-contacts"];
  let worstAgeHours = 0;

  for (const pipeline of KEY_PIPELINES) {
    const { data } = await supabase
      .from("zeta_pipeline_runs")
      .select("finished_at,status")
      .eq("pipeline_name", pipeline)
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.finished_at) {
      issues.push(`${pipeline}: no successful run found`);
      worstAgeHours = Math.max(worstAgeHours, 48);
      continue;
    }

    const ageHours = (Date.now() - new Date(data.finished_at).getTime()) / (60 * 60 * 1_000);
    worstAgeHours = Math.max(worstAgeHours, ageHours);

    if (ageHours > 24) issues.push(`${pipeline}: last success ${ageHours.toFixed(0)}h ago`);
    else if (ageHours > 12) issues.push(`${pipeline}: last success ${ageHours.toFixed(0)}h ago (warning)`);
  }

  let score = 100;
  if (worstAgeHours > 48) score = 0;
  else if (worstAgeHours > 24) score = 20;
  else if (worstAgeHours > 12) score = 60;
  else if (worstAgeHours > 8) score = 80;

  return {
    score,
    weight: 25,
    issues,
    data: { worst_age_hours: Math.round(worstAgeHours) },
  };
}

// ── Dimension: Integrity ──────────────────────────────────────────────────────

async function scoreIntegrity(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<DimensionScore> {
  const issues: string[] = [];

  const { data: critViol } = await supabase
    .from("zeta_integrity_violations")
    .select("check_name")
    .eq("workspace_company_id", workspaceId)
    .eq("status", "open")
    .eq("severity", "critical")
    .limit(50);

  const critCount = (critViol ?? []).length;

  if (critCount > 0) {
    const names = [...new Set((critViol ?? []).map((v) => v.check_name as string))];
    issues.push(`${critCount} critical violation(s): ${names.join(", ")}`);
  }

  let score = 100;
  if (critCount >= 10) score = 0;
  else if (critCount >= 5) score = 20;
  else if (critCount >= 1) score = 40;

  return {
    score,
    weight: 25,
    issues,
    data: { critical_violations: critCount },
  };
}

// ── Dimension: Queue Health ───────────────────────────────────────────────────

async function scoreQueueHealth(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<DimensionScore> {
  const issues: string[] = [];

  const { data: dead } = await supabase
    .from("zeta_resync_jobs")
    .select("id")
    .eq("workspace_company_id", workspaceId)
    .eq("status", "dead_letter")
    .limit(100);

  const { data: pending } = await supabase
    .from("zeta_resync_jobs")
    .select("id,created_at")
    .eq("workspace_company_id", workspaceId)
    .eq("status", "pending")
    .limit(100);

  const deadCount = (dead ?? []).length;
  const pendingCount = (pending ?? []).length;

  // Detect congestion: pending jobs older than 2h
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString();
  const congested = (pending ?? []).filter(
    (j) => j.created_at && j.created_at < twoHoursAgo
  ).length;

  if (deadCount > 0) issues.push(`${deadCount} dead letter job(s)`);
  if (congested > 0) issues.push(`${congested} job(s) pending >2h (queue congestion)`);

  let score = 100;
  score -= Math.min(deadCount * 25, 60);
  score -= Math.min(congested * 20, 40);
  score = Math.max(0, score);

  return {
    score,
    weight: 10,
    issues,
    data: { dead_letter: deadCount, pending: pendingCount, congested },
  };
}

// ── Dimension: API Health ─────────────────────────────────────────────────────

async function scoreApiHealth(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<DimensionScore> {
  const issues: string[] = [];
  const WINDOW_MS = 60 * 60 * 1_000; // 1h
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

  // Count API error metrics from zeta_sync_metrics
  const { data: errorMetrics } = await supabase
    .from("zeta_sync_metrics")
    .select("metric_value,tags")
    .eq("workspace_company_id", workspaceId)
    .eq("metric_name", "job_outcome")
    .eq("metric_value", 0)
    .gte("recorded_at", cutoff)
    .limit(50);

  const { data: totalMetrics } = await supabase
    .from("zeta_sync_metrics")
    .select("id")
    .eq("workspace_company_id", workspaceId)
    .eq("metric_name", "job_outcome")
    .gte("recorded_at", cutoff)
    .limit(100);

  const errors = (errorMetrics ?? []).length;
  const total = (totalMetrics ?? []).length;
  const errorRate = total > 0 ? errors / total : 0;

  if (errors > 0 && total > 0) {
    issues.push(`API error rate: ${(errorRate * 100).toFixed(0)}% (${errors}/${total}) in last hour`);
  }

  // Also check for circuit_open metric
  const { data: circuitOpen } = await supabase
    .from("zeta_sync_metrics")
    .select("id")
    .eq("workspace_company_id", workspaceId)
    .eq("metric_name", "circuit_open")
    .gte("recorded_at", cutoff)
    .limit(1);

  const circuitIsOpen = (circuitOpen ?? []).length > 0;
  if (circuitIsOpen) issues.push("Circuit breaker is open — Zeta API temporarily suspended");

  let score = 100;
  if (circuitIsOpen) score = 0;
  else if (errorRate >= 0.5) score = 10;
  else if (errorRate >= 0.25) score = 40;
  else if (errorRate >= 0.1) score = 70;

  return {
    score,
    weight: 10,
    issues,
    data: { errors_1h: errors, total_1h: total, error_rate: Math.round(errorRate * 100) / 100, circuit_open: circuitIsOpen },
  };
}

// ── Historical Metrics (informational only) ────────────────────────────────────

async function getHistoricalContext(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ acknowledged: number; unacknowledged: number }> {
  // Count acknowledged drifts (active, not expired)
  const { data: acks } = await supabase
    .from("zeta_acknowledged_drifts")
    .select("acknowledgement_expires_at")
    .eq("workspace_company_id", workspaceId);

  const now = new Date().toISOString();
  const acknowledged = (acks ?? []).filter(
    (a) => !a.acknowledgement_expires_at || a.acknowledgement_expires_at > now
  ).length;

  // Count non-ok completeness audits from last 7 days (unacknowledged)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const { data: critAudits } = await supabase
    .from("zeta_completeness_audits")
    .select("entity,audit_scope")
    .eq("workspace_company_id", workspaceId)
    .eq("severity", "critical")
    .gte("audited_at", since)
    .limit(50);

  // Unique (entity, scope) pairs that are critical but not acknowledged
  const critPairs = new Set((critAudits ?? []).map((a) => `${a.entity}::${a.audit_scope}`));

  const { data: ackRows } = await supabase
    .from("zeta_acknowledged_drifts")
    .select("entity,audit_scope,acknowledgement_expires_at")
    .eq("workspace_company_id", workspaceId);

  const ackPairs = new Set(
    (ackRows ?? [])
      .filter((a) => !a.acknowledgement_expires_at || a.acknowledgement_expires_at > now)
      .map((a) => `${a.entity}::${a.audit_scope}`)
  );

  let unacknowledged = 0;
  for (const pair of critPairs) {
    if (!ackPairs.has(pair)) unacknowledged++;
  }

  return { acknowledged, unacknowledged };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Computes the operational health score for a workspace.
 * Does NOT include acknowledged historical drifts in the score calculation.
 */
export async function computeZetaHealthScore(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ZetaHealthScore> {
  const [pipeline, freshness, integrity, queue, api, historical] = await Promise.all([
    scorePipelineHealth(supabase, workspaceId),
    scoreSyncFreshness(supabase, workspaceId),
    scoreIntegrity(supabase, workspaceId),
    scoreQueueHealth(supabase, workspaceId),
    scoreApiHealth(supabase, workspaceId),
    getHistoricalContext(supabase, workspaceId),
  ]);

  const dimensions = { pipeline_health: pipeline, sync_freshness: freshness, integrity, queue_health: queue, api_health: api };

  const totalWeight = Object.values(dimensions).reduce((s, d) => s + d.weight, 0);
  const weightedScore = Object.values(dimensions).reduce(
    (s, d) => s + (d.score * d.weight) / totalWeight,
    0
  );
  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  return {
    score,
    status: statusFromScore(score),
    dimensions,
    acknowledged_drifts: historical.acknowledged,
    historical_mismatches: historical.unacknowledged,
    computed_at: new Date().toISOString(),
  };
}
