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
import {
  createPipelineRun,
  findActivePipelineRun,
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

  // ── Anti-overlap ─────────────────────────────────────────────────────────
  let activeRun: Awaited<ReturnType<typeof findActivePipelineRun>> = null;
  try {
    activeRun = await findActivePipelineRun(supabase, PIPELINE, ANTI_OVERLAP_WINDOW_MS);
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

  // ── Cargar workspaces activos ─────────────────────────────────────────────
  const { data: workspaces, error: wsErr } = await supabase
    .from("companies")
    .select("id")
    .eq("status", "active")
    .limit(20);

  if (wsErr) {
    log("workspace_load_error", { error: wsErr.message });
    if (pipelineRunId) {
      await updatePipelineRun(supabase, pipelineRunId, {
        status: "failed",
        duration_ms: Date.now() - started,
        error_summary: `workspace_load_error: ${wsErr.message}`,
      }).catch(() => {});
    }
    return NextResponse.json(
      { ok: false, code: "DB_ERROR", message: wsErr.message },
      { status: 500 }
    );
  }

  const workspaceIds = ((workspaces ?? []) as { id: string }[]).map((w) => w.id);

  let totalSynced = 0;
  let totalFailed = 0;
  const workspaceSummaries: WorkspaceSummary[] = [];

  // ── Procesar cada workspace ───────────────────────────────────────────────
  for (let i = 0; i < workspaceIds.length; i++) {
    const workspaceId = workspaceIds[i]!;
    if (i > 0) await sleep(WORKSPACE_DELAY_MS);

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
  }

  const duration = Date.now() - started;
  const finalStatus =
    totalFailed === 0 ? "succeeded" : totalSynced > 0 ? "partial" : "failed";

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: finalStatus,
      duration_ms: duration,
      rows_processed: workspaceIds.length,
      rows_updated: totalSynced,
      rows_failed: totalFailed,
      error_summary: totalFailed > 0 ? `${totalFailed} workspaces con error` : null,
      metadata: {
        cron_run_id: cronRunId,
        workspaces: workspaceIds.length,
        summaries: workspaceSummaries,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces: workspaceIds.length,
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
    workspaces_processed: workspaceIds.length,
    total_synced: totalSynced,
    total_failed: totalFailed,
    duration_ms: duration,
    workspace_summaries: workspaceSummaries,
  });
}
