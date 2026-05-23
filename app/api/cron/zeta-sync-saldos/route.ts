/**
 * GET /api/cron/zeta-sync-saldos
 *
 * Cron Vercel — sincroniza saldos pendientes de todos los workspaces activos.
 * Frecuencia: cada 2 horas (vercel.json: "0 *\/2 * * *").
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
import { createCronLogger } from "@/lib/observability/cron-logger";

import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";
import { withZetaRetry } from "@/lib/integrations/zeta/zeta-retry";
import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import {
  queryFacturaClienteSaldosPendientes,
} from "@/lib/integrations/zeta/zeta-factura-cliente";
import {
  extractUnknownCodigosFromSaldosRows,
  ensureProtoCompanyForZetaCodigo,
} from "@/lib/integrations/zeta/zeta-company-autocreate";
import {
  createPipelineRun,
  expireStaleFleetPipelineRuns,
  findActivePipelineRun,
  touchPipelineRunHeartbeat,
  updatePipelineRun,
} from "@/lib/data/zeta-pipeline-run-repository";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";
import { alertIfStale } from "@/lib/cron/cron-stale-check";
import { repairStaleOrphanInvoiceMetadata } from "@/lib/integrations/zeta/zeta-orphan-auto-repair";
import { runNotificationGenerationBestEffort } from "@/lib/copilot-notifications/run-notification-generation-best-effort";

const PIPELINE = ZETA_PIPELINE_NAMES.SALDOS;

// Rate limiting conservador (respeta límites de Zeta).
//
// Política de cobertura (causa raíz de balance_amount=0 en facturas USD de mayo
// 2026): el cron debe llegar a TODOS los clientes activos con `Codigo` del
// workspace, no a un subconjunto no determinístico. El sync de saldos solo
// actualiza `proto_invoices.balance_amount` para los clientes que efectivamente
// procesa; el mapper de vouchers escribe balance=0 por diseño y la única
// fuente de verdad para saldos es `RESTFacturaClienteV4QuerySaldosPendientes`.
//
// El default (200) cubre tenants tipo Summer87 (183 clientes activos al
// 2026-05-11) con margen. Para tenants más grandes, configurar
// `ZETA_SALDOS_CRON_MAX_CLIENTS_PER_WORKSPACE` (entero positivo) sin tocar
// código. La selección es determinística (`.order("id")`) para que sea
// reproducible y testeable.
const DEFAULT_MAX_CLIENTS_PER_WORKSPACE = 200;
const MAX_CLIENTS_PER_WORKSPACE = (() => {
  const raw = process.env.ZETA_SALDOS_CRON_MAX_CLIENTS_PER_WORKSPACE;
  if (!raw) return DEFAULT_MAX_CLIENTS_PER_WORKSPACE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CLIENTS_PER_WORKSPACE;
})();
const PAGE_DELAY_MS = 400;
const CLIENT_DELAY_MS = 600;
const MAX_PAGES_PER_CLIENT = 5;

// Anti-overlap: ventana de 2 horas (igual al intervalo del cron)
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
  errors: number;
  reconciliation_closed?: number;
  orphan_metadata_repaired?: number;
  clients_autocreated?: number;
};

// ── A-05: discovery + autocreate de nuevos clientes Zeta ─────────────────────

type SaldosSupabaseClient = Parameters<typeof runZetaSaldosPendientesPipeline>[0];

/**
 * Discovery step: llama a Zeta con ClienteCodigo vacío (una página) para detectar
 * clientes con deuda que no existen en proto_companies todavía.
 * Crea placeholders (source=zeta_saldos_autocreate) y devuelve los entries para
 * agregarlos a `eligible` en el mismo run — reduce visibilidad de <24h a <2h.
 * Docs Zeta: "ClienteCodigo puede dejarse vacío para obtener todos; solo una vez."
 * No-blocking: cualquier error de Zeta o DB se loggea y se retorna array vacío.
 */
