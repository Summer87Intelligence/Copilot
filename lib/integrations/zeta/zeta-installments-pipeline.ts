/**
 * Pipeline `proto_invoice_installments` — fetch + upsert idempotente.
 *
 * Por cliente:
 *   1. Pagina `RESTCuotasV1QueryCliente` con `fetchZetaInstallments`.
 *   2. Mapea filas crudas a `ProtoInstallmentInput` (`mapZetaInstallmentsBatch`).
 *   3. Resuelve `invoice_id` por batch desde `zeta_registro_id`
 *      (`findActiveProtoInvoiceIdsByRegistroIds`).
 *   4. Upsert idempotente en `proto_invoice_installments`
 *      (`onConflict='workspace_company_id,zeta_registro_id,cuota_numero'`).
 *   5. Si `updateInvoiceDueDate=true`: por cada `invoice_id` linkeada actualiza
 *      `proto_invoices.due_date` = min(cuota_vencimiento de cuotas pendientes)
 *      y `due_date_source = 'zeta_cuotas_v1'`. NUNCA escribe NULL.
 *
 * Reglas:
 *   - NO altera `proto_invoices.balance_amount` (responsabilidad del pipeline de saldos).
 *   - NO toca pipelines existentes.
 *   - Logs estructurados (`zeta_installments_pipeline`).
 *   - Idempotente: correr dos veces seguidas no genera diferencias.
 *   - Cuotas huérfanas (sin invoice match) se persisten igual; el siguiente
 *     run reintenta el match.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/observability/logger";
import { sanitizeError } from "@/lib/observability/sanitize";
import { fetchZetaInstallments } from "@/lib/integrations/zeta/zeta-installments-fetch";
import {
  mapZetaInstallmentsBatch,
  type ProtoInstallmentInput,
} from "@/lib/integrations/zeta/zeta-installments-mapper";
import { findActiveProtoInvoiceIdsByRegistroIds } from "@/lib/integrations/zeta/zeta-installments-link";

const _pipelineLogger = createLogger({ source: "zeta_installments_pipeline" });

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_PAGE_DELAY_MS = 400;
/** Tamaño máx. de payload crudo persistido por cuota (defensa contra blobs gigantes). */
const RAW_PAYLOAD_MAX_CHARS = 8_000;

export type ZetaInstallmentsPipelineOptions = {
  /** `Codigo` del cliente Zeta (alfanumérico). Único filtro obligatorio. */
  clienteCodigo: string;
  /** Paginación: máximo de páginas por corrida. Default 5 (= 2500 cuotas). */
  maxPagesPerRun?: number;
  /** Delay entre páginas en ms. Default 400. */
  pageDelayMs?: number;
  /**
   * Si true, actualiza `proto_invoices.due_date` y `due_date_source='zeta_cuotas_v1'`
   * para invoices que matchearon RegistroId. Default true en cron y backfill.
   */
  updateInvoiceDueDate?: boolean;
  /**
   * Filtro opcional de vencimiento (YYYY-MM-DD). Default amplio para traer todo
   * lo pendiente histórico — el endpoint solo devuelve cuotas con `Saldo > 0`
   * por design Zeta.
   */
  cuotaVencimientoDesde?: string;
  cuotaVencimientoHasta?: string;
};

export type ZetaInstallmentsPipelineStoppedReason =
  | "completed"
  | "max_pages"
  | "fetch_error"
  | "upsert_error";

export type ZetaInstallmentsPipelineResult = {
  cliente_codigo: string;
  pages_processed: number;
  rows_fetched: number;
  rows_mapped: number;
  rows_discarded: number;
  rows_upserted: number;
  rows_linked: number;
  rows_orphan: number;
  invoices_due_date_updated: number;
  stopped_reason: ZetaInstallmentsPipelineStoppedReason;
  errors: string[];
  warnings: string[];
};

