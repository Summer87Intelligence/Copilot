/**
 * GET /api/cron/zeta-completeness-audit
 *
 * Cron Vercel — audita completeness de facturas y recibos vs Zeta.
 * Frecuencia: diario a las 03:30 UTC (vercel.json: "30 3 * * *").
 *
 * Para cada workspace activo, audita el mes actual y el mes anterior:
 * - Facturas (invoices): compara conteo Zeta vs local, detecta missing RegistroIds
 * - Recibos (receipts): compara RegistroIds precisamente
 * - Si severity = "critical" (>5% drift): dispara re-sync automático del período
 *
 * Protecciones:
 * - Auth: Bearer CRON_SECRET
 * - Anti-overlap: skip si hay un run activo reciente en zeta_pipeline_runs
 * - Rate limiting: 800ms entre workspaces, 1s entre entidades
 * - Zeta calls solo read-only (fetch + count)
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
  runContactCompletenessAudit,
  runInvoiceCompletenessAudit,
  runReceiptCompletenessAudit,
  getAuditMonths,
} from "@/lib/integrations/zeta/zeta-completeness-audit";
import {
  insertCompletenessAudit,
  createResyncJob,
} from "@/lib/data/zeta-enterprise-sync-repository";
import { recordDriftMetric } from "@/lib/observability/zeta-sync-metrics";
import { isOperationalCriticalAudit } from "@/lib/integrations/zeta/zeta-completeness-audit-operational";

const PIPELINE = "zeta-completeness-audit";
const ANTI_OVERLAP_WINDOW_MS = 6 * 60 * 60 * 1_000;
const WORKSPACE_DELAY_MS = 800;
const ENTITY_DELAY_MS = 1_000;

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

  const auditMonths = getAuditMonths();
  let totalAudits = 0;
  let totalCritical = 0;
  let totalResyncTriggered = 0;
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

      let wsAudits = 0;
      let wsCritical = 0;

      if (pipelineRunId) {
        await touchPipelineRunHeartbeat(supabase, pipelineRunId).catch(() => {});
      }

      // ── Auditar cada mes ── ──────────────────────────────────────────────
      for (const { mes, anio } of auditMonths) {
        // Invoices
        try {
          const invoiceAudit = await runInvoiceCompletenessAudit(supabase, workspaceId, mes, anio);
          const auditRow = await insertCompletenessAudit(supabase, workspaceId, invoiceAudit);
          wsAudits++;

          log("audit_complete", {
            workspace_id: workspaceId,
            entity: "invoices",
            mes,
            anio,
            zeta_count: invoiceAudit.zeta_count,
            local_count: invoiceAudit.local_count,
            drift: invoiceAudit.drift,
            severity: invoiceAudit.severity,
            ...(invoiceAudit.metadata?.legacy_untraceable_count
              ? { legacy_untraceable_count: invoiceAudit.metadata.legacy_untraceable_count }
              : {}),
          });

          await recordDriftMetric(supabase, PIPELINE, workspaceId, "invoices", invoiceAudit.drift, invoiceAudit.severity, { mes, anio }).catch(() => {});

          if (isOperationalCriticalAudit(invoiceAudit) && auditRow) {
            wsCritical++;
            // Registrar re-sync job (lo ejecuta el operator manualmente o un futuro cron)
            await createResyncJob(supabase, {
              workspace_company_id: workspaceId,
              entity: "invoices",
              scope: invoiceAudit.audit_scope,
              triggered_by: "completeness_audit",
              metadata: {
                audit_id: auditRow.id,
                missing_count: invoiceAudit.missing_registro_ids.length,
                drift: invoiceAudit.drift,
              },
            });
            totalResyncTriggered++;
            log("resync_job_created", {
              workspace_id: workspaceId,
              entity: "invoices",
              scope: invoiceAudit.audit_scope,
              missing: invoiceAudit.missing_registro_ids.length,
            });
          }
        } catch (err) {
          log("invoice_audit_error", { workspace_id: workspaceId, mes, anio, error: String(err) });
        }

        await sleep(ENTITY_DELAY_MS);

        // Receipts
        try {
          const receiptAudit = await runReceiptCompletenessAudit(supabase, workspaceId, mes, anio);
          const auditRow = await insertCompletenessAudit(supabase, workspaceId, receiptAudit);
          wsAudits++;

          log("audit_complete", {
            workspace_id: workspaceId,
            entity: "receipts",
            mes,
            anio,
            zeta_count: receiptAudit.zeta_count,
            local_count: receiptAudit.local_count,
            drift: receiptAudit.drift,
            severity: receiptAudit.severity,
            missing_ids: receiptAudit.missing_registro_ids.slice(0, 10),
          });

          await recordDriftMetric(supabase, PIPELINE, workspaceId, "receipts", receiptAudit.drift, receiptAudit.severity, { mes, anio }).catch(() => {});

          if (isOperationalCriticalAudit(receiptAudit) && auditRow) {
            wsCritical++;
            await createResyncJob(supabase, {
              workspace_company_id: workspaceId,
              entity: "receipts",
              scope: receiptAudit.audit_scope,
              triggered_by: "completeness_audit",
              metadata: {
                audit_id: auditRow.id,
                missing_ids: receiptAudit.missing_registro_ids.slice(0, 50),
                drift: receiptAudit.drift,
              },
            });
            totalResyncTriggered++;
          }
        } catch (err) {
          log("receipt_audit_error", { workspace_id: workspaceId, mes, anio, error: String(err) });
        }
      }

      // ── Contacts (global scope — one audit per workspace, not per month) ──────
      try {
        await sleep(ENTITY_DELAY_MS);
        const contactAudit = await runContactCompletenessAudit(supabase, workspaceId);
        await insertCompletenessAudit(supabase, workspaceId, contactAudit);
        wsAudits++;

        log("audit_complete", {
          workspace_id: workspaceId,
          entity: "contacts",
          zeta_count: contactAudit.zeta_count,
          local_count: contactAudit.local_count,
          drift: contactAudit.drift,
          severity: contactAudit.severity,
        });

        await recordDriftMetric(supabase, PIPELINE, workspaceId, "contacts", contactAudit.drift, contactAudit.severity).catch(() => {});
      } catch (err) {
        log("contact_audit_error", { workspace_id: workspaceId, error: String(err) });
      }

      totalAudits += wsAudits;
      totalCritical += wsCritical;

      log("workspace_done", {
        workspace_id: workspaceId,
        audits: wsAudits,
        critical: wsCritical,
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
      rows_processed: totalAudits,
      metadata: {
        workspaces_total: workspacesTotal,
        audits_total: totalAudits,
        critical_detected: totalCritical,
        resync_jobs_created: totalResyncTriggered,
      },
    }).catch(() => {});
  }

  log("cron_end", {
    duration_ms: duration,
    workspaces: workspacesTotal,
    audits: totalAudits,
    critical: totalCritical,
    resync_jobs: totalResyncTriggered,
  });

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    workspaces_total: workspacesTotal,
    audits_total: totalAudits,
    critical_detected: totalCritical,
    resync_jobs_created: totalResyncTriggered,
  });
}
