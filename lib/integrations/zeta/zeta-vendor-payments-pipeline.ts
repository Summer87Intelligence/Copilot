/**
 * Pipeline read-only: Zeta `RESTRecibosPagosV1QueryComprobantes`
 * → `proto_payments`.
 */

import { persistZetaVendorPaymentRow } from "@/lib/integrations/zeta/zeta-vendor-payment-persist";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import {
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import type { ZetaSyncMode } from "@/lib/data/zeta-sync-types";
import type { ZetaVendorPaymentRecord } from "@/lib/integrations/zeta/contracts/zeta-vendor-payments.contract";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import {
  fetchZetaVendorPayments,
  type FetchZetaVendorPaymentsResult,
  type ZetaVendorPaymentsQueryFilters,
} from "@/lib/integrations/zeta/zeta-vendor-payments-fetch";
import {
  mapCopilotVendorPaymentToProtoPaymentInput,
  mapZetaVendorPaymentToCopilot,
} from "@/lib/integrations/zeta/zeta-vendor-payments-mapper";
import { resolveZetaVendorPaymentsRestMethod } from "@/lib/integrations/zeta/zeta-vendor-payments-rest-method";
import {
  ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
  ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW_LEGACY_ALIASES,
} from "@/lib/integrations/zeta/zeta-sync-resource-keys";

export { ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW };

async function selectVendorPaymentsSyncState(
  supabase: OperationalSupabase,
  workspaceCompanyId: string
) {
  const canonical = await selectZetaSyncStateByResource(
    supabase,
    ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
    workspaceCompanyId
  );
  if (canonical) return canonical;
  for (const legacyFlow of ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW_LEGACY_ALIASES) {
    const legacy = await selectZetaSyncStateByResource(
      supabase,
      legacyFlow,
      workspaceCompanyId
    );
    if (legacy) return legacy;
  }
  return null;
}

const MAX_PAGES = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPageWithRetry(
  ctx: ZetaCallContext,
  page: string,
  filters: ZetaVendorPaymentsQueryFilters
): Promise<FetchZetaVendorPaymentsResult> {
  let last: FetchZetaVendorPaymentsResult | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetchZetaVendorPayments({ ctx, page, filters });
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
      zeta_method: resolveZetaVendorPaymentsRestMethod(),
    }
  );
}

export type SyncZetaVendorPaymentsParams = {
  supabase: OperationalSupabase;
  ctx: ZetaCallContext;
  workspaceCompanyId: string;
  filters: ZetaVendorPaymentsQueryFilters;
};

export type SyncZetaVendorPaymentsResult = {
  success: boolean;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  zeta_method: string;
  persisted_total?: number;
  invalid_date_rows?: number;
  invalid_amount_rows?: number;
  negative_amount_rows?: number;
  pre_operational_rows?: number;
  message?: string;
};

export async function syncZetaVendorPayments(
  params: SyncZetaVendorPaymentsParams
): Promise<SyncZetaVendorPaymentsResult> {
  const started = Date.now();
  const zeta_method = resolveZetaVendorPaymentsRestMethod();
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
    const prior = await selectVendorPaymentsSyncState(params.supabase, wid);
    const syncMode: ZetaSyncMode = prior?.bootstrap_completed ? "incremental" : "bootstrap";
    const run = await insertZetaSyncRun(params.supabase, {
      resource_flow: ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
      sync_mode: syncMode,
      status: "running",
      company_id: wid,
    });
    runId = run.id;

    let page = 1;
    let hasMore = true;
    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let rowsReceived = 0;
    let persisted = 0;
    let invalidDateRows = 0;
    let invalidAmountRows = 0;
    let negativeAmountRows = 0;
    let preOperationalRows = 0;

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
            resource_flow: ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
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
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_vendor_payments_sync",
          kind: "page",
          tenant: wid,
          zeta_method: res.zeta_method,
          page,
          rows_received: res.rows.length,
          http_status: res.httpStatus,
        })
      );

      for (const row of res.rows) {
        processed += 1;
        const mapped = mapZetaVendorPaymentToCopilot(row as ZetaVendorPaymentRecord);
        if (!mapped) {
          skipped += 1;
          continue;
        }

        const mapResult = mapCopilotVendorPaymentToProtoPaymentInput(mapped, runId ?? "");
        if (!mapResult.ok) {
          skipped += 1;
          if (mapResult.reason === "invalid_fecha") {
            invalidDateRows += 1;
          } else if (mapResult.reason === "negative_amount") {
            negativeAmountRows += 1;
          } else if (mapResult.reason === "pre_operational_date") {
            preOperationalRows += 1;
          } else {
            invalidAmountRows += 1;
          }
          console.info(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              source: "zeta_vendor_payments_sync",
              kind: "row_skip_mapper_rejected",
              tenant: wid,
              reason: mapResult.reason,
              registro_id: mapped.zeta_registro_id,
              amount:
                mapResult.reason === "invalid_amount" || mapResult.reason === "negative_amount"
                  ? mapResult.amount
                  : mapped.total,
              serie: mapped.serie,
              numero: mapped.numero,
              proveedor_codigo: mapped.proveedor_codigo,
              sync_run_id: runId ?? null,
            })
          );
          continue;
        }

        const input = mapResult.input;
        const persistResult = await persistZetaVendorPaymentRow(
          params.supabase,
          wid,
          input
        );
        if (!persistResult.ok) {
          errors += 1;
          console.info(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              source: "zeta_vendor_payments_sync",
              kind: "row_persist_failed",
              tenant: wid,
              reason: persistResult.reason,
              payment_number: input.payment_number,
              registro_id: mapped.zeta_registro_id,
              sync_run_id: runId ?? null,
            })
          );
        } else if (persistResult.action === "inserted") {
          inserted += 1;
          persisted += 1;
        } else {
          updated += 1;
          persisted += 1;
          if (persistResult.action === "updated_after_unique_race") {
            console.info(
              JSON.stringify({
                timestamp: new Date().toISOString(),
                source: "zeta_vendor_payments_sync",
                kind: "row_persist_unique_race_recovered",
                tenant: wid,
                payment_number: input.payment_number,
                registro_id: mapped.zeta_registro_id,
                sync_run_id: runId ?? null,
              })
            );
          }
        }
      }

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
        resource_flow: ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
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
        source: "zeta_vendor_payments_sync",
        kind: "summary",
        tenant: wid,
        zeta_method,
        processed,
        inserted,
        updated,
        skipped,
        errors,
        rows_received_total: rowsReceived,
        persisted_total: persisted,
        invalid_date_rows: invalidDateRows,
        invalid_amount_rows: invalidAmountRows,
        negative_amount_rows: negativeAmountRows,
        pre_operational_rows: preOperationalRows,
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
      invalid_date_rows: invalidDateRows,
      invalid_amount_rows: invalidAmountRows,
      negative_amount_rows: negativeAmountRows,
      pre_operational_rows: preOperationalRows,
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
        resource_flow: ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
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
