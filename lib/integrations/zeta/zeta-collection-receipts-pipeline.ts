/**
 * Pipeline read-only: Zeta `QueryComprobantes` (recibos de cobranza) → `proto_receipts` en Copilot.
 * No invoca Save/Load/Delete ni ningún mutador en Zeta.
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type { ZetaSyncMode } from "@/lib/data/zeta-sync-types";
import {
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { protoCreateReceipt, protoUpdateReceipt } from "@/lib/copilot-proto-crud-service";
import type { ZetaCollectionReceiptRecord } from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";
import {
  fetchZetaCollectionReceipts,
  type FetchZetaCollectionReceiptsResult,
  type ZetaCollectionReceiptsQueryFilters,
} from "@/lib/integrations/zeta/zeta-collection-receipts-fetch";
import {
  mapCopilotCollectionReceiptToProtoReceiptInput,
  mapZetaCollectionReceiptToCopilot,
} from "@/lib/integrations/zeta/zeta-collection-receipts-mapper";
import { resolveZetaCollectionReceiptsRestMethod } from "@/lib/integrations/zeta/zeta-collection-receipts-rest-method";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { cleanZetaString, mapRutField } from "@/lib/integrations/zeta/zeta-client-mapper";
import { normalizeRutForMatch } from "@/lib/integrations/zeta/zeta-client-import-preview";

export const ZETA_COLLECTION_RECEIPTS_RESOURCE_FLOW = "zeta_collection_receipts_v1";

const MAX_PAGES = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPageWithRetry(
  ctx: ZetaCallContext,
  page: string,
  filters: ZetaCollectionReceiptsQueryFilters
): Promise<FetchZetaCollectionReceiptsResult> {
  let last: FetchZetaCollectionReceiptsResult | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetchZetaCollectionReceipts({ ctx, page, filters });
    last = r;
    if (r.ok) return r;
    if (r.error_code === "zeta_config" || r.error_code === "zeta_shape") return r;
    if (
      attempt < 3 &&
      (r.error_code === "zeta_rate_limit" ||
        r.error_code === "zeta_timeout" ||
        r.error_code === "zeta_unknown" ||
        r.error_code === "zeta_http")
    ) {
      await sleep(400 * attempt);
      continue;
    }
    return r;
  }
  return (
    last ?? {
      ok: false,
      rows: [],
      errors: ["fetch sin resultado"],
      warnings: [],
      error_code: "zeta_unknown",
      requestUrl: "",
      httpStatus: null,
      raw: null,
      zeta_method: resolveZetaCollectionReceiptsRestMethod(),
    }
  );
}

async function findActiveReceiptIdByNumber(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  receiptNumber: string
): Promise<string | null> {
  const q = applyProtoActiveListFilter(
    client
      .from("proto_receipts")
      .select("id")
      .eq("workspace_company_id", workspaceCompanyId.trim())
      .eq("receipt_number", receiptNumber),
    "active"
  );
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  const id = data && typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : null;
  return id;
}

export type SyncZetaCollectionReceiptsParams = {
  supabase: OperationalSupabase;
  ctx: ZetaCallContext;
  workspaceCompanyId: string;
  filters: ZetaCollectionReceiptsQueryFilters;
};

export type SyncZetaCollectionReceiptsResult = {
  success: boolean;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  zeta_method: string;
  persisted_total?: number;
  unlinked_client_rows?: number;
  invalid_date_rows?: number;
  invalid_amount_rows?: number;
  negative_amount_rows?: number;
  message?: string;
};

export async function syncZetaCollectionReceipts(
  params: SyncZetaCollectionReceiptsParams
): Promise<SyncZetaCollectionReceiptsResult> {
  const started = Date.now();
  const zeta_method = resolveZetaCollectionReceiptsRestMethod();
  const wid = params.workspaceCompanyId.trim();
  if (!wid) {
    return {
      success: false,
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      zeta_method,
      message: "workspace_company_id vacío.",
    };
  }

  const mes = params.filters.mes.trim();
  const anio = params.filters.anio.trim();
  if (!/^\d{1,2}$/.test(mes) || !/^\d{4}$/.test(anio)) {
    return {
      success: false,
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      zeta_method,
      message: "Mes (1-12) y año (AAAA) son obligatorios para QueryComprobantes.",
    };
  }

  let runId: string | null = null;
  try {
    const prior = await selectZetaSyncStateByResource(params.supabase, ZETA_COLLECTION_RECEIPTS_RESOURCE_FLOW);
    const syncMode: ZetaSyncMode = prior?.bootstrap_completed ? "incremental" : "bootstrap";
    const run = await insertZetaSyncRun(params.supabase, {
      resource_flow: ZETA_COLLECTION_RECEIPTS_RESOURCE_FLOW,
      sync_mode: syncMode,
      status: "running",
      company_id: wid,
    });
    runId = run.id;

    const { data: companies, error: compErr } = await params.supabase
      .from("proto_companies")
      .select("id,Codigo,RUT")
      .eq("workspace_company_id", wid);
    if (compErr || !companies) {
      throw new Error(compErr?.message ?? "sin proto_companies");
    }

    const byCodigo = new Map<string, string>();
    const byRut = new Map<string, string>();
    for (const row of companies as Record<string, unknown>[]) {
      const id = cleanZetaString(row.id);
      const cod = cleanZetaString(row.Codigo);
      if (id && cod) byCodigo.set(cod, id);
      const rut = mapRutField(row.RUT);
      const norm = rut ? normalizeRutForMatch(rut) : null;
      if (id && norm && !byRut.has(norm)) byRut.set(norm, id);
    }

    let page = 1;
    let hasMore = true;
    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let rowsReceived = 0;
    let persisted = 0;
    let unlinked = 0;
    let invalidDateRows = 0;
    let invalidAmountRows = 0;
    let negativeAmountRows = 0;

    while (hasMore && page <= MAX_PAGES) {
      const res = await fetchPageWithRetry(params.ctx, String(page), params.filters);
      if (!res.ok) {
        errors += 1;
        if (runId) {
          await updateZetaSyncRunById(params.supabase, runId, {
            status: "failed",
            finished_at: new Date().toISOString(),
            records_fetched: rowsReceived,
            records_processed: inserted + updated,
            error_summary: res.errors.join(" | ").slice(0, 2000),
            error_code: res.error_code,
          });
          await upsertZetaSyncState(params.supabase, {
            resource_flow: ZETA_COLLECTION_RECEIPTS_RESOURCE_FLOW,
            company_id: wid,
            preserve_watermark: true,
            last_run_id: runId,
          });
        }
        return {
          success: false,
          processed,
          inserted,
          updated,
          skipped,
          errors,
          duration_ms: Date.now() - started,
          zeta_method: res.zeta_method,
          message: res.errors[0] ?? "Error Zeta",
        };
      }

      rowsReceived += res.rows.length;
      let pageRowsNormalized = 0;
      let pageRowsInserted = 0;
      let pageRowsUpdated = 0;
      let pageRowsSkipped = 0;
      let pageDuplicateUpdates = 0;
      let pageFilteredMapper = 0;
      let pageFilteredNoRegistroId = 0;
      const pageInvalidShape = 0;

      for (const row of res.rows) {
        processed += 1;
        const mapped = mapZetaCollectionReceiptToCopilot(row as ZetaCollectionReceiptRecord);
        if (!mapped) {
          skipped += 1;
          pageRowsSkipped += 1;
          pageFilteredNoRegistroId += 1;
          continue;
        }
        pageRowsNormalized += 1;

        const codigoCliente = mapped.zeta_cliente_codigo;
        const rutNorm = mapped.cliente_documento ? normalizeRutForMatch(mapped.cliente_documento) : null;
        const companyId =
          (codigoCliente && byCodigo.get(codigoCliente)) ?? (rutNorm ? byRut.get(rutNorm) ?? undefined : undefined);
        if (!companyId) {
          unlinked += 1;
        }

        const mapResult = mapCopilotCollectionReceiptToProtoReceiptInput(companyId ?? null, mapped, runId ?? "");
        if (!mapResult.ok) {
          skipped += 1;
          pageRowsSkipped += 1;
          pageFilteredMapper += 1;
          if (mapResult.reason === "invalid_fecha") {
            invalidDateRows += 1;
            errors += 1;
          } else if (mapResult.reason === "negative_amount") {
            negativeAmountRows += 1;
          } else {
            invalidAmountRows += 1;
          }
          console.log(
            "ROW SKIP: collection receipt mapper rejected row",
            JSON.stringify({
              timestamp: new Date().toISOString(),
              source: "zeta_collection_receipts_sync",
              kind: "row_skip_mapper_rejected",
              reason: mapResult.reason,
              registro_id: mapped.zeta_registro_id,
              raw_fecha: mapResult.reason === "invalid_fecha" ? mapResult.raw_fecha : null,
              amount:
                mapResult.reason === "invalid_amount" || mapResult.reason === "negative_amount"
                  ? mapResult.amount
                  : mapped.importe,
              serie: mapped.raw_payload.Serie ?? mapped.raw_payload.serie ?? null,
              numero: mapped.raw_payload.Numero ?? mapped.raw_payload.numero ?? null,
              zeta_comprobante_codigo: mapped.comprobante_codigo,
              zeta_cliente_codigo: mapped.zeta_cliente_codigo,
              workspace_company_id: wid,
              sync_run_id: runId ?? null,
            })
          );
          continue;
        }
        const input = mapResult.input;

        const existingId = await findActiveReceiptIdByNumber(
          params.supabase,
          wid,
          input.receipt_number
        );

        if (existingId) {
          pageDuplicateUpdates += 1;
          const up = await protoUpdateReceipt(
            params.supabase,
            existingId,
            {
              company_id: input.company_id,
              receipt_date: input.receipt_date,
              amount: input.amount,
              currency_code: input.currency_code,
              payment_method: input.payment_method,
              status: input.status,
              reference: input.reference,
              notes: input.notes,
            },
            wid,
            { allowUnlinkedCompany: true }
          );
          if (!up.ok) errors += 1;
          else {
            updated += 1;
            pageRowsUpdated += 1;
            persisted += 1;
          }
        } else {
          const cr = await protoCreateReceipt(params.supabase, input, wid, { allowUnlinkedCompany: true });
          if (!cr.ok) errors += 1;
          else {
            inserted += 1;
            pageRowsInserted += 1;
            persisted += 1;
          }
        }
      }

      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_collection_receipts_sync",
          kind: "zeta_receipts_page_audit",
          zeta_method: res.zeta_method,
          page,
          fecha_desde: `${anio}-${mes.padStart(2, "0")}-01`,
          fecha_hasta: `${anio}-${mes.padStart(2, "0")}-31`,
          filter_mes: mes,
          filter_anio: anio,
          rows_raw: res.rows.length,
          rows_normalized: pageRowsNormalized,
          rows_inserted: pageRowsInserted,
          rows_updated: pageRowsUpdated,
          rows_skipped: pageRowsSkipped,
          duplicate_count: pageDuplicateUpdates,
          filtered_count: pageFilteredMapper + pageFilteredNoRegistroId,
          filtered_no_registro_id: pageFilteredNoRegistroId,
          filtered_mapper: pageFilteredMapper,
          watermark_filtered_count: 0,
          invalid_shape_count: pageInvalidShape,
          payload_preview_count: Math.min(res.rows.length, 3),
          has_more: res.hasMore,
          http_status: res.httpStatus,
          max_pages_per_run: MAX_PAGES,
        })
      );

      hasMore = res.hasMore;
      page += 1;
    }

    const nowIso = new Date().toISOString();
    if (runId) {
      await updateZetaSyncRunById(params.supabase, runId, {
        status: errors > 0 ? "partial" : "succeeded",
        finished_at: nowIso,
        records_fetched: rowsReceived,
        records_processed: inserted + updated,
        error_summary: errors > 0 ? `${errors} errores` : null,
      });
      await upsertZetaSyncState(params.supabase, {
        resource_flow: ZETA_COLLECTION_RECEIPTS_RESOURCE_FLOW,
        company_id: wid,
        watermark: JSON.stringify({ last_sync_at: nowIso, mes, anio }),
        watermark_type: "timestamp",
        bootstrap_completed: errors === 0 ? true : prior?.bootstrap_completed ?? false,
        last_success_at: errors === 0 ? nowIso : prior?.last_success_at ?? null,
        last_success_run_id: errors === 0 ? runId : prior?.last_success_run_id ?? null,
        last_run_id: runId,
      });
    }

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_collection_receipts_sync",
        kind: "summary",
        zeta_method,
        processed,
        inserted,
        updated,
        skipped,
        errors,
        rows_received_total: rowsReceived,
        persisted_total: persisted,
        unlinked_client_rows: unlinked,
        invalid_date_rows: invalidDateRows,
        invalid_amount_rows: invalidAmountRows,
        negative_amount_rows: negativeAmountRows,
        duration_ms: Date.now() - started,
      })
    );

    return {
      success: errors === 0,
      processed,
      inserted,
      updated,
      skipped,
      errors,
      duration_ms: Date.now() - started,
      zeta_method,
      persisted_total: persisted,
      unlinked_client_rows: unlinked,
      invalid_date_rows: invalidDateRows,
      invalid_amount_rows: invalidAmountRows,
      negative_amount_rows: negativeAmountRows,
      message: errors > 0 ? `${errors} errores de persistencia` : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) {
      await updateZetaSyncRunById(params.supabase, runId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: msg.slice(0, 2000),
        error_code: "pipeline_exception",
      });
      await upsertZetaSyncState(params.supabase, {
        resource_flow: ZETA_COLLECTION_RECEIPTS_RESOURCE_FLOW,
        company_id: wid,
        preserve_watermark: true,
        last_run_id: runId,
      });
    }
    return {
      success: false,
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      zeta_method,
      message: msg,
    };
  }
}
