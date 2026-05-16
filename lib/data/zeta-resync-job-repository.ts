/**
 * ZETA-14: Repositorio tipado para `zeta_resync_jobs`.
 *
 * Operaciones de ciclo de vida idempotentes y concurrency-safe:
 *   - listPendingResyncJobs    — cola FIFO de trabajos pendientes
 *   - listStaleRunningResyncJobs — detecta jobs stuck en "running"
 *   - markResyncJobRunning     — claim atómico (solo si sigue pending)
 *   - markResyncJobSucceeded   — cierra con métricas
 *   - markResyncJobFailed      — cierra con error
 *   - markResyncJobSkipped     — marca omitido con razón
 *
 * Concurrency guard: `markResyncJobRunning` incluye `.eq("status","pending")`
 * en el WHERE del UPDATE → si dos workers compiten por el mismo job, solo uno
 * recibirá datos; el otro recibirá null y debe saltearlo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResyncJobRow, ResyncJobStatus } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

const TABLE = "zeta_resync_jobs";

/** Tiempo máximo que un job puede estar en "running" antes de considerarse stale. */
export const RESYNC_JOB_STALE_THRESHOLD_MS = 30 * 60 * 1_000; // 30 min

export type ResyncJobSuccessResult = {
  rows_fetched: number;
  rows_synced: number;
  rows_skipped: number;
};

// ── Queries ───────────────────────────────────────────────────────────────────

/** Devuelve jobs pendientes cuyo retry_after ya venció, ordenados FIFO (created_at ASC). */
export async function listPendingResyncJobs(
  supabase: SupabaseClient,
  limit = 5
): Promise<ResyncJobRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("status", "pending")
    .or(`retry_after.is.null,retry_after.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "list_pending_error", error: error.message })
    );
    return [];
  }
  return (data ?? []) as ResyncJobRow[];
}

/**
 * Devuelve jobs que llevan más de `staleAfterMs` en estado "running".
 * El worker los marca como failed antes de procesar la cola normal.
 */
export async function listStaleRunningResyncJobs(
  supabase: SupabaseClient,
  staleAfterMs = RESYNC_JOB_STALE_THRESHOLD_MS
): Promise<ResyncJobRow[]> {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("status", "running")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "list_stale_error", error: error.message })
    );
    return [];
  }
  return (data ?? []) as ResyncJobRow[];
}

// ── Transiciones de estado ────────────────────────────────────────────────────

/**
 * Claim atómico: transiciona de pending → running.
 * Returns the updated row, or null if the job was already claimed (race condition)
 * or doesn't exist.
 */
export async function markResyncJobRunning(
  supabase: SupabaseClient,
  id: string
): Promise<ResyncJobRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "running" as ResyncJobStatus,
      started_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending") // ← concurrency guard
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "mark_running_error", id, error: error.message })
    );
    return null;
  }
  return data ? (data as ResyncJobRow) : null;
}

export async function markResyncJobSucceeded(
  supabase: SupabaseClient,
  id: string,
  result: ResyncJobSuccessResult
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "completed" as ResyncJobStatus,
      completed_at: new Date().toISOString(),
      rows_fetched: result.rows_fetched,
      rows_synced: result.rows_synced,
      rows_skipped: result.rows_skipped,
      error_summary: null,
    })
    .eq("id", id);

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "mark_succeeded_error", id, error: error.message })
    );
  }
}

export async function markResyncJobFailed(
  supabase: SupabaseClient,
  id: string,
  errorMsg: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "failed" as ResyncJobStatus,
      completed_at: new Date().toISOString(),
      error_summary: errorMsg.slice(0, 2000),
    })
    .eq("id", id);

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "mark_failed_error", id, error: error.message })
    );
  }
}

/** Max backoff cap for retry delay: 30 minutes. */
const MAX_RETRY_DELAY_MS = 30 * 60 * 1_000;

/**
 * Self-healing retry with exponential backoff.
 * If retry_count < max_retries: reset to pending, increment retry_count, set retry_after.
 * If retry_count >= max_retries: transition to dead_letter (permanent failure).
 * Returns: "retried" | "dead_letter"
 */
export async function retryOrFailResyncJob(
  supabase: SupabaseClient,
  id: string,
  errorMsg: string
): Promise<"retried" | "dead_letter"> {
  // Read current retry state
  const { data: job } = await supabase
    .from(TABLE)
    .select("retry_count, max_retries")
    .eq("id", id)
    .maybeSingle();

  const retryCount = (job?.retry_count as number | null) ?? 0;
  const maxRetries = (job?.max_retries as number | null) ?? 3;

  if (retryCount >= maxRetries) {
    // Exhausted — move to dead_letter
    await supabase
      .from(TABLE)
      .update({
        status: "dead_letter",
        completed_at: new Date().toISOString(),
        last_error: errorMsg.slice(0, 2000),
        error_summary: errorMsg.slice(0, 2000),
      })
      .eq("id", id);

    console.info(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "job_dead_letter", id, retry_count: retryCount })
    );
    return "dead_letter";
  }

  // Exponential backoff: 60s × 2^retryCount, capped at MAX_RETRY_DELAY_MS
  const delayMs = Math.min(60_000 * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
  const retryAfter = new Date(Date.now() + delayMs).toISOString();

  await supabase
    .from(TABLE)
    .update({
      status: "pending",
      retry_count: retryCount + 1,
      retry_after: retryAfter,
      last_error: errorMsg.slice(0, 2000),
      error_summary: null,
      started_at: null,
      completed_at: null,
    })
    .eq("id", id);

  console.info(
    JSON.stringify({
      source: "zeta-resync-job-repo",
      kind: "job_retry_scheduled",
      id,
      retry_count: retryCount + 1,
      retry_after: retryAfter,
      delay_ms: delayMs,
    })
  );
  return "retried";
}

export async function markResyncJobSkipped(
  supabase: SupabaseClient,
  id: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "skipped" as ResyncJobStatus,
      completed_at: new Date().toISOString(),
      error_summary: reason.slice(0, 500),
    })
    .eq("id", id);

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-resync-job-repo", kind: "mark_skipped_error", id, error: error.message })
    );
  }
}
