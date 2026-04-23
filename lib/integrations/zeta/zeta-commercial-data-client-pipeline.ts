/**
 * Sync datos comerciales Zeta → enriquecimiento `proto_companies.zeta_metadata` (sin duplicar empresas).
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type { ZetaSyncMode } from "@/lib/data/zeta-sync-types";
import {
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import type { ZetaCommercialClientRecord } from "@/lib/integrations/zeta/contracts/zeta-commercial-data-client.contract";
import {
  COPILOT_COMMERCIAL_CLIENT_METADATA_KEY,
  mapZetaCommercialClientToCopilot,
  type CopilotCommercialClientV1,
} from "@/lib/integrations/zeta/zeta-commercial-data-client-mapper";
import {
  fetchZetaCommercialDataClient,
  type FetchZetaCommercialDataClientResult,
  type ZetaCommercialDataClientQueryFilters,
} from "@/lib/integrations/zeta/zeta-commercial-data-client-fetch";
import { resolveZetaCommercialClientRestMethod } from "@/lib/integrations/zeta/zeta-commercial-client-rest-method";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { cleanZetaString, mapRutField } from "@/lib/integrations/zeta/zeta-client-mapper";
import { normalizeRutForMatch } from "@/lib/integrations/zeta/zeta-client-import-preview";

export const ZETA_COMMERCIAL_CLIENT_RESOURCE_FLOW = "zeta_commercial_client_v1";

const MAX_PAGES = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadProtoCompaniesColumns(
  client: OperationalSupabase
): Promise<{ columns: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const { data: sample, error } = await client.from("proto_companies").select("*").limit(1);
  if (error) {
    warnings.push(`No se pudo leer muestra proto_companies: ${error.message}`);
    return { columns: [], warnings };
  }
  const row = (sample ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return { columns: [], warnings };
  return { columns: Object.keys(row), warnings };
}

async function fetchPageWithSimpleRetry(
  ctx: ZetaCallContext,
  page: string,
  filters: ZetaCommercialDataClientQueryFilters | undefined
): Promise<FetchZetaCommercialDataClientResult> {
  let last: FetchZetaCommercialDataClientResult | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetchZetaCommercialDataClient({ ctx, page, filters });
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
      zeta_method: resolveZetaCommercialClientRestMethod(),
    }
  );
}

function mergeCommercialMetadata(
  existing: unknown,
  copilot: CopilotCommercialClientV1,
  syncedAt: string
): Record<string, unknown> {
  const base =
    existing !== null && existing !== undefined && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base[COPILOT_COMMERCIAL_CLIENT_METADATA_KEY] = {
    ...copilot,
    synced_at: syncedAt,
    source: "zeta_commercial_client_query",
  };
  return base;
}

export type SyncZetaCommercialDataClientParams = {
  supabase: OperationalSupabase;
  ctx: ZetaCallContext;
  workspaceCompanyId: string;
  filters?: ZetaCommercialDataClientQueryFilters;
};

export type SyncZetaCommercialDataClientResult = {
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  zeta_method: string;
  message?: string;
};

/**
 * Pagina la Query comercial, matchea `proto_companies` por Codigo Zeta o RUT, y fusiona `zeta_metadata`.
 */
