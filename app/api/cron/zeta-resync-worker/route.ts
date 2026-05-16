/**
 * GET /api/cron/zeta-resync-worker
 *
 * ZETA-14 — Procesa la cola `zeta_resync_jobs` de forma secuencial y segura.
 *
 * Comportamiento:
 *   1. Reap stale: jobs en "running" hace >30min → "failed" (stale_timeout).
 *   2. Claim pending: toma hasta `limit` jobs FIFO, claim atómico (pending→running).
 *   3. Ejecuta cada job con el executor correspondiente.
 *   4. Marca cada job como completed/failed según resultado.
 *   5. Un job malo no detiene el batch — sigue con el siguiente.
 *
 * Protecciones:
 *   - Auth: Bearer CRON_SECRET
 *   - Anti-overlap: skip si hay un run de este worker activo en pipeline_runs
 *   - limit configurable por query param (default 5, máx 20)
 *
 * Frecuencia en vercel.json: cada 30 minutos ("30 * * * *").
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createCronLogger } from "@/lib/observability/cron-logger";
import {
  createPipelineRun,
  expireStaleFleetPipelineRuns,
  findActivePipelineRun,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";
import {
  listPendingResyncJobs,
  listStaleRunningResyncJobs,
  markResyncJobRunning,
  markResyncJobSkipped,
  markResyncJobSucceeded,
  retryOrFailResyncJob,
  RESYNC_JOB_STALE_THRESHOLD_MS,
} from "@/lib/data/zeta-resync-job-repository";
import { executeResyncJob } from "@/lib/integrations/zeta/zeta-resync-executor";
import { recordResyncJobMetric } from "@/lib/observability/zeta-sync-metrics";

const PIPELINE = ZETA_PIPELINE_NAMES.RESYNC_WORKER;
const ANTI_OVERLAP_WINDOW_MS = 25 * 60 * 1_000; // 25 min (cron cada 30 min)
const DEFAULT_JOB_LIMIT = 5;
const MAX_JOB_LIMIT = 20;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseLimit(request: NextRequest): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return DEFAULT_JOB_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_JOB_LIMIT;
  return Math.min(n, MAX_JOB_LIMIT);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, code: "CONFIG_ERROR" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cronRunId = randomUUID();
  const started = Date.now();
  const log = createCronLogger(PIPELINE, cronRunId);
  const limit = parseLimit(request);

  log("cron_start", { limit });

  // ── Anti-overlap ──────────────────────────────────────────────────────────
  try {
    const closed = await expireStaleFleetPipelineRuns(supabase);
    if (closed > 0) log("stale_pipeline_runs_closed", { count: closed });
  } catch (e) {
    log("expire_stale_error", { error: String(e) });
  }

  let activeRun: Awaited<ReturnType<typeof findActivePipelineRun>> = null;
  try {
    activeRun = await findActivePipelineRun(supabase, PIPELINE, ANTI_OVERLAP_WINDOW_MS, {
      workspaceScope: "fleet",
    });
  } catch {
    // tabla puede no existir aún — continuar
  }

  if (activeRun) {
    log("cron_skipped_overlap", { running_since: activeRun.started_at });
    return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
  }

  // ── Registrar run ─────────────────────────────────────────────────────────
  let pipelineRunId: string | null = null;
  try {
    const created = await createPipelineRun(supabase, {
      pipeline_name: PIPELINE,
      metadata: { cron_run_id: cronRunId, limit },
    });
    pipelineRunId = created.id;
  } catch (e) {
    log("pipeline_run_create_error", { error: String(e) });
    // No bloquear — la falta de registry no debe impedir el trabajo real
  }

  let reaped = 0;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  type JobSummary = {
    job_id: string;
    entity: string;
    scope: string;
    outcome: "succeeded" | "failed" | "skipped" | "not_claimed";
    error?: string;
    duration_ms?: number;
  };
  const jobSummaries: JobSummary[] = [];

  // ── FASE 1: Reap stale running jobs ──────────────────────────────────────
  try {
    const staleJobs = await listStaleRunningResyncJobs(supabase, RESYNC_JOB_STALE_THRESHOLD_MS);
    for (const staleJob of staleJobs) {
      const outcome = await retryOrFailResyncJob(supabase, staleJob.id, "stale_timeout: job llevaba >30min en running");
      reaped++;
      log("stale_job_reaped", { job_id: staleJob.id, entity: staleJob.entity, started_at: staleJob.started_at, outcome });
    }
  } catch (e) {
    log("stale_reap_error", { error: String(e) });
  }

  // ── FASE 2: Procesar jobs pendientes ──────────────────────────────────────
  let pendingJobs: Awaited<ReturnType<typeof listPendingResyncJobs>> = [];
  try {
    pendingJobs = await listPendingResyncJobs(supabase, limit);
  } catch (e) {
    log("list_pending_error", { error: String(e) });
  }

  log("pending_jobs_found", { count: pendingJobs.length });

  for (const job of pendingJobs) {
    processed++;
    const jobStart = Date.now();

    // Claim atómico — otro worker puede haberse adelantado
    let claimed;
    try {
      claimed = await markResyncJobRunning(supabase, job.id);
    } catch (e) {
      log("claim_error", { job_id: job.id, error: String(e) });
      jobSummaries.push({ job_id: job.id, entity: job.entity, scope: job.scope, outcome: "not_claimed" });
      skipped++;
      continue;
    }

    if (!claimed) {
      // Already claimed by another worker (race condition)
      log("job_already_claimed", { job_id: job.id });
      jobSummaries.push({ job_id: job.id, entity: job.entity, scope: job.scope, outcome: "not_claimed" });
      skipped++;
      continue;
    }

    // Dry-run: registrar job pero no ejecutar pipeline
    if (job.dry_run) {
      await markResyncJobSkipped(supabase, job.id, "dry_run: no ejecutado").catch(() => {});
      log("job_dry_run", { job_id: job.id, entity: job.entity });
      jobSummaries.push({
        job_id: job.id,
        entity: job.entity,
        scope: job.scope,
        outcome: "skipped",
        duration_ms: Date.now() - jobStart,
      });
      skipped++;
      continue;
    }

    // Execute
    try {
      const outcome = await executeResyncJob(supabase, job);
      const duration_ms = Date.now() - jobStart;

      if (outcome.ok) {
        await markResyncJobSucceeded(supabase, job.id, {
          rows_fetched: outcome.summary.rows_fetched,
          rows_synced: outcome.summary.rows_upserted,
          rows_skipped: outcome.summary.rows_skipped,
        }).catch(() => {});
        await recordResyncJobMetric(supabase, job.workspace_company_id, job.entity, duration_ms, true, { scope: job.scope }).catch(() => {});
        succeeded++;
        log("job_succeeded", {
          job_id: job.id,
          entity: job.entity,
          scope: job.scope,
          summary: outcome.summary,
          duration_ms,
        });
        jobSummaries.push({ job_id: job.id, entity: job.entity, scope: job.scope, outcome: "succeeded", duration_ms });
      } else {
        const retryOutcome = await retryOrFailResyncJob(supabase, job.id, outcome.error).catch(() => "dead_letter" as const);
        await recordResyncJobMetric(supabase, job.workspace_company_id, job.entity, duration_ms, false, { scope: job.scope, retry_outcome: retryOutcome }).catch(() => {});
        failed++;
        log("job_failed", { job_id: job.id, entity: job.entity, scope: job.scope, error: outcome.error, retry_outcome: retryOutcome, duration_ms });
        jobSummaries.push({ job_id: job.id, entity: job.entity, scope: job.scope, outcome: "failed", error: outcome.error, duration_ms });
      }
    } catch (e) {
      // Executor never throws — but belt-and-suspenders
      const msg = e instanceof Error ? e.message : String(e);
      await retryOrFailResyncJob(supabase, job.id, `worker_exception: ${msg}`).catch(() => {});
      failed++;
      log("job_exception", { job_id: job.id, entity: job.entity, error: msg });
      jobSummaries.push({ job_id: job.id, entity: job.entity, scope: job.scope, outcome: "failed", error: msg });
    }
  }

  // ── Finalizar pipeline run ────────────────────────────────────────────────
  const duration = Date.now() - started;

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: failed > 0 ? "partial" : "succeeded",
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      rows_processed: processed,
      rows_updated: succeeded,
      rows_failed: failed,
      metadata: {
        cron_run_id: cronRunId,
        reaped,
        processed,
        succeeded,
        failed,
        skipped,
      },
    }).catch(() => {});
  }

  log("cron_end", { duration_ms: duration, reaped, processed, succeeded, failed, skipped });

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    reaped,
    processed,
    succeeded,
    failed,
    skipped,
    jobs: jobSummaries,
  });
}
