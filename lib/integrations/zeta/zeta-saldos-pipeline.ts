import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { serializeError } from "@/lib/copilot-structured-logger";
import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import {
  protoCreateInvoice,
  protoUpdateInvoice,
} from "@/lib/copilot-proto-crud-service";
import type { ProtoInvoiceInput } from "@/lib/copilot-proto-crud-types";
import {
  insertZetaSyncRawPayload,
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import type { ZetaSyncRunStatus } from "@/lib/data/zeta-sync-types";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { ZetaHttpError } from "@/lib/integrations/zeta/zeta-http-client";
import {
  ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
  mapSaldoRowsToZetaInvoicesBestEffort,
  queryFacturaClienteSaldosPendientes,
} from "@/lib/integrations/zeta/zeta-factura-cliente";
import { zetaLog } from "@/lib/integrations/zeta/zeta-log";
import {
  ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES,
  type ZetaSaldosPipelineOptions,
  type ZetaSaldosPipelineResult,
} from "@/lib/integrations/zeta/zeta-pipeline-types";
import type { ZetaInvoice } from "@/types/zeta";

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_PAGE_DELAY_MS = 400;
const DEFAULT_OVERLAP_SECONDS = 7 * 24 * 3600;

/** Tamaño máx. del JSON stringificado en staging (caracteres). Evita filas enormes; mantiene preview + hash. */
const ZETA_RAW_STAGING_MAX_JSON_CHARS = 48_000;

/**
 * Política ZETA-03 — staging raw (`zeta_sync_raw_payloads`):
 * - Objetivo: troubleshooting de contrato/parseo, no data lake ni archivo legal.
 * - No se almacenan credenciales (van en Connection fuera de este payload de negocio).
 * - La respuesta Zeta puede contener datos comerciales/PII; por eso se trunca y se guarda
 *   `preview` + `sha256` del cuerpo completo para correlacionar sin volcar todo el documento.
 */
function buildStagingPayloadJson(raw: unknown): Record<string, unknown> {
  let serialized: string;
  try {
    serialized = JSON.stringify(raw ?? null);
  } catch {
    serialized = JSON.stringify({ _nonSerializable: true });
  }
  const fullDigest = createHash("sha256").update(serialized, "utf8").digest("hex");
  if (serialized.length <= ZETA_RAW_STAGING_MAX_JSON_CHARS) {
    return {
      _staging_policy: "zeta-03-full-under-cap",
      _original_sha256: fullDigest,
      _original_char_length: serialized.length,
      body: raw as Record<string, unknown>,
    };
  }
  return {
    _staging_policy: "zeta-03-truncated",
    _original_sha256: fullDigest,
    _original_char_length: serialized.length,
    _truncated_to: ZETA_RAW_STAGING_MAX_JSON_CHARS,
    preview_json_text: serialized.slice(0, ZETA_RAW_STAGING_MAX_JSON_CHARS),
  };
}

function pipelineEmit(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>,
  err?: unknown
) {
  const base: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    source: "zeta_pipeline",
    ...fields,
  };
  if (err !== undefined) base.error = serializeError(err);
  const line = JSON.stringify(base);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Violación de unicidad PostgreSQL / PostgREST (código estable). */
function isPostgresUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

function fingerprintSaldosPage(clienteCodigo: string, page: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ f: "saldos_pendientes", c: clienteCodigo, p: page }))
    .digest("hex");
}

