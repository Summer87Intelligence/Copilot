/**
 * GET /api/cron/zeta-daily-snapshot
 *
 * ZETA-16 — Captura un snapshot operacional diario por workspace.
 * Frecuencia: diario a las 02:00 UTC (vercel.json: "0 2 * * *").
 *
 * Por workspace activo, persiste:
 * - Conteos actuales de invoices, receipts, contacts, cuotas
 * - Métricas operacionales del día (sync runs, errores, violations)
 * - Cola de resync jobs
 *
 * Idempotente: upsert por (workspace_company_id, snapshot_date).
 * Re-ejecutar el mismo día actualiza el row existente.
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay run activo reciente
 * - Rate limiting: 300ms entre workspaces
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createCronLogger } from "@/lib/observability/cron-logger";
import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import {
  createPipelineRun,
  expireStaleFleetPipelineRuns,
  findActivePipelineRun,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { upsertDailySnapshot } from "@/lib/data/zeta-daily-snapshot-repository";

const PIPELINE = "zeta-daily-snapshot";
const ANTI_OVERLAP_WINDOW_MS = 20 * 60 * 60 * 1_000; // 20h
const WORKSPACE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function sinceStartOfDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function buildSnapshot(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Parameters<typeof upsertDailySnapshot>[1]> {
  const today = todayDate();
  const dayStart = sinceStartOfDay();

  // Entity counts (parallel)
  const [invoicesRes, receiptsRes, contactsRes, cuotasRes, openInvoicesRes] = await Promise.all([
    supabase
      .from("proto_invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .eq("is_active", true),
    supabase
      .from("proto_receipts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", workspaceId)
      .like("receipt_number", "ZETA:COB:%")
      .eq("is_active", true),
    supabase
      .from("proto_contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true),
    supabase
      .from("proto_invoice_installments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", workspaceId),
    supabase
      .from("proto_invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .eq("is_active", true)
      .eq("status", "pending"),
  ]);

  // Operational metrics for today
  const [syncRunsRes, syncErrorsRes, violationsRes, critViolRes, jobsCompletedRes, jobsFailedRes, deadLetterRes] =
    await Promise.all([
      supabase
        .from("zeta_pipeline_runs")
        .select("id", { count: "exact", head: true })
        .gte("started_at", dayStart),
      supabase
        .from("zeta_pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("started_at", dayStart),
      supabase
        .from("zeta_integrity_violations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", workspaceId)
        .eq("status", "open"),
      supabase
        .from("zeta_integrity_violations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", workspaceId)
        .eq("status", "open")
        .eq("severity", "critical"),
      supabase
        .from("zeta_resync_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", workspaceId)
        .eq("status", "completed")
        .gte("completed_at", dayStart),
      supabase
        .from("zeta_resync_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", workspaceId)
        .eq("status", "failed")
        .gte("completed_at", dayStart),
      supabase
        .from("zeta_resync_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", workspaceId)
        .eq("status", "dead_letter"),
    ]);

  return {
    workspace_company_id: workspaceId,
    snapshot_date: today,
    invoices_count: invoicesRes.count ?? null,
    receipts_count: receiptsRes.count ?? null,
    contacts_count: contactsRes.count ?? null,
    cuotas_count: cuotasRes.count ?? null,
    open_invoices_count: openInvoicesRes.count ?? null,
    total_balance_pending: null, // balance is Zeta's domain — don't compute locally
    sync_runs_today: syncRunsRes.count ?? 0,
    sync_errors_today: syncErrorsRes.count ?? 0,
    integrity_violations_open: violationsRes.count ?? 0,
    critical_violations_open: critViolRes.count ?? 0,
    resync_jobs_completed: jobsCompletedRes.count ?? 0,
    resync_jobs_failed: jobsFailedRes.count ?? 0,
    dead_letter_jobs: deadLetterRes.count ?? 0,
    metadata: { snapshot_date: today, snapshot_time: new Date().toISOString() },
  };
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

  log("cron_start", { pipeline: PIPELINE, date: todayDate() });

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

  let pipelineRunId: string | null = null;
  try {
    const created = await createPipelineRun(supabase, {
      pipeline_name: PIPELINE,
      metadata: { cron_run_id: cronRunId, date: todayDate() },
    });
    pipelineRunId = created.id;
  } catch (e) {
    log("pipeline_run_create_error", { error: String(e) });
  }

  let snapshotsTotal = 0;
  let snapshotsError = 0;
  let cursorAfterId: string | null = null;

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
      if (snapshotsTotal > 0) await sleep(WORKSPACE_DELAY_MS);

      try {
        const snapshotInput = await buildSnapshot(supabase, workspaceId);
        const row = await upsertDailySnapshot(supabase, snapshotInput);
        snapshotsTotal++;

        log("snapshot_saved", {
          workspace_id: workspaceId,
          date: snapshotInput.snapshot_date,
          invoices: snapshotInput.invoices_count,
          contacts: snapshotInput.contacts_count,
          critical_violations: snapshotInput.critical_violations_open,
          saved: !!row,
        });
      } catch (err) {
        snapshotsError++;
        log("snapshot_error", { workspace_id: workspaceId, error: String(err) });
      }
    }

    cursorAfterId = page.nextAfterId;
    if (!cursorAfterId) break;
  }

  const duration = Date.now() - started;

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: snapshotsError > 0 ? "partial" : "succeeded",
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      rows_processed: snapshotsTotal,
      metadata: { snapshots_ok: snapshotsTotal, snapshots_error: snapshotsError },
    }).catch(() => {});
  }

  log("cron_end", { duration_ms: duration, snapshots_total: snapshotsTotal, snapshots_error: snapshotsError });

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    snapshots_total: snapshotsTotal,
    snapshots_error: snapshotsError,
  });
}