async function discoverAndAutocreateNewZetaClients(
  supabase: SaldosSupabaseClient,
  workspaceId: string,
  requestId: string,
  knownCodigos: Set<string>
): Promise<Array<{ id: string; Codigo: string }>> {
  try {
    const result = await queryFacturaClienteSaldosPendientes(
      { requestId, tenantId: workspaceId },
      { clienteCodigo: "", page: "1" }
    );
    if (!result.succeed || result.rows.length === 0) return [];

    const unknown = extractUnknownCodigosFromSaldosRows(result.rows, knownCodigos);
    if (unknown.length === 0) return [];

    const created: Array<{ id: string; Codigo: string }> = [];
    for (const { codigo, nombre } of unknown) {
      const id = await ensureProtoCompanyForZetaCodigo(
        supabase,
        workspaceId,
        codigo,
        nombre,
        "zeta_saldos_autocreate"
      );
      if (!id) continue;
      created.push({ id, Codigo: codigo });
      console.info(
        JSON.stringify({
          kind: "zeta_autocreate_company",
          source: "saldos",
          workspace_id: workspaceId,
          codigo,
          nombre,
          company_id: id,
        })
      );
    }
    return created;
  } catch {
    return [];
  }
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

  log("cron_start");

  // ── Staleness check: alerta si la última corrida exitosa fue hace >6h ──────
  // Diseñado para correr ANTES del anti-overlap para detectar el escenario
  // "el cron ANTERIOR falló". No lanza excepciones — fallo de alerting no corta el cron.
  try {
    const staleness = await alertIfStale(supabase, PIPELINE, {
      thresholdMs: ANTI_OVERLAP_WINDOW_MS,
      criticalMs: 24 * 60 * 60 * 1_000,
    });
    if (staleness.isStale) {
      log("staleness_detected", {
        last_success_at: staleness.lastSuccessAt,
        age_ms: staleness.ageMs,
        is_critical: staleness.isCritical,
        never_succeeded: staleness.neverSucceeded,
      });
    }
  } catch (e) {
    log("staleness_check_error", { error: String(e) });
  }

  // ── Anti-overlap (fleet) + recuperación runs colgados ─────────────────────
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

  let totalProcessed = 0;
  let totalUpserted = 0;
  let totalFailed = 0;
  let totalReconciliationClosed = 0;
  let totalOrphanMetadataRepaired = 0;
  const workspaceSummaries: WorkspaceSummary[] = [];
  let workspacesTotal = 0;
  let workspacePageIndex = 0;
  let cursorAfterId: string | null = null;

  // ── Workspaces activos: paginación determinística por `id` ───────────────
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
    // Orden determinístico por `id` para que la selección sea reproducible:
    // sin `.order()`, PostgREST devuelve filas en orden indefinido y el
    // antiguo cap de 10 dejaba a la mayoría de clientes fuera de la sync de
    // saldos (causa raíz balance=0 en clientes Codigo altos, p.ej. Vilcabamba
    // Codigo=137, Weik House Codigo=192, Suprasur Codigo=129…).
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

    const eligible: Array<{ id: string; Codigo: string }> = (
      (companies ?? []) as { id: string; Codigo: string | null }[]
    )
      .filter((c): c is { id: string; Codigo: string } => Boolean(c.Codigo?.trim()));

    // A-05: descubrir clientes Zeta nuevos sin proto_company y crearlos en el acto.
    // Llama a Zeta con ClienteCodigo vacío (una página) — contrato documentado.
    // Los nuevos clientes se agregan a `eligible` y se sincronizan en este mismo run.
    let wsAutocreated = 0;
    try {
      const knownCodigos = new Set(eligible.map((c) => c.Codigo));
      const newClients = await discoverAndAutocreateNewZetaClients(
        supabase,
        workspaceId,
        cronRunId,
        knownCodigos
      );
      if (newClients.length > 0) {
        wsAutocreated = newClients.length;
        eligible.push(...newClients);
        log("new_clients_autocreated", {
          workspace_id: workspaceId,
          count: newClients.length,
          codigos: newClients.map((c) => c.Codigo),
        });
      }
    } catch (e) {
      log("discovery_error", { workspace_id: workspaceId, error: String(e) });
    }

    // Detección de cobertura insuficiente: si llenamos el batch hasta el
    // tope, podría haber clientes fuera del sync que terminen con
    // balance_amount=0 incorrectamente. Sirve para alertar antes de un bug
    // de saldos como el de mayo 2026 (USD), no para bloquear la corrida.
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
          env_hint: "ZETA_SALDOS_CRON_MAX_CLIENTS_PER_WORKSPACE",
        });
      }
    }

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

    let wsOrphanMetadataRepaired = 0;
    try {
      const repair = await repairStaleOrphanInvoiceMetadata(supabase, workspaceId, {
        requestId: cronRunId,
      });
      wsOrphanMetadataRepaired = repair.repaired;
      totalOrphanMetadataRepaired += repair.repaired;
      if (repair.repaired > 0) {
        log("orphan_metadata_repaired", {
          workspace_id: workspaceId,
          repaired: repair.repaired,
          scanned: repair.scanned,
        });
      }
    } catch (repairErr) {
      log("orphan_metadata_repair_error", {
        workspace_id: workspaceId,
        error: String(repairErr),
      });
    }

    totalUpserted += wsUpserted;
    totalReconciliationClosed += wsReconciled;
    workspaceSummaries.push({
      workspace_id: workspaceId,
      clients_synced: eligible.length,
      rows_upserted: wsUpserted,
      errors: wsErrors,
      reconciliation_closed: wsReconciled,
      orphan_metadata_repaired: wsOrphanMetadataRepaired,
      clients_autocreated: wsAutocreated > 0 ? wsAutocreated : undefined,
    });

    workspacesTotal += 1;
    if (pipelineRunId) {
      try {
        await touchPipelineRunHeartbeat(supabase, pipelineRunId);
      } catch (e) {
        log("pipeline_heartbeat_error", { error: String(e) });
      }
    }
    await runNotificationGenerationBestEffort({
      workspaceCompanyId: workspaceId,
      source: PIPELINE,
      logger: log,
    });
    }

    cursorAfterId = page.nextAfterId;
    if (cursorAfterId == null) {
      break;
    }
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
        workspaces: workspacesTotal,
        workspace_pages: workspacePageIndex,
        reconciliation_closed: totalReconciliationClosed,
        orphan_metadata_repaired: totalOrphanMetadataRepaired,
        summaries: workspaceSummaries,
      },
    }).catch((e) => log("pipeline_run_update_error", { error: String(e) }));
  }

  log("cron_end", {
    workspaces: workspacesTotal,
    total_processed: totalProcessed,
    total_upserted: totalUpserted,
    total_failed: totalFailed,
    reconciliation_closed: totalReconciliationClosed,
    orphan_metadata_repaired: totalOrphanMetadataRepaired,
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
    total_failed: totalFailed,
    reconciliation_closed: totalReconciliationClosed,
    orphan_metadata_repaired: totalOrphanMetadataRepaired,
    duration_ms: duration,
    workspace_summaries: workspaceSummaries,
  });
}
