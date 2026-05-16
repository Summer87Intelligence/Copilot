/**
 * GET /api/cron/zeta-integrity-check
 *
 * Cron Vercel — ejecuta checks de integridad de datos financieros locales.
 * Frecuencia: diario a las 04:00 UTC (vercel.json: "0 4 * * *").
 *
 * Checks internos (sin llamar Zeta):
 * - Facturas con balance > total (imposible contablemente)
 * - Facturas Zeta sin currency_code
 * - Facturas pendientes sin balance_amount (saldos cron no las procesó)
 * - Números de factura duplicados
 * - Recibos sin currency_code
 * - Recibos con monto <= 0
 * - Cuotas huérfanas sin invoice_id (>24h)
 * - Cuotas vencidas con factura abierta
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay un run activo
 * - Rate limiting: 600ms entre workspaces
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
import { runAllIntegrityChecks } from "@/lib/integrations/zeta/zeta-integrity-checker";

const PIPELINE = "zeta-integrity-check";
const ANTI_OVERLAP_WINDOW_MS = 20 * 60 * 60 * 1_000; // 20h
const WORKSPACE_DELAY_MS = 600;

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
    // tabla puede no existir aún; continuar
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

  let totalViolations = 0;
  let totalNewViolations = 0;
  let totalCritical = 0;
  let workspacesTotal = 0;
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

      try {
        const checkResults = await runAllIntegrityChecks(supabase, workspaceId);

        const wsViolations = checkResults.reduce((s, r) => s + r.violations_found, 0);
        const wsNew = checkResults.reduce((s, r) => s + r.violations_new, 0);
        const wsCritical = checkResults.reduce((s, r) => s + r.violations_critical, 0);
        const wsErrors = checkResults.filter((r) => r.error).map((r) => r.check_name);

        totalViolations += wsViolations;
        totalNewViolations += wsNew;
        totalCritical += wsCritical;

        log("workspace_integrity_done", {
          workspace_id: workspaceId,
          violations_found: wsViolations,
          violations_new: wsNew,
          critical_violations: wsCritical,
          errored_checks: wsErrors,
          check_summary: checkResults.map((r) => ({
            check: r.check_name,
            found: r.violations_found,
            new: r.violations_new,
            critical: r.violations_critical,
            error: r.error ?? null,
          })),
        });
      } catch (err) {
        log("workspace_integrity_error", { workspace_id: workspaceId, error: String(err) });
      }
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
      rows_processed: totalViolations,
      rows_updated: totalNewViolations,
      metadata: {
        workspaces_total: workspacesTotal,
        violations_total: totalViolations,
        violations_new: totalNewViolations,
        critical_violations: totalCritical,
      },
    }).catch(() => {});
  }

  log("cron_end", {
    duration_ms: duration,
    workspaces: workspacesTotal,
    violations: totalViolations,
    new_violations: totalNewViolations,
    critical_violations: totalCritical,
  });

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    workspaces_total: workspacesTotal,
    violations_total: totalViolations,
    violations_new: totalNewViolations,
    critical_violations: totalCritical,
  });
}
