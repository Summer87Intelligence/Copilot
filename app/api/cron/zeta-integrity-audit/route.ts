/**
 * GET /api/cron/zeta-integrity-audit
 *
 * Cron Vercel especializado — corre el detector central de unicidad Zeta
 * (sombras `ZETA:{RegistroId}` vs CCV1) por workspace activo, registra las
 * violaciones en `zeta_integrity_violations` y emite un breakdown por mes
 * para observabilidad operativa.
 *
 * Es un cron **separado** del más amplio `zeta-integrity-check`:
 *   - `zeta-integrity-check` corre toda la batería (balance>total, currency
 *     null, duplicate_number, etc.) diaria a las 04:00 UTC.
 *   - `zeta-integrity-audit` corre SOLO el detector de sombras duplicadas
 *     con cadencia más fina y reporta un breakdown mensual de los últimos
 *     12 meses, sin las otras dimensiones. Útil para alertar antes de que
 *     la sombra inflada llegue al motor financiero.
 *
 * Frecuencia recomendada: diaria a las 04:30 UTC (después de
 * `zeta-integrity-check`). Configurar en `vercel.json`:
 *
 *     { "path": "/api/cron/zeta-integrity-audit", "schedule": "30 4 * * *" }
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay un run activo en `zeta_pipeline_runs`
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
import {
  resolveStaleIntegrityViolations,
  upsertIntegrityViolation,
} from "@/lib/data/zeta-enterprise-sync-repository";
import { findActiveShadowDuplicatesInPeriod } from "@/lib/integrations/zeta/zeta-shadow-uniqueness-detector";
import type { IntegrityViolation } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

const PIPELINE = "zeta-integrity-audit";
const ANTI_OVERLAP_WINDOW_MS = 6 * 60 * 60 * 1_000;
const WORKSPACE_DELAY_MS = 600;

/** Ventana de scan: últimos 365 días + 30 hacia el futuro (issue_date futura). */
const SHADOW_SCAN_LOOKBACK_DAYS = 365;
const SHADOW_SCAN_LOOKAHEAD_DAYS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthOf(ymdStr: string): string {
  return ymdStr.slice(0, 7);
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

  let totalDuplicates = 0;
  let totalCritical = 0;
  let totalReview = 0;
  let totalNewViolations = 0;
  let workspacesTotal = 0;
  let cursorAfterId: string | null = null;

  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - SHADOW_SCAN_LOOKBACK_DAYS);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + SHADOW_SCAN_LOOKAHEAD_DAYS);
  const fromYmd = ymd(from);
  const toYmd = ymd(to);

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
        const duplicates = await findActiveShadowDuplicatesInPeriod(
          supabase,
          workspaceId,
          { from: fromYmd, to: toYmd }
        );

        const byMonth = new Map<string, number>();
        for (const d of duplicates) {
          byMonth.set(monthOf(d.issue_date), (byMonth.get(monthOf(d.issue_date)) ?? 0) + 1);
        }

        const critical = duplicates.filter((d) => !d.review_required);
        const review = duplicates.filter((d) => d.review_required);

        totalDuplicates += duplicates.length;
        totalCritical += critical.length;
        totalReview += review.length;

        const foundKeys = new Set<string>();
        let newCount = 0;
        for (const d of duplicates.slice(0, 200)) {
          foundKeys.add(d.shadow_id);
          const matched = d.candidates[0];
          const violation: IntegrityViolation = {
            check_name: "invoice_shadow_duplicate_ccv1",
            entity: "invoices",
            record_id: d.shadow_id,
            record_key: d.shadow_invoice_number,
            description: d.review_required
              ? `Sombra ZETA:{RegistroId} con CCV1 gemela — REVIEW_REQUIRED (${d.currency_code} ${d.total_amount} ${d.issue_date})`
              : `Sombra ZETA:{RegistroId} duplica CCV1 ${matched?.invoice_number ?? "?"} (${d.currency_code} ${d.total_amount} ${d.issue_date})`,
            severity: d.review_required ? "info" : "critical",
            metadata: {
              currency_code: d.currency_code,
              total_amount: d.total_amount,
              issue_date: d.issue_date,
              company_id: d.company_id,
              candidate_count: d.candidates.length,
              matched_ccv1_invoice_number: matched?.invoice_number ?? null,
              matched_ccv1_invoice_id: matched?.invoice_id ?? null,
              review_required: d.review_required,
              detected_by: PIPELINE,
            },
          };
          const result = await upsertIntegrityViolation(supabase, workspaceId, violation);
          if (result?.isNew) newCount++;
        }

        const resolved = await resolveStaleIntegrityViolations(
          supabase,
          workspaceId,
          "invoice_shadow_duplicate_ccv1",
          foundKeys
        );

        totalNewViolations += newCount;

        log("workspace_shadow_audit_done", {
          workspace_id: workspaceId,
          duplicates_total: duplicates.length,
          duplicates_critical: critical.length,
          duplicates_review: review.length,
          violations_new: newCount,
          violations_resolved: resolved,
          by_month: Object.fromEntries(byMonth),
        });
      } catch (err) {
        log("workspace_shadow_audit_error", { workspace_id: workspaceId, error: String(err) });
      }
    }

    cursorAfterId = page.nextAfterId;
    if (!cursorAfterId) break;
  }

  const duration = Date.now() - started;

  if (pipelineRunId) {
    await updatePipelineRun(supabase, pipelineRunId, {
      status: totalCritical > 0 ? "partial" : "succeeded",
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      rows_processed: totalDuplicates,
      rows_updated: totalNewViolations,
      metadata: {
        workspaces_total: workspacesTotal,
        duplicates_total: totalDuplicates,
        duplicates_critical: totalCritical,
        duplicates_review_required: totalReview,
        violations_new: totalNewViolations,
        scan_range: { from: fromYmd, to: toYmd },
      },
    }).catch(() => {});
  }

  log("cron_end", {
    duration_ms: duration,
    workspaces: workspacesTotal,
    duplicates_total: totalDuplicates,
    duplicates_critical: totalCritical,
    duplicates_review_required: totalReview,
    violations_new: totalNewViolations,
  });

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    workspaces_total: workspacesTotal,
    duplicates_total: totalDuplicates,
    duplicates_critical: totalCritical,
    duplicates_review_required: totalReview,
    violations_new: totalNewViolations,
    scan_range: { from: fromYmd, to: toYmd },
  });
}