export async function syncZetaCommercialDataClient(
  params: SyncZetaCommercialDataClientParams
): Promise<SyncZetaCommercialDataClientResult> {
  const started = Date.now();
  const zeta_method = resolveZetaCommercialClientRestMethod();
  const wid = params.workspaceCompanyId.trim();
  if (!wid) {
    return {
      success: false,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      zeta_method,
      message: "workspace_company_id vacío.",
    };
  }

  const { columns, warnings: colWarn } = await loadProtoCompaniesColumns(params.supabase);
  const columnSet = new Set(columns);
  if (!columnSet.has("zeta_metadata")) {
    return {
      success: false,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      zeta_method,
      message: "proto_companies.zeta_metadata no existe; no se puede enriquecer sin migración.",
    };
  }

  let runId: string | null = null;
  try {
    const prior = await selectZetaSyncStateByResource(params.supabase, ZETA_COMMERCIAL_CLIENT_RESOURCE_FLOW);
    const syncMode: ZetaSyncMode = prior?.bootstrap_completed ? "incremental" : "bootstrap";
    const run = await insertZetaSyncRun(params.supabase, {
      resource_flow: ZETA_COMMERCIAL_CLIENT_RESOURCE_FLOW,
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
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let rowsReceived = 0;

    while (hasMore && page <= MAX_PAGES) {
      const res = await fetchPageWithSimpleRetry(params.ctx, String(page), params.filters);
      if (!res.ok) {
        errors += 1;
        if (runId) {
          await updateZetaSyncRunById(params.supabase, runId, {
            status: "failed",
            finished_at: new Date().toISOString(),
            records_fetched: rowsReceived,
            records_processed: updated,
            error_summary: res.errors.join(" | ").slice(0, 2000),
            error_code: res.error_code,
          });
          await upsertZetaSyncState(params.supabase, {
            resource_flow: ZETA_COMMERCIAL_CLIENT_RESOURCE_FLOW,
            company_id: wid,
            preserve_watermark: true,
            last_run_id: runId,
          });
        }
        return {
          success: false,
          processed,
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
          source: "zeta_commercial_sync",
          kind: "zeta_commercial_page",
          zeta_method: res.zeta_method,
          page,
          rows_received: res.rows.length,
          http_status: res.httpStatus,
        })
      );

      const syncedAt = new Date().toISOString();
      for (const row of res.rows) {
        processed += 1;
        const copilot = mapZetaCommercialClientToCopilot(row as ZetaCommercialClientRecord);
        const codigo = copilot.zeta_codigo;
        const rutNorm = copilot.rut_documento ? normalizeRutForMatch(copilot.rut_documento) : null;
        const companyId =
          (codigo && byCodigo.get(codigo)) ?? (rutNorm && byRut.get(rutNorm)) ?? null;
        if (!companyId) {
          skipped += 1;
          continue;
        }

        const { data: existing, error: selErr } = await params.supabase
          .from("proto_companies")
          .select("id,zeta_metadata")
          .eq("id", companyId)
          .maybeSingle();
        if (selErr || !existing) {
          errors += 1;
          continue;
        }

        const merged = mergeCommercialMetadata(
          (existing as { zeta_metadata?: unknown }).zeta_metadata,
          copilot,
          syncedAt
        );
        const { error: upErr } = await params.supabase
          .from("proto_companies")
          .update({ zeta_metadata: merged })
          .eq("id", companyId);
        if (upErr) errors += 1;
        else updated += 1;
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
        records_processed: updated,
        error_summary: errors > 0 ? `${errors} errores / filas no aplicadas` : null,
      });
      await upsertZetaSyncState(params.supabase, {
        resource_flow: ZETA_COMMERCIAL_CLIENT_RESOURCE_FLOW,
        company_id: wid,
        watermark: JSON.stringify({ last_sync_at: nowIso }),
        watermark_type: "timestamp",
        bootstrap_completed: errors === 0 ? true : prior?.bootstrap_completed ?? false,
        last_success_at: errors === 0 ? nowIso : prior?.last_success_at ?? null,
        last_success_run_id: errors === 0 ? runId : prior?.last_success_run_id ?? null,
        last_run_id: runId,
      });
    }

    if (colWarn.length) {
      console.info(
        JSON.stringify({
          source: "zeta_commercial_sync",
          kind: "zeta_commercial_column_warnings",
          warnings: colWarn.length,
        })
      );
    }

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_commercial_sync",
        kind: "zeta_commercial_summary",
        zeta_method,
        endpoint: zeta_method,
        processed,
        updated,
        skipped,
        errors,
        rows_received_total: rowsReceived,
        duration_ms: Date.now() - started,
      })
    );

    return {
      success: true,
      processed,
      updated,
      skipped,
      errors,
      duration_ms: Date.now() - started,
      zeta_method,
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
        resource_flow: ZETA_COMMERCIAL_CLIENT_RESOURCE_FLOW,
        company_id: wid,
        preserve_watermark: true,
        last_run_id: runId,
      });
    }
    return {
      success: false,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      zeta_method,
      message: msg,
    };
  }
}
