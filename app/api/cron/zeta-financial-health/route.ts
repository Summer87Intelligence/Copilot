/**
 * GET /api/cron/zeta-financial-health
 *
 * Cron Vercel — Financial Health Monitor para detección temprana de bugs financieros.
 * Frecuencia sugerida: diario a las 04:00 UTC (vercel.json: "0 4 * * *").
 *
 * Para cada workspace activo ejecuta 6 health checks:
 *   A) drift_detected          — audits Zeta/DB en las últimas 48h
 *   B) balance_overwrite       — facturas con balance=0 en estado no-pagado
 *   C) mixed_currency_ambiguity — facturas con deuda y currency_code NULL
 *   D) orphan_close_spike      — caída brusca de open_invoices_count vs ayer
 *   E) sync_truncation         — pipelines que alcanzaron el ROW_CAP
 *   F) missing_customers       — company_ids con deuda sin proto_company
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay un run activo reciente en zeta_pipeline_runs
 * - Severidad global persistida en zeta_sync_metrics por workspace
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCronLogger } from "@/lib/observability/cron-logger";

import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import {
  createPipelineRun,
  expireStaleFleetPipelineRuns,
  findActivePipelineRun,
  touchPipelineRunHeartbeat,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { recordSyncMetric } from "@/lib/observability/zeta-sync-metrics";
import { runFinancialHealthChecks } from "@/lib/copilot-financial-health";
import { dispatchHealthAlerts, createDashboardAdapter } from "@/lib/copilot-financial-health-alerting";

const PIPELINE = "zeta-financial-health";
const ANTI_OVERLAP_WINDOW_MS = 6 * 60 * 60 * 1_000;
const WORKSPACE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
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

  log("cron_start", { pipeline: PIPELINE });

  // ── Anti-overlap ──────────────────────────────────────────────────────────
  try {
    const closed = await expireStaleFleetPipelineRuns(supabase);
    if (closed > 0) log("stale_runs_closed", { count: closed });
  } catch (e) {
    log("expire_stale_error", { error: String(e) });
  }

  let activeRun: Awaited<ReturnType<typeof findActivePipelineRun>> = null;
  try {
    activeRun = await findActivePipelineRun(supabase, PIPELINE, ANTI_OVERLAP_WINDOW_MS, {
      workspaceScope: "fleet",
    });
  } catch {
    // tabla puede no existir; continuar
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
      metadata: { cron_run_id: cronRunId },
    });
    pipelineRunId = created.id;
  } catch (e) {
    log("pipeline_run_create_error", { error: String(e) });
  }

  const adapters = [createDashboardAdapter()];

  let workspacesTotal = 0;
  let totalCritical = 0;
  let totalWarning = 0;
  let cursorAfterId: string | null = null;

  // ── Workspace loop ────────────────────────────────────────────────────────
  while (true) {
    let page: { ids: string[]; nextAfterId: string | null };
    try {
      page = await fetchActiveWorkspaceIdPage(supabase, cursorAfterId);
    } catch (e) {
      log("workspace_page_error", { error: String(e) });
      break;
    }

    if (page.ids.length === 0) break;

    for (const workspaceId of page.ids) {
      if (workspacesTotal > 0) await sleep(WORKSPACE_DELAY_MS);
      workspacesTotal++;

      if (pipelineRunId) {
        await touchPipelineRunHeartbeat(supabase, pipelineRunId).catch(() => {});
      }

      let report;
      try {
        report = await runFinancialHealthChecks(supabase, workspaceId);
      } catch (e) {
        log("health_check_error", { workspace_id: workspaceId, error: String(e) });
        continue;
      }

      // ── Persistir severidad global como métrica ───────────────────────────
      const severityScore = report.severity === "critical" ? 2 : report.severity === "warning" ? 1 : 0;
      await recordSyncMetric(supabase, PIPELINE, workspaceId, "health_severity_score", severityScore, {
        severity: report.severity,
        duration_ms: report.durationMs,
      }).catch(() => {});

      // Persistir count de checks por severidad
      const criticalChecks = report.checks.filter((c) => c.severity === "critical").length;
      const warningChecks = report.checks.filter((c) => c.severity === "warning").length;

      if (criticalChecks > 0) {
        await recordSyncMetric(supabase, PIPELINE, workspaceId, "health_critical_checks", criticalChecks, {
          codes: report.checks.filter((c) => c.severity === "critical").map((c) => c.code).join(","),
        }).catch(() => {});
      }

      // ── Dispatchar alertas (solo warning/critical) ────────────────────────
      await dispatchHealthAlerts(report, adapters).catch(() => {});

      if (report.severity === "critical") totalCritical++;
      if (report.severity === "warning") totalWarning++;

      log("workspace_done", {
        workspace_id: workspaceId,
        severity: report.severity,
        critical_checks: criticalChecks,
        warning_checks: warningChecks,
        duration_ms: report.durationMs,
      });
    }

    cursorAfterId = page.nextAfterId;
    if (!cursorAfterId) break;
  }

  // ── Finalizar run ─────────────────────────────────────────────────────────
  const duration = Date.now() - started;

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: totalCritical > 0 ? "partial" : "succeeded",
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      rows_processed: workspacesTotal,
      metadata: {
        workspaces_total: workspacesTotal,
        workspaces_critical: totalCritical,
        workspaces_warning: totalWarning,
      },
    }).catch(() => {});
  }

  log("cron_end", {
    duration_ms: duration,
    workspaces: workspacesTotal,
    critical: totalCritical,
    warning: totalWarning,
  });

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    workspaces_total: workspacesTotal,
    workspaces_critical: totalCritical,
    workspaces_warning: totalWarning,
  });
}
