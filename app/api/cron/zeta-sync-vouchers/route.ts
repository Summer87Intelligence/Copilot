/**
 * GET /api/cron/zeta-sync-vouchers
 *
 * Cron Vercel — sincroniza comprobantes (vouchers) de todos los workspaces activos.
 * Frecuencia: cada 6 horas (vercel.json: "0 *\/6 * * *").
 *
 * Estrategia de período:
 * - Sincroniza el mes actual y el mes anterior para cubrir facturas tardías.
 * - Solo facturas dentro del período operativo 2026 (jan 2026+).
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay un run activo
 * - Rate limiting: 500ms entre workspaces, 1s entre meses del mismo workspace
 * - Retry: 3 intentos con backoff para errores de red/5xx
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { syncZetaCustomerVouchers } from "@/lib/integrations/zeta/zeta-customer-vouchers-pipeline";
import { withZetaRetry } from "@/lib/integrations/zeta/zeta-retry";
import {
  createPipelineRun,
  findActivePipelineRun,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";

const PIPELINE = ZETA_PIPELINE_NAMES.VOUCHERS;

// Retraso entre workspaces y entre meses (conservador)
const WORKSPACE_DELAY_MS = 500;
const MONTH_DELAY_MS = 1_000;

// Anti-overlap: ventana de 6 horas (igual al intervalo del cron)
const ANTI_OVERLAP_WINDOW_MS = 6 * 60 * 60 * 1_000;

// Período operativo mínimo: no sincronizar antes de enero 2026
const OPERATIONAL_START_YEAR = 2026;
const OPERATIONAL_START_MONTH = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Devuelve { mes, anio } del mes actual y del anterior, respetando el período operativo. */
function getSyncMonths(): Array<{ mes: string; anio: string }> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const months: Array<{ mes: string; anio: string }> = [
    { mes: String(currentMonth), anio: String(currentYear) },
  ];

  // Mes anterior
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }

  // Respetar período operativo: no ir antes de enero 2026
  const isBeforeOperational =
    prevYear < OPERATIONAL_START_YEAR ||
    (prevYear === OPERATIONAL_START_YEAR && prevMonth < OPERATIONAL_START_MONTH);

  if (!isBeforeOperational) {
    months.push({ mes: String(prevMonth), anio: String(prevYear) });
  }

  return months;
}

type WorkspaceSummary = {
  workspace_id: string;
  months_synced: number;
  rows_processed: number;
  rows_updated: number;
  errors: number;
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
  const syncMonths = getSyncMonths();

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

  log("cron_start", { months: syncMonths });

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
      metadata: { cron_run_id: cronRunId, months: syncMonths },
    });
    pipelineRunId = created.id;
  } catch (e) {
    log("pipeline_run_create_error", { error: String(e) });
  }

  // ── Cargar workspaces activos ─────────────────────────────────────────────
  const { data: workspaces, error: wsErr } = await supabase
    .from("companies")
    .select("id")
    .eq("is_active", true)
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
  let totalUpdated = 0;
  let totalFailed = 0;
  const workspaceSummaries: WorkspaceSummary[] = [];

  // ── Procesar cada workspace ───────────────────────────────────────────────
  for (let wi = 0; wi < workspaceIds.length; wi++) {
    const workspaceId = workspaceIds[wi]!;
    if (wi > 0) await sleep(WORKSPACE_DELAY_MS);

    let wsProcessed = 0;
    let wsUpdated = 0;
    let wsErrors = 0;
    let monthsSynced = 0;

    for (let mi = 0; mi < syncMonths.length; mi++) {
      const { mes, anio } = syncMonths[mi]!;
      if (mi > 0) await sleep(MONTH_DELAY_MS);

      const requestId = randomUUID();

      try {
        const outcome = await withZetaRetry(
          () =>
            syncZetaCustomerVouchers({
              supabase,
              workspaceCompanyId: workspaceId,
              ctx: { requestId, tenantId: workspaceId },
              filters: { mes, anio },
            }),
          {
            maxRetries: 3,
            baseDelayMs: 1_000,
            maxDelayMs: 15_000,
            onRetry: (err, attempt, delayMs) => {
              log("workspace_month_retry", {
                workspace_id: workspaceId,
                mes,
                anio,
                attempt,
                delay_ms: delayMs,
                error: String(err),
              });
            },
          }
        );

        wsProcessed += outcome.processed ?? 0;
        wsUpdated += (outcome.updated ?? 0) + (outcome.inserted ?? 0);
        if (!outcome.success || (outcome.errors ?? 0) > 0) {
          wsErrors++;
          totalFailed++;
          log("workspace_month_error", {
            workspace_id: workspaceId,
            mes,
            anio,
            error: outcome.error ?? outcome.message,
          });
        } else {
          monthsSynced++;
        }
      } catch (err) {
        wsErrors++;
        totalFailed++;
        log("workspace_month_exception", {
          workspace_id: workspaceId,
          mes,
          anio,
          error: String(err),
        });
      }
    }

    totalProcessed += wsProcessed;
    totalUpdated += wsUpdated;
    workspaceSummaries.push({
      workspace_id: workspaceId,
      months_synced: monthsSynced,
      rows_processed: wsProcessed,
      rows_updated: wsUpdated,
      errors: wsErrors,
    });
  }

  const duration = Date.now() - started;
  const finalStatus =
    totalFailed === 0 ? "succeeded" : totalUpdated > 0 ? "partial" : "failed";

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: finalStatus,
      duration_ms: duration,
      rows_processed: totalProcessed,
      rows_updated: totalUpdated,
      rows_failed: totalFailed,
      error_summary: totalFailed > 0 ? `${totalFailed} workspace/mes con error` : null,
      metadata: {
        cron_run_id: cronRunId,
        workspaces: workspaceIds.length,
        months: syncMonths,
        summaries: workspaceSummaries,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces: workspaceIds.length,
    months: syncMonths,
    total_processed: totalProcessed,
    total_updated: totalUpdated,
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
    months_synced: syncMonths,
    total_processed: totalProcessed,
    total_updated: totalUpdated,
    total_failed: totalFailed,
    duration_ms: duration,
    workspace_summaries: workspaceSummaries,
  });
}
