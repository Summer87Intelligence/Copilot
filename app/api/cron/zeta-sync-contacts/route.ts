/**
 * GET /api/cron/zeta-sync-contacts
 *
 * Cron Vercel — sincroniza contactos Zeta de todos los workspaces activos.
 * Frecuencia: 1 vez por día a las 02:00 UTC (vercel.json: "0 2 * * *").
 *
 * El pipeline usa watermarks incrementales: solo sincroniza contactos
 * nuevos o modificados desde el último sync exitoso.
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay un run activo (ventana 24 horas)
 * - Retraso conservador: 800ms entre workspaces
 * - Retry: 3 intentos con backoff para errores de red/5xx
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCronLogger } from "@/lib/observability/cron-logger";

import { syncZetaContactsIncremental } from "@/lib/integrations/zeta/zeta-contacts-pipeline";
import { withZetaRetry } from "@/lib/integrations/zeta/zeta-retry";
import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import {
  createPipelineRun,
  expireStaleFleetPipelineRuns,
  findActivePipelineRun,
  touchPipelineRunHeartbeat,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";

const PIPELINE = ZETA_PIPELINE_NAMES.CONTACTS;

// Retraso conservador entre workspaces
const WORKSPACE_DELAY_MS = 800;

// Anti-overlap: ventana de 24 horas (igual al intervalo del cron)
const ANTI_OVERLAP_WINDOW_MS = 24 * 60 * 60 * 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type WorkspaceSummary = {
  workspace_id: string;
  synced: number;
  errors: number;
  message: string | null;
};

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, code: "CONFIG_ERROR", message: "Supabase config faltante." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cronRunId = randomUUID();
  const started = Date.now();
  const log = createCronLogger(PIPELINE, cronRunId);

  log("cron_start");

  try {
    const closed = await expireStaleFleetPipelineRuns(supabase);
    if (closed > 0) {
      log("stale_fleet_runs_closed", { count: closed });
    }
  } catch (e) {
    log("expire_stale_runs_error", { error: String(e) });
  }

  let activeRun: Awaited<ReturnType<typeof findActivePipelineRun>> = null;
  try {
    activeRun = await findActivePipelineRun(supabase, PIPELINE, ANTI_OVERLAP_WINDOW_MS, {
      workspaceScope: "fleet",
    });
  } catch (e) {
    log("anti_overlap_check_error", { error: String(e) });
  }

  if (activeRun) {
    log("cron_skipped_overlap", { running_since: activeRun.started_at, run_id: activeRun.id });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "already_running",
      running_since: activeRun.started_at,
      cron_run_id: cronRunId,
    });
  }

  // ── Registrar run activo ──────────────────────────────────────────────────
  let pipelineRunId: string | null = null;
  try {
    const created = await createPipelineRun(supabase, {
      pipeline_name: PIPELINE,
      metadata: { cron_run_id: cronRunId },
    });
    pipelineRunId = created.id;
  } catch (e) {
    log("pipeline_run_create_error", { error: String(e) });
  }

  let totalSynced = 0;
  let totalFailed = 0;
  const workspaceSummaries: WorkspaceSummary[] = [];
  let workspacesTotal = 0;
  let workspacePageIndex = 0;
  let cursorAfterId: string | null = null;
  let firstWorkspaceInCron = true;

  while (true) {
    let page: { ids: string[]; nextAfterId: string | null };
    try {
      page = await fetchActiveWorkspaceIdPage(supabase, cursorAfterId);
    } catch (e) {
      const msg = String(e);
      log("workspace_page_error", { error: msg, cursor_after: cursorAfterId });
      if (pipelineRunId) {
        await updatePipelineRun(supabase, pipelineRunId, {
          status: "failed",
          duration_ms: Date.now() - started,
          error_summary: `workspace_page_error: ${msg}`,
        }).catch(() => {});
      }
      return NextResponse.json(
        { ok: false, code: "DB_ERROR", message: msg },
        { status: 500 }
      );
    }

    if (page.ids.length === 0) {
      break;
    }

    workspacePageIndex += 1;
    log("workspace_page", {
      batch_index: workspacePageIndex,
      batch_size: page.ids.length,
      next_cursor: page.nextAfterId,
    });

    for (const workspaceId of page.ids) {
    if (!firstWorkspaceInCron) {
      await sleep(WORKSPACE_DELAY_MS);
    }
    firstWorkspaceInCron = false;

    const requestId = randomUUID();

    try {
      const outcome = await withZetaRetry(
        () =>
          syncZetaContactsIncremental({
            supabase,
            workspaceCompanyId: workspaceId,
            ctx: { requestId, tenantId: workspaceId },
          }),
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
          maxDelayMs: 15_000,
          onRetry: (err, attempt, delayMs) => {
            log("workspace_retry", {
              workspace_id: workspaceId,
              attempt,
              delay_ms: delayMs,
              error: String(err),
            });
          },
        }
      );

      totalSynced += outcome.synced ?? 0;

      if (!outcome.success || (outcome.errors ?? 0) > 0) {
        totalFailed++;
        log("workspace_contacts_error", {
          workspace_id: workspaceId,
          synced: outcome.synced,
          errors: outcome.errors,
          message: outcome.message,
        });
      }

      workspaceSummaries.push({
        workspace_id: workspaceId,
        synced: outcome.synced ?? 0,
        errors: outcome.errors ?? 0,
        message: outcome.message ?? null,
      });
    } catch (err) {
      totalFailed++;
      log("workspace_exception", { workspace_id: workspaceId, error: String(err) });
      workspaceSummaries.push({
        workspace_id: workspaceId,
        synced: 0,
        errors: 1,
        message: String(err),
      });
    }

    workspacesTotal += 1;
    if (pipelineRunId) {
      try {
        await touchPipelineRunHeartbeat(supabase, pipelineRunId);
      } catch (e) {
        log("pipeline_heartbeat_error", { error: String(e) });
      }
    }
    }

    cursorAfterId = page.nextAfterId;
    if (cursorAfterId == null) {
      break;
    }
  }

  const duration = Date.now() - started;
  const finalStatus =
    totalFailed === 0 ? "succeeded" : totalSynced > 0 ? "partial" : "failed";

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: finalStatus,
      duration_ms: duration,
      rows_processed: workspacesTotal,
      rows_updated: totalSynced,
      rows_failed: totalFailed,
      error_summary: totalFailed > 0 ? `${totalFailed} workspaces con error` : null,
      metadata: {
        cron_run_id: cronRunId,
        workspaces: workspacesTotal,
        workspace_pages: workspacePageIndex,
        summaries: workspaceSummaries,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces: workspacesTotal,
    total_synced: totalSynced,
    total_failed: totalFailed,
    status: finalStatus,
    duration_ms: duration,
  });

  return NextResponse.json({
    ok: totalFailed === 0,
    cron_run_id: cronRunId,
    pipeline_run_id: pipelineRunId,
    status: finalStatus,
    workspaces_processed: workspacesTotal,
    total_synced: totalSynced,
    total_failed: totalFailed,
    duration_ms: duration,
    workspace_summaries: workspaceSummaries,
  });
}