type UpsertRow = {
  workspace_company_id: string;
  invoice_id: string | null;
  zeta_registro_id: string;
  cliente_codigo: string;
  cuota_numero: number;
  cuota_total: number | null;
  cuota_saldo: number | null;
  cuota_vencimiento: string;
  moneda_codigo: number | null;
  currency_code: "UYU" | "USD" | null;
  es_entrega_inicial: boolean | null;
  raw_payload: Record<string, unknown> | null;
  synced_at: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncatePayload(raw: Record<string, unknown>): Record<string, unknown> {
  try {
    const s = JSON.stringify(raw);
    if (s.length <= RAW_PAYLOAD_MAX_CHARS) return raw;
    return {
      _truncated: true,
      _original_chars: s.length,
      _preview: s.slice(0, RAW_PAYLOAD_MAX_CHARS),
    };
  } catch {
    return { _truncated: true, _serialize_error: true };
  }
}

function round2(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function pipelineLog(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>,
  err?: unknown
): void {
  const payload =
    err !== undefined ? { ...fields, error: sanitizeError(err) } : fields;
  _pipelineLogger[level](message, undefined, payload);
}

export async function runZetaInstallmentsPipeline(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  syncRunId: string,
  options: ZetaInstallmentsPipelineOptions
): Promise<ZetaInstallmentsPipelineResult> {
  const wid = workspaceCompanyId.trim();
  const clienteCodigo = options.clienteCodigo.trim();
  const maxPages = Math.max(1, options.maxPagesPerRun ?? DEFAULT_MAX_PAGES);
  const pageDelayMs = Math.max(0, options.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS);
  const shouldUpdateDueDate = options.updateInvoiceDueDate ?? true;

  const result: ZetaInstallmentsPipelineResult = {
    cliente_codigo: clienteCodigo,
    pages_processed: 0,
    rows_fetched: 0,
    rows_mapped: 0,
    rows_discarded: 0,
    rows_upserted: 0,
    rows_linked: 0,
    rows_orphan: 0,
    invoices_due_date_updated: 0,
    stopped_reason: "completed",
    errors: [],
    warnings: [],
  };

  if (!wid) {
    result.stopped_reason = "fetch_error";
    result.errors.push("workspace_company_id vacío");
    return result;
  }
  if (!clienteCodigo) {
    result.stopped_reason = "fetch_error";
    result.errors.push("clienteCodigo vacío");
    return result;
  }

  pipelineLog("info", "pipeline_start", {
    workspace_company_id: wid,
    cliente_codigo: clienteCodigo,
    sync_run_id: syncRunId,
    max_pages: maxPages,
  });

  /** Acumulador `invoice_id` → min cuota_vencimiento de cuotas con saldo > 0. */
  const dueDateByInvoice = new Map<string, string>();

  let page = 1;
  for (; page <= maxPages; page++) {
    const fetchResult = await fetchZetaInstallments({
      ctx: { requestId: syncRunId, tenantId: wid, syncRunId },
      page: String(page),
      filters: {
        clienteCodigo,
        cuotaVencimientoDesde: options.cuotaVencimientoDesde,
        cuotaVencimientoHasta: options.cuotaVencimientoHasta,
      },
    });

    result.pages_processed = page;

    if (!fetchResult.ok) {
      result.stopped_reason = "fetch_error";
      result.errors.push(...fetchResult.errors);
      pipelineLog(
        "error",
        "pipeline_fetch_error",
        {
          workspace_company_id: wid,
          cliente_codigo: clienteCodigo,
          page,
          error_code: fetchResult.error_code,
          http_status: fetchResult.httpStatus,
        },
        new Error(fetchResult.errors.join("; "))
      );
      break;
    }

    result.warnings.push(...fetchResult.warnings);
    result.rows_fetched += fetchResult.rows.length;

    if (fetchResult.rows.length === 0) {
      pipelineLog("info", "pipeline_empty_page", {
        workspace_company_id: wid,
        cliente_codigo: clienteCodigo,
        page,
      });
      break;
    }

    const { mapped, discards } = mapZetaInstallmentsBatch(fetchResult.rows);
    result.rows_mapped += mapped.length;
    result.rows_discarded += discards.length;
    if (discards.length > 0) {
      pipelineLog("warn", "pipeline_mapper_discards", {
        workspace_company_id: wid,
        cliente_codigo: clienteCodigo,
        page,
        discarded: discards.length,
        sample: discards.slice(0, 3),
      });
    }

    if (mapped.length === 0) {
      if (!fetchResult.hasMore) break;
      if (pageDelayMs > 0) await sleep(pageDelayMs);
      continue;
    }

    // ── Link RegistroId → invoice_id (batch) ──────────────────────────────
    const registroIds = mapped.map((m) => String(m.zeta_registro_id));
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(
      supabase,
      wid,
      registroIds,
      {
        onFilterError: (path, msg) =>
          pipelineLog("warn", "pipeline_link_filter_error", {
            workspace_company_id: wid,
            cliente_codigo: clienteCodigo,
            path,
            message: msg,
          }),
      }
    );

    // ── Construir filas upsert ────────────────────────────────────────────
    const rows: UpsertRow[] = mapped.map((m) =>
      buildUpsertRow(m, wid, clienteCodigo, linkMap)
    );

    for (const r of rows) {
      if (r.invoice_id) result.rows_linked += 1;
      else result.rows_orphan += 1;

      if (
        r.invoice_id &&
        r.cuota_saldo !== null &&
        r.cuota_saldo > 0 &&
        r.cuota_vencimiento
      ) {
        const prev = dueDateByInvoice.get(r.invoice_id);
        if (!prev || r.cuota_vencimiento < prev) {
          dueDateByInvoice.set(r.invoice_id, r.cuota_vencimiento);
        }
      }
    }

    // ── Upsert ────────────────────────────────────────────────────────────
    try {
      const { error } = await supabase
        .from("proto_invoice_installments")
        .upsert(rows, {
          onConflict: "workspace_company_id,zeta_registro_id,cuota_numero",
        });
      if (error) {
        result.stopped_reason = "upsert_error";
        result.errors.push(`upsert: ${error.message}`);
        pipelineLog(
          "error",
          "pipeline_upsert_error",
          {
            workspace_company_id: wid,
            cliente_codigo: clienteCodigo,
            page,
            rows_attempted: rows.length,
          },
          error
        );
        break;
      }
      result.rows_upserted += rows.length;
    } catch (err) {
      result.stopped_reason = "upsert_error";
      result.errors.push(`upsert exception: ${String(err)}`);
      pipelineLog(
        "error",
        "pipeline_upsert_exception",
        {
          workspace_company_id: wid,
          cliente_codigo: clienteCodigo,
          page,
          rows_attempted: rows.length,
        },
        err
      );
      break;
    }

    if (!fetchResult.hasMore) break;
    if (pageDelayMs > 0) await sleep(pageDelayMs);
  }

  if (page > maxPages && result.stopped_reason === "completed") {
    result.stopped_reason = "max_pages";
  }

  // ── FASE 6: actualizar due_date real en invoices linkeadas ──────────────
  if (shouldUpdateDueDate && dueDateByInvoice.size > 0) {
    const updated = await applyRealDueDateToInvoices(
      supabase,
      wid,
      dueDateByInvoice,
      syncRunId
    );
    result.invoices_due_date_updated = updated;
  }

  pipelineLog("info", "pipeline_end", {
    workspace_company_id: wid,
    cliente_codigo: clienteCodigo,
    pages_processed: result.pages_processed,
    rows_fetched: result.rows_fetched,
    rows_upserted: result.rows_upserted,
    rows_linked: result.rows_linked,
    rows_orphan: result.rows_orphan,
    invoices_due_date_updated: result.invoices_due_date_updated,
    stopped_reason: result.stopped_reason,
    errors: result.errors.length,
  });

  return result;
}

function buildUpsertRow(
  m: ProtoInstallmentInput,
  workspaceCompanyId: string,
  clienteCodigoFallback: string,
  linkMap: Map<string, string | null>
): UpsertRow {
  const rid = String(m.zeta_registro_id);
  const inv = linkMap.get(rid) ?? null;
  return {
    workspace_company_id: workspaceCompanyId,
    invoice_id: inv,
    zeta_registro_id: rid,
    cliente_codigo: (m.cliente_codigo ?? clienteCodigoFallback).trim() || clienteCodigoFallback,
    cuota_numero: m.cuota_numero,
    cuota_total: round2(m.cuota_total),
    cuota_saldo: round2(m.cuota_saldo),
    cuota_vencimiento: m.cuota_vencimiento,
    moneda_codigo: m.moneda_codigo,
    currency_code: m.currency_code,
    es_entrega_inicial: m.es_entrega_inicial,
    raw_payload: truncatePayload(m.raw_payload as Record<string, unknown>),
    synced_at: new Date().toISOString(),
  };
}

/**
 * Aplica el `due_date` real (`zeta_cuotas_v1`) a invoices linkeadas.
 *
 * Reglas:
 *   - NUNCA escribe NULL (la regla del usuario: "Nunca overwrite con null").
 *   - Solo actualiza si el nuevo `due_date` real difiere del actual O si la
 *     `due_date_source` actual no es ya `zeta_cuotas_v1`. Idempotente.
 *   - Tolera ausencia de columna `due_date_source` (devuelve 0 con warn).
 */
async function applyRealDueDateToInvoices(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  dueDateByInvoice: Map<string, string>,
  syncRunId: string
): Promise<number> {
  if (dueDateByInvoice.size === 0) return 0;

  const ids = Array.from(dueDateByInvoice.keys());
  const { data: current, error } = await supabase
    .from("proto_invoices")
    .select("id, due_date, due_date_source")
    .eq("workspace_company_id", workspaceCompanyId)
    .in("id", ids);

  if (error) {
    pipelineLog(
      "warn",
      "pipeline_due_date_read_error",
      { workspace_company_id: workspaceCompanyId, ids: ids.length, sync_run_id: syncRunId },
      error
    );
    return 0;
  }

  const currentRows = (current ?? []) as Array<{
    id?: string;
    due_date?: string | null;
    due_date_source?: string | null;
  }>;

  let updates = 0;
  for (const row of currentRows) {
    const id = row.id;
    if (!id) continue;
    const newDue = dueDateByInvoice.get(id);
    if (!newDue) continue;
    const curDue = (row.due_date ?? "").slice(0, 10) || null;
    const curSrc = row.due_date_source ?? null;
    if (curDue === newDue && curSrc === "zeta_cuotas_v1") continue;

    const { error: updErr } = await supabase
      .from("proto_invoices")
      .update({ due_date: newDue, due_date_source: "zeta_cuotas_v1" })
      .eq("workspace_company_id", workspaceCompanyId)
      .eq("id", id);

    if (updErr) {
      pipelineLog(
        "warn",
        "pipeline_due_date_update_error",
        {
          workspace_company_id: workspaceCompanyId,
          invoice_id: id,
          new_due_date: newDue,
          sync_run_id: syncRunId,
        },
        updErr
      );
      continue;
    }
    updates += 1;
  }

  return updates;
}