function addDaysIso(issueYmd: string, days: number): string {
  const d = new Date(`${issueYmd.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function zetaInvoiceToProtoInput(inv: ZetaInvoice, syncRunId: string): ProtoInvoiceInput {
  const issue = inv.issueDate.slice(0, 10);
  const bal =
    inv.outstandingAmount !== undefined ? inv.outstandingAmount : inv.totalAmount;
  const status = bal <= 1e-6 ? "paid" : "issued";
  return {
    company_id: inv.companyId,
    invoice_number: `ZETA:${inv.zetaId}`,
    issue_date: issue,
    due_date: addDaysIso(issue, 30),
    total_amount: inv.totalAmount,
    balance_amount: bal,
    status,
    category: "Zeta / saldos pendientes",
    notes: `sync_run:${syncRunId}`.slice(0, 500),
  };
}

async function findActiveInvoiceIdByZetaNumber(
  supabase: SupabaseClient,
  protoCompanyId: string,
  invoiceNumber: string
): Promise<string | null> {
  const q = applyProtoActiveListFilter(
    supabase
      .from("proto_invoices")
      .select("id")
      .eq("company_id", protoCompanyId)
      .eq("invoice_number", invoiceNumber),
    "active"
  );
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  const id = data && typeof (data as { id?: string }).id === "string" ? (data as { id: string }).id : null;
  return id;
}

/**
 * Upsert idempotente por `invoice_number = ZETA:{RegistroId}` (activos).
 */
async function persistZetaInvoice(
  supabase: SupabaseClient,
  inv: ZetaInvoice,
  syncRunId: string,
  seenInRun: Set<string>
): Promise<"insert" | "update" | "skip"> {
  const key = inv.zetaId;
  if (!key || seenInRun.has(key)) return "skip";
  seenInRun.add(key);

  const input = zetaInvoiceToProtoInput(inv, syncRunId);
  const existingId = await findActiveInvoiceIdByZetaNumber(
    supabase,
    inv.companyId,
    input.invoice_number
  );
  if (existingId) {
    const up = await protoUpdateInvoice(supabase, existingId, {
      issue_date: input.issue_date,
      due_date: input.due_date,
      total_amount: input.total_amount,
      balance_amount: input.balance_amount,
      status: input.status,
      category: input.category,
      notes: input.notes,
    });
    if (!up.ok) throw new Error(up.message);
    return "update";
  }
  const cr = await protoCreateInvoice(supabase, input);
  if (cr.ok) return "insert";
  if (cr.code === "DATABASE") {
    const again = await findActiveInvoiceIdByZetaNumber(
      supabase,
      inv.companyId,
      input.invoice_number
    );
    if (again) {
      const up2 = await protoUpdateInvoice(supabase, again, {
        issue_date: input.issue_date,
        due_date: input.due_date,
        total_amount: input.total_amount,
        balance_amount: input.balance_amount,
        status: input.status,
        category: input.category,
        notes: input.notes,
      });
      if (!up2.ok) throw new Error(up2.message);
      return "update";
    }
  }
  throw new Error(cr.message);
}

function resolveStartPage(
  watermark: string | undefined,
  mode: ZetaSaldosPipelineOptions["mode"],
  bootstrapCompleted: boolean
): number {
  if (!watermark || !watermark.trim()) return 1;
  const p = parseInt(watermark.trim(), 10);
  if (!Number.isFinite(p) || p < 1) return 1;
  if (mode === "bootstrap" && !bootstrapCompleted) return p;
  return 1;
}

/**
 * Orquesta import por ventanas acotadas (paginación) sobre `RESTFacturaClienteV4QuerySaldosPendientes`.
 * Solo para jobs / rutas server-side; no exponer como backend interactivo de UI.
 */
export async function runZetaSaldosPendientesPipeline(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  requestId: string,
  opts: ZetaSaldosPipelineOptions
): Promise<ZetaSaldosPipelineResult> {
  const maxPages = opts.maxPagesPerRun ?? DEFAULT_MAX_PAGES;
  const pageDelayMs = opts.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS;
  const overlapSec = opts.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS;
  const flow = ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES;

  const { data: clientRow, error: clientErr } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("id", opts.protoCompanyId)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!clientRow) {
    throw new Error("Cliente proto inexistente o fuera del workspace.");
  }

  const stateRow = await selectZetaSyncStateByResource(supabase, flow);
  const bootstrapCompleted = stateRow?.bootstrap_completed ?? false;
  const previousWatermark = (stateRow?.watermark?.trim() || "1") || "1";
  const startPage = resolveStartPage(stateRow?.watermark, opts.mode, bootstrapCompleted);

  const t1 = new Date();
  const t0 = new Date(t1.getTime() - overlapSec * 1000);

  let runId: string | null = null;
  let pagesFetched = 0;
  let rowsNormalized = 0;
  let rowsUpserted = 0;
  let stopped: ZetaSaldosPipelineResult["stopped_reason"] = "aborted";
  let errorSummary: string | undefined;
  /** Hubo al menos una página Zeta OK + persistencias completas (avance real de paginación). */
  let madePaginationProgress = false;
  /** Siguiente página a pedir en la próxima corrida; solo válido si `madePaginationProgress` o completed. */
  let watermarkAfterProgress: string | null = null;
  const seenInRun = new Set<string>();

  let nextPage = startPage;
  const pageIterations = Math.max(1, maxPages);

  try {
    const { id } = await insertZetaSyncRun(supabase, {
      resource_flow: flow,
      sync_mode: opts.mode,
      status: "running",
      overlap_from: t0.toISOString(),
      overlap_to: t1.toISOString(),
      idempotency_key: opts.idempotencyKey ?? null,
    });
    runId = id;
    const syncRunId = runId;

    await upsertZetaSyncState(supabase, {
      resource_flow: flow,
      last_run_id: syncRunId,
      overlap_seconds: overlapSec,
      watermark_type: "page",
      preserve_watermark: true,
    });

    const zetaCtx: ZetaCallContext = {
      requestId,
      tenantId: tenantCompanyId,
      syncRunId: syncRunId,
    };

    pipelineEmit("info", "zeta_saldos_pipeline_start", {
      request_id: requestId,
      sync_run_id: syncRunId,
      tenant_id: tenantCompanyId,
      resource_flow: flow,
      mode: opts.mode,
      start_page: startPage,
      max_pages_per_run: maxPages,
      previous_watermark: previousWatermark,
    });

    for (let i = 0; i < pageIterations; i++) {
      if (i > 0) await sleep(pageDelayMs);

      const pageStr = String(nextPage);
      let zetaResult;
      try {
        zetaResult = await queryFacturaClienteSaldosPendientes(
          zetaCtx,
          { clienteCodigo: opts.clienteCodigo, page: pageStr }
        );
      } catch (e) {
        stopped = "zeta_error";
        errorSummary =
          e instanceof ZetaHttpError ? `${e.code} HTTP ${e.httpStatus}` : "Error HTTP Zeta";
        zetaLog.error(
          "zeta_pipeline_page_http",
          {
            request_id: requestId,
            zeta_method: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
            tenant_id: tenantCompanyId,
            sync_run_id: syncRunId,
            zeta_attempt: i + 1,
            zeta_error_message: errorSummary,
          },
          e
        );
        if (madePaginationProgress) {
          watermarkAfterProgress = String(nextPage);
        }
        break;
      }

      try {
        await insertZetaSyncRawPayload(supabase, {
          sync_run_id: syncRunId,
          resource_flow: flow,
          chunk_index: nextPage,
          zeta_operation: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
          http_status: 200,
          payload_json: buildStagingPayloadJson(zetaResult.raw ?? {}),
          request_fingerprint: fingerprintSaldosPage(opts.clienteCodigo, pageStr),
        });
      } catch (rawErr) {
        if (isPostgresUniqueViolation(rawErr)) {
          pipelineEmit("warn", "zeta_raw_chunk_duplicate_skipped", {
            request_id: requestId,
            sync_run_id: syncRunId,
            page: pageStr,
            pg_code: "23505",
          });
        } else {
          throw rawErr;
        }
      }

      if (!zetaResult.succeed) {
        stopped = "zeta_error";
        errorSummary = "QuerySaldosPendientesOut succeed=false";
        zetaLog.warn("zeta_pipeline_business_fail", {
          request_id: requestId,
          zeta_method: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
          tenant_id: tenantCompanyId,
          sync_run_id: syncRunId,
          zeta_attempt: i + 1,
          zeta_succeed: false,
        });
        if (madePaginationProgress) {
          watermarkAfterProgress = String(nextPage);
        }
        break;
      }

      const normalized = mapSaldoRowsToZetaInvoicesBestEffort(opts.protoCompanyId, zetaResult.rows);
      rowsNormalized += normalized.length;

      for (const inv of normalized) {
        try {
          const r = await persistZetaInvoice(supabase, inv, syncRunId, seenInRun);
          if (r !== "skip") rowsUpserted += 1;
        } catch (pe) {
          stopped = "persist_error";
          errorSummary = pe instanceof Error ? pe.message.slice(0, 500) : "persist_error";
          pipelineEmit(
            "error",
            "zeta_pipeline_persist_failed",
            {
              request_id: requestId,
              sync_run_id: syncRunId,
              tenant_id: tenantCompanyId,
              zeta_id: inv.zetaId,
            },
            pe
          );
          if (madePaginationProgress) {
            watermarkAfterProgress = String(nextPage);
          }
          throw pe;
        }
      }

      pagesFetched += 1;
      madePaginationProgress = true;

      pipelineEmit("info", "zeta_saldos_page_ok", {
        request_id: requestId,
        sync_run_id: syncRunId,
        tenant_id: tenantCompanyId,
        page: pageStr,
        row_count: zetaResult.rows.length,
        is_last_page: zetaResult.isLastPage === true,
      });

      if (zetaResult.isLastPage === true) {
        watermarkAfterProgress = "1";
        stopped = "completed";
        break;
      }

      nextPage += 1;
      watermarkAfterProgress = String(nextPage);

      if (i === pageIterations - 1) {
        stopped = "max_pages";
        break;
      }
    }
  } catch (e) {
    if (!errorSummary) {
      errorSummary = e instanceof Error ? e.message.slice(0, 500) : String(e);
    }
    if (stopped === "aborted") {
      pipelineEmit(
        "error",
        "zeta_pipeline_unexpected",
        { request_id: requestId, sync_run_id: runId, tenant_id: tenantCompanyId },
        e
      );
    }
  } finally {
    if (runId) {
      const runStatus: ZetaSyncRunStatus =
        stopped === "completed"
          ? "succeeded"
          : stopped === "max_pages"
            ? "partial"
            : "failed";
      try {
        await updateZetaSyncRunById(supabase, runId, {
          status: runStatus,
          finished_at: new Date().toISOString(),
          records_fetched: rowsNormalized,
          records_processed: rowsUpserted,
          error_summary: errorSummary ?? null,
          error_code: stopped !== "completed" && stopped !== "max_pages" ? stopped : null,
        });
      } catch (closeErr) {
        pipelineEmit(
          "error",
          "zeta_run_close_failed",
          {
            request_id: requestId,
            sync_run_id: runId,
            tenant_id: tenantCompanyId,
          },
          closeErr
        );
      }
    }
  }

  if (!runId) {
    throw new Error(errorSummary ?? "No se pudo crear la corrida de sincronización.");
  }

  const newBootstrapCompleted =
    bootstrapCompleted || (opts.mode === "bootstrap" && stopped === "completed");

  const runStatusFinal: ZetaSyncRunStatus =
    stopped === "completed"
      ? "succeeded"
      : stopped === "max_pages"
        ? "partial"
        : "failed";
  const auditPersisted = runStatusFinal === "succeeded" || runStatusFinal === "partial";

  try {
    await upsertZetaSyncState(supabase, {
      resource_flow: flow,
      preserve_watermark: !madePaginationProgress,
      watermark:
        madePaginationProgress && watermarkAfterProgress != null
          ? watermarkAfterProgress
          : undefined,
      watermark_type: "page",
      overlap_seconds: overlapSec,
      bootstrap_completed: newBootstrapCompleted,
      last_run_id: runId,
      last_success_at: auditPersisted ? new Date().toISOString() : undefined,
      last_success_run_id: auditPersisted ? runId : undefined,
    });
  } catch (stateErr) {
    pipelineEmit(
      "error",
      "zeta_sync_state_upsert_failed",
      { request_id: requestId, sync_run_id: runId, tenant_id: tenantCompanyId },
      stateErr
    );
  }

  const effectiveWatermark =
    madePaginationProgress && watermarkAfterProgress != null
      ? watermarkAfterProgress
      : previousWatermark;

  pipelineEmit("info", "zeta_saldos_pipeline_end", {
    request_id: requestId,
    sync_run_id: runId,
    tenant_id: tenantCompanyId,
    stopped_reason: stopped,
    run_status:
      stopped === "completed" ? "succeeded" : stopped === "max_pages" ? "partial" : "failed",
    pages_fetched: pagesFetched,
    rows_normalized: rowsNormalized,
    rows_upserted: rowsUpserted,
    watermark_effective: effectiveWatermark,
    watermark_preserved: !madePaginationProgress,
  });

  return {
    ok: stopped === "completed" || stopped === "max_pages",
    sync_run_id: runId,
    pages_fetched: pagesFetched,
    rows_normalized: rowsNormalized,
    rows_upserted: rowsUpserted,
    stopped_reason: stopped,
    error_summary: errorSummary,
    last_page_processed: effectiveWatermark,
    bootstrap_completed: newBootstrapCompleted,
  };
}
