/**
 * GET /api/cron/zeta-sync-cuotas
 *
 * Cron Vercel — sincroniza cuotas pendientes (`RESTCuotasV1QueryCliente`)
 * de todos los workspaces activos. Frecuencia: cada 2 horas (vercel.json: "30 *\/2 * * *").
 *
 * Razón de ser:
 *   El pipeline de saldos solo provee `balance_amount` por factura. Esta ruta
 *   hidrata `proto_invoice_installments` con la fecha REAL de vencimiento por
 *   cuota (Zeta `CuotaVencimiento`) y, cuando linkea con `proto_invoices`,
 *   sobrescribe el `due_date` sintético (`issue_date + 30d`) por el real
 *   marcado como `due_date_source = 'zeta_cuotas_v1'`.
 *
 * Protecciones (mismo patrón que `zeta-sync-saldos`):
 *   - Auth: Bearer CRON_SECRET (lo envía Vercel automáticamente).
 *   - Anti-overlap: si hay un run activo dentro de la ventana, skip.
 *   - Rate limiting conservador (delays per-cliente y per-página).
 *
 * NO toca:
 *   - `proto_invoices.balance_amount` (responsabilidad de saldos).
 *   - Pipelines existentes.
 *   - Aplicaciones recibo↔factura (bloqueado por API Zeta).
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createCronLogger } from "@/lib/observability/cron-logger";
import { runZetaInstallmentsPipeline } from "@/lib/integrations/zeta/zeta-installments-pipeline";
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

const PIPELINE = ZETA_PIPELINE_NAMES.CUOTAS;

// Mismo cap que saldos (cobertura total Summer87 + margen). Configurable.
const DEFAULT_MAX_CLIENTS_PER_WORKSPACE = 200;
const MAX_CLIENTS_PER_WORKSPACE = (() => {
  const raw = process.env.ZETA_CUOTAS_CRON_MAX_CLIENTS_PER_WORKSPACE;
  if (!raw) return DEFAULT_MAX_CLIENTS_PER_WORKSPACE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CLIENTS_PER_WORKSPACE;
})();

const PAGE_DELAY_MS = 400;
const CLIENT_DELAY_MS = 600;
const MAX_PAGES_PER_CLIENT = 5;

// Anti-overlap: ventana = intervalo del cron (2h).
const ANTI_OVERLAP_WINDOW_MS = 2 * 60 * 60 * 1_000;

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
  rows_linked: number;
  rows_orphan: number;
  invoices_due_date_updated: number;
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

  let totalProcessed = 0;
  let totalUpserted = 0;
  let totalLinked = 0;
  let totalOrphan = 0;
  let totalDueDateUpdated = 0;
  let totalFailed = 0;
  const summaries: WorkspaceSummary[] = [];
  let workspacesTotal = 0;
  let workspacePageIndex = 0;
  let cursorAfterId: string | null = null;

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
    const { data: companies, error: compErr } = await supabase
      .from("proto_companies")
      .select("id, Codigo")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .not("Codigo", "is", null)
      .order("id", { ascending: true })
      .limit(MAX_CLIENTS_PER_WORKSPACE);

    if (compErr) {
      log("companies_load_error", { workspace_id: workspaceId, error: compErr.message });
      totalFailed++;
      continue;
    }

    const eligible = ((companies ?? []) as { id: string; Codigo: string | null }[]).filter(
      (c) => c.Codigo?.trim()
    );

    if (eligible.length >= MAX_CLIENTS_PER_WORKSPACE) {
      const { count: totalEligible } = await supabase
        .from("proto_companies")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .not("Codigo", "is", null);
      if ((totalEligible ?? 0) > MAX_CLIENTS_PER_WORKSPACE) {
        log("clients_cap_reached", {
          workspace_id: workspaceId,
          processed_clients: eligible.length,
          total_eligible_clients: totalEligible,
          cap: MAX_CLIENTS_PER_WORKSPACE,
          env_hint: "ZETA_CUOTAS_CRON_MAX_CLIENTS_PER_WORKSPACE",
        });
      }
    }

    let wsUpserted = 0;
    let wsLinked = 0;
    let wsOrphan = 0;
    let wsDueDate = 0;
    let wsErrors = 0;

    for (let i = 0; i < eligible.length; i++) {
      const company = eligible[i]!;
      if (i > 0) await sleep(CLIENT_DELAY_MS);

      totalProcessed++;

      try {
        const result = await withZetaRetry(
          () =>
            runZetaInstallmentsPipeline(supabase, workspaceId, randomUUID(), {
              clienteCodigo: company.Codigo!.trim(),
              maxPagesPerRun: MAX_PAGES_PER_CLIENT,
              pageDelayMs: PAGE_DELAY_MS,
              updateInvoiceDueDate: true,
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
        wsLinked += result.rows_linked;
        wsOrphan += result.rows_orphan;
        wsDueDate += result.invoices_due_date_updated;

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
            errors: result.errors,
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
    totalLinked += wsLinked;
    totalOrphan += wsOrphan;
    totalDueDateUpdated += wsDueDate;
    summaries.push({
      workspace_id: workspaceId,
      clients_synced: eligible.length,
      rows_upserted: wsUpserted,
      rows_linked: wsLinked,
      rows_orphan: wsOrphan,
      invoices_due_date_updated: wsDueDate,
      errors: wsErrors,
    });

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
    totalFailed === 0 ? "succeeded" : totalUpserted > 0 ? "partial" : "failed";

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
        workspaces: workspacesTotal,
        workspace_pages: workspacePageIndex,
        rows_linked: totalLinked,
        rows_orphan: totalOrphan,
        invoices_due_date_updated: totalDueDateUpdated,
        summaries,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces: workspacesTotal,
    total_processed: totalProcessed,
    total_upserted: totalUpserted,
    total_linked: totalLinked,
    total_orphan: totalOrphan,
    invoices_due_date_updated: totalDueDateUpdated,
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
    total_processed: totalProcessed,
    total_upserted: totalUpserted,
    total_linked: totalLinked,
    total_orphan: totalOrphan,
    invoices_due_date_updated: totalDueDateUpdated,
    total_failed: totalFailed,
    duration_ms: duration,
    workspace_summaries: summaries,
  });
}
