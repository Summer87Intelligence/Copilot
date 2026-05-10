/**
 * GET /api/cron/zeta-sync-saldos
 *
 * Cron Vercel — sincroniza saldos pendientes de todos los workspaces activos.
 * Frecuencia: cada 3 horas (vercel.json: "0 *\/3 * * *").
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET (enviado automáticamente por Vercel)
 * - Anti-overlap: skip si hay un run activo reciente en zeta_pipeline_runs
 * - Rate limiting conservador: 400ms/página, 600ms/cliente
 * - Retry: 3 intentos con backoff exponencial para errores de red/5xx
 *
 * Post-sync: reconciliación de orphans integrada vía syncMode="reconciliation_cleanup".
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";
import { withZetaRetry } from "@/lib/integrations/zeta/zeta-retry";
import {
  createPipelineRun,
  findActivePipelineRun,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";

const PIPELINE = ZETA_PIPELINE_NAMES.SALDOS;

// Rate limiting conservador (respeta límites de Zeta)
const MAX_CLIENTS_PER_WORKSPACE = 10;
const PAGE_DELAY_MS = 400;
const CLIENT_DELAY_MS = 600;
const MAX_PAGES_PER_CLIENT = 5;

// Anti-overlap: ventana de 3 horas (igual al intervalo del cron)
const ANTI_OVERLAP_WINDOW_MS = 3 * 60 * 60 * 1_000;

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
  clients_synced: number;
  rows_upserted: number;
  errors: number;
  reconciliation_closed?: number;
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

  const log = (kind: string, extra?: Record<string, unknown>) =>
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: PIPELINE,
        kind,
        cron_run_id: cronRunId,
        ...extra,
      })
    );

  log("cron_start");

  // ── Anti-overlap ─────────────────────────────────────────────────────────
  let activeRun: Awaited<ReturnType<typeof findActivePipelineRun>> = null;
  try {
    activeRun = await findActivePipelineRun(supabase, PIPELINE, ANTI_OVERLAP_WINDOW_MS);
  } catch (e) {
    log("anti_overlap_check_error", { error: String(e) });
    // No bloquear el cron si la tabla no existe aún
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
    // Continúa aunque falle el registry
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

  let totalProcessed = 0;
  let totalUpserted = 0;
  let totalFailed = 0;
  let totalReconciliationClosed = 0;
  const workspaceSummaries: WorkspaceSummary[] = [];

  // ── Procesar cada workspace ───────────────────────────────────────────────
  for (const workspaceId of workspaceIds) {
    const { data: companies, error: compErr } = await supabase
      .from("proto_companies")
      .select("id, Codigo")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .not("Codigo", "is", null)
      .limit(MAX_CLIENTS_PER_WORKSPACE);

    if (compErr) {
      log("companies_load_error", { workspace_id: workspaceId, error: compErr.message });
      totalFailed++;
      continue;
    }

    const eligible = ((companies ?? []) as { id: string; Codigo: string | null }[]).filter(
      (c) => c.Codigo?.trim()
    );

    let wsUpserted = 0;
    let wsErrors = 0;
    let wsReconciled = 0;

    for (let i = 0; i < eligible.length; i++) {
      const company = eligible[i]!;
      if (i > 0) await sleep(CLIENT_DELAY_MS);

      totalProcessed++;

      try {
        // Sync incremental con reconciliación de orphans integrada
        const result = await withZetaRetry(
          () =>
            runZetaSaldosPendientesPipeline(supabase, workspaceId, randomUUID(), {
              protoCompanyId: company.id,
              clienteCodigo: company.Codigo!.trim(),
              mode: "incremental",
              maxPagesPerRun: MAX_PAGES_PER_CLIENT,
              pageDelayMs: PAGE_DELAY_MS,
              syncMode: "reconciliation_cleanup",
            }),
          {
            maxRetries: 3,
            baseDelayMs: 1_000,
            maxDelayMs: 10_000,
            onRetry: (err, attempt, delayMs) => {
              log("client_retry", {
                workspace_id: workspaceId,
                company_id: company.id,
                attempt,
                delay_ms: delayMs,
                error: String(err),
              });
            },
          }
        );

        wsUpserted += result.rows_upserted;

        if (result.reconciliation) {
          wsReconciled += result.reconciliation.auto_closed;
        }

        if (
          result.stopped_reason !== "completed" &&
          result.stopped_reason !== "max_pages"
        ) {
          wsErrors++;
          totalFailed++;
          log("client_pipeline_error", {
            workspace_id: workspaceId,
            company_id: company.id,
            stopped_reason: result.stopped_reason,
            error_summary: result.error_summary,
          });
        }
      } catch (err) {
        wsErrors++;
        totalFailed++;
        log("client_exception", {
          workspace_id: workspaceId,
          company_id: company.id,
          error: String(err),
        });
      }
    }

    totalUpserted += wsUpserted;
    totalReconciliationClosed += wsReconciled;
    workspaceSummaries.push({
      workspace_id: workspaceId,
      clients_synced: eligible.length,
      rows_upserted: wsUpserted,
      errors: wsErrors,
      reconciliation_closed: wsReconciled,
    });
  }

  const duration = Date.now() - started;
  const finalStatus =
    totalFailed === 0 ? "succeeded" : totalUpserted > 0 ? "partial" : "failed";

  // ── Actualizar run registry ───────────────────────────────────────────────
  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: finalStatus,
      duration_ms: duration,
      rows_processed: totalProcessed,
      rows_updated: totalUpserted,
      rows_failed: totalFailed,
      error_summary: totalFailed > 0 ? `${totalFailed} clientes con error` : null,
      metadata: {
        cron_run_id: cronRunId,
        workspaces: workspaceIds.length,
        reconciliation_closed: totalReconciliationClosed,
        summaries: workspaceSummaries,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces: workspaceIds.length,
    total_processed: totalProcessed,
    total_upserted: totalUpserted,
    total_failed: totalFailed,
    reconciliation_closed: totalReconciliationClosed,
    status: finalStatus,
    duration_ms: duration,
  });

  return NextResponse.json({
    ok: totalFailed === 0,
    cron_run_id: cronRunId,
    pipeline_run_id: pipelineRunId,
    status: finalStatus,
    workspaces_processed: workspaceIds.length,
    total_processed: totalProcessed,
    total_upserted: totalUpserted,
    total_failed: totalFailed,
    reconciliation_closed: totalReconciliationClosed,
    duration_ms: duration,
    workspace_summaries: workspaceSummaries,
  });
}
