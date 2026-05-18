/**
 * GET /api/cron/zeta-orphan-metadata-repair
 *
 * Limpia metadata orphan obsoleta (missing_count > 0 en facturas ya cerradas).
 * Idempotente, multi-tenant, seguro post-sync financiero.
 *
 * Schedule: cada 6 h (vercel.json).
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import { createCronLogger } from "@/lib/observability/cron-logger";
import { repairStaleOrphanInvoiceMetadata } from "@/lib/integrations/zeta/zeta-orphan-auto-repair";
import {
  createPipelineRun,
  expireStaleFleetPipelineRuns,
  findActivePipelineRun,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";

const PIPELINE = "zeta-orphan-metadata-repair";
const ANTI_OVERLAP_WINDOW_MS = 6 * 60 * 60 * 1_000;

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
    return NextResponse.json(
      { ok: false, code: "CONFIG_ERROR", message: "Supabase config faltante." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cronRunId = randomUUID();
  const started = Date.now();
  const log = createCronLogger(PIPELINE, cronRunId);

  log("cron_start", {});

  try {
    const closed = await expireStaleFleetPipelineRuns(supabase);
    if (closed > 0) log("stale_fleet_runs_closed", { count: closed });
  } catch (e) {
    log("expire_stale_runs_error", { error: String(e) });
  }

  const activeRun = await findActivePipelineRun(
    supabase,
    PIPELINE,
    ANTI_OVERLAP_WINDOW_MS,
    { workspaceScope: "fleet" }
  ).catch(() => null);

  if (activeRun) {
    log("cron_skipped_overlap", { run_id: activeRun.id });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "already_running",
      cron_run_id: cronRunId,
    });
  }

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

  let totalRepaired = 0;
  let totalScanned = 0;
  let totalErrors = 0;
  let workspaces = 0;
  let cursorAfterId: string | null = null;

  for (;;) {
    const page = await fetchActiveWorkspaceIdPage(supabase, cursorAfterId);
    if (page.ids.length === 0 && cursorAfterId === null) break;

    for (const workspaceId of page.ids) {
      workspaces++;
      const repair = await repairStaleOrphanInvoiceMetadata(supabase, workspaceId, {
        requestId: cronRunId,
      });
      totalScanned += repair.scanned;
      totalRepaired += repair.repaired;
      totalErrors += repair.db_errors;
    }

    cursorAfterId = page.nextAfterId;
    if (cursorAfterId == null) break;
  }

  const duration = Date.now() - started;
  const status = totalErrors > 0 ? "partial" : "succeeded";

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status,
      duration_ms: duration,
      rows_processed: totalScanned,
      rows_updated: totalRepaired,
      rows_failed: totalErrors,
      metadata: {
        cron_run_id: cronRunId,
        workspaces,
        repaired: totalRepaired,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces,
    scanned: totalScanned,
    repaired: totalRepaired,
    db_errors: totalErrors,
    duration_ms: duration,
  });

  return NextResponse.json({
    ok: totalErrors === 0,
    cron_run_id: cronRunId,
    pipeline_run_id: pipelineRunId,
    status,
    workspaces_processed: workspaces,
    scanned: totalScanned,
    repaired: totalRepaired,
    db_errors: totalErrors,
    duration_ms: duration,
  });
}
