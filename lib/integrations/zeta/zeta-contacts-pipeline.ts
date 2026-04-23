/**
 * Sync incremental Zeta → proto_contacts con trazabilidad (zeta_sync_*).
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type { ZetaSyncMode } from "@/lib/data/zeta-sync-types";
import {
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import { mapZetaContactToProto } from "@/lib/integrations/zeta/zeta-contact-mapper";
import {
  loadCompanyLinksForTenant,
  resolveCompanyId,
} from "@/lib/integrations/zeta/zeta-contact-import-run";
import { mapZetaClientToProtoCompanyPreview } from "@/lib/integrations/zeta/zeta-client-mapper";
import { fetchZetaContactsTyped, type FetchZetaContactsResult } from "@/lib/integrations/zeta/zeta-contacts-fetch";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";

export const ZETA_CONTACTS_RESOURCE_FLOW = "zeta_contacts_incremental_v1";

const MAX_PAGES = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function firstExistingColumn(columnSet: Set<string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (columnSet.has(c)) return c;
  }
  return undefined;
}

async function loadProtoContactsColumns(
  supabase: OperationalSupabase
): Promise<{ columns: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const { data: sample, error: selErr } = await supabase.from("proto_contacts").select("*").limit(1);
  if (selErr) {
    warnings.push(`No se pudo leer muestra de proto_contacts: ${selErr.message}`);
    return { columns: [], warnings };
  }
  const row = (sample ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return { columns: [], warnings };
  return { columns: Object.keys(row), warnings };
}

type WatermarkV1 = {
  /** ISO 8601: última sync completa (metadato opaco). */
  last_full_sync_at?: string;
  /** Si existe, se envía como filtro string opcional a Zeta (si la API lo ignora, no rompe). */
  fecha_registro_desde?: string;
};

function parseWatermark(raw: string): WatermarkV1 {
  const s = raw.trim();
  if (!s) return {};
  try {
    const v = JSON.parse(s) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as WatermarkV1;
  } catch {
    /* vacío */
  }
  return {};
}

async function fetchPageWithSimpleRetry(
  ctx: ZetaCallContext,
  page: string,
  filters: { esCliente: string; extraStringFilters?: Record<string, string> }
): Promise<FetchZetaContactsResult> {
  let last: FetchZetaContactsResult | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetchZetaContactsTyped({
      ctx,
      page,
      pageSize: 500,
      filters: { esCliente: filters.esCliente, extraStringFilters: filters.extraStringFilters },
    });
    last = r;
    if (r.ok) return r;
    if (r.error_code === "zeta_config" || r.error_code === "zeta_shape") return r;
    if (attempt < 3 && (r.error_code === "zeta_rate_limit" || r.error_code === "zeta_timeout" || r.error_code === "zeta_unknown" || r.error_code === "zeta_http")) {
      await sleep(400 * attempt);
      continue;
    }
    return r;
  }
  return last ?? {
    ok: false,
    contacts: [],
    errors: ["fetchPageWithSimpleRetry: sin resultado"],
    warnings: [],
    error_code: "zeta_unknown",
    requestUrl: "",
    httpStatus: null,
    raw: null,
  };
}

async function findExistingRowId(
  supabase: OperationalSupabase,
  workspaceCompanyId: string,
  companyId: string,
  extCol: string | undefined,
  externalId: string | null,
  docCol: string | undefined,
  document: string | null
): Promise<string | null> {
  if (externalId && extCol) {
    const q = await supabase
      .from("proto_contacts")
      .select("id")
      .eq("workspace_company_id", workspaceCompanyId)
      .eq("company_id", companyId)
      .eq(extCol, externalId)
      .maybeSingle();
    const id = q.data && typeof (q.data as { id?: unknown }).id === "string" ? (q.data as { id: string }).id : null;
    if (id) return id;
  }
  if (document && docCol) {
    const q2 = await supabase
      .from("proto_contacts")
      .select("id")
      .eq("workspace_company_id", workspaceCompanyId)
      .eq("company_id", companyId)
      .eq(docCol, document)
      .maybeSingle();
    const id2 =
      q2.data && typeof (q2.data as { id?: unknown }).id === "string" ? (q2.data as { id: string }).id : null;
    if (id2) return id2;
  }
  return null;
}

export type SyncZetaContactsIncrementalResult = {
  success: boolean;
  synced: number;
  errors: number;
  duration_ms: number;
  run_id: string | null;
  message?: string;
};

export type SyncZetaContactsIncrementalParams = {
  supabase: OperationalSupabase;
  ctx: ZetaCallContext;
  workspaceCompanyId: string;
  esCliente?: string;
};

/**
 * Pagina Zeta, upsert por Codigo / Documento en columnas existentes de `proto_contacts`, y persiste estado en `zeta_sync_*`.
 */
export async function syncZetaContactsIncremental(
  params: SyncZetaContactsIncrementalParams
): Promise<SyncZetaContactsIncrementalResult> {
  const started = Date.now();
  const wid = params.workspaceCompanyId.trim();
  const esCliente = (params.esCliente ?? "S").trim() || "S";
  const warnings: string[] = [];

  if (!wid) {
    return {
      success: false,
      synced: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      run_id: null,
      message: "workspace_company_id vacío.",
    };
  }

  let runId: string | null = null;
  try {
    const prior = await selectZetaSyncStateByResource(params.supabase, ZETA_CONTACTS_RESOURCE_FLOW);
    const wm = parseWatermark(prior?.watermark ?? "");
    const syncMode: ZetaSyncMode = prior?.bootstrap_completed ? "incremental" : "bootstrap";

    const run = await insertZetaSyncRun(params.supabase, {
      resource_flow: ZETA_CONTACTS_RESOURCE_FLOW,
      sync_mode: syncMode,
      status: "running",
      company_id: wid,
    });
    runId = run.id;

    const { columns, warnings: colWarn } = await loadProtoContactsColumns(params.supabase);
    warnings.push(...colWarn);
    const columnSet = new Set(columns);
    if (!columnSet.has("company_id") || !columnSet.has("workspace_company_id")) {
      throw new Error("proto_contacts sin company_id / workspace_company_id.");
    }

    const extCol = firstExistingColumn(columnSet, ["external_id", "external_id_zeta", "zeta_codigo", "erp_external_id"]);
    const docCol = firstExistingColumn(columnSet, ["document", "tax_id", "rut", "national_id"]);
    const nameCol = firstExistingColumn(columnSet, ["full_name", "name"]);
    const emailCol = firstExistingColumn(columnSet, ["email"]);
    const phoneCol = firstExistingColumn(columnSet, ["phone", "telefono", "primary_phone", "mobile", "celular"]);
    const rawCol = firstExistingColumn(columnSet, ["raw_payload", "zeta_raw", "metadata"]);
    const esClienteCol = firstExistingColumn(columnSet, ["es_cliente", "is_client"]);

    const { byCodigo, byRutNorm, warnings: linkWarn } = await loadCompanyLinksForTenant(params.supabase, wid);
    warnings.push(...linkWarn);

    const extraFilters: Record<string, string> = {};
    if (wm.fecha_registro_desde) extraFilters.FechaRegistroDesde = wm.fecha_registro_desde;

    let page = 1;
    let hasMore = true;
    let synced = 0;
    let errors = 0;
    let fetched = 0;

    while (hasMore && page <= MAX_PAGES) {
      const res = await fetchPageWithSimpleRetry(params.ctx, String(page), {
        esCliente,
        extraStringFilters: Object.keys(extraFilters).length ? extraFilters : undefined,
      });
      if (!res.ok) {
        errors += 1;
        await updateZetaSyncRunById(params.supabase, runId, {
          status: "failed",
          finished_at: new Date().toISOString(),
          records_fetched: fetched,
          records_processed: synced,
          error_summary: res.errors.join(" | ").slice(0, 2000),
          error_code: res.error_code,
        });
        await upsertZetaSyncState(params.supabase, {
          resource_flow: ZETA_CONTACTS_RESOURCE_FLOW,
          company_id: wid,
          preserve_watermark: true,
          last_run_id: runId,
        });
        return {
          success: false,
          synced,
          errors,
          duration_ms: Date.now() - started,
          run_id: runId,
          message: res.errors[0] ?? "Error Zeta",
        };
      }

      warnings.push(...res.warnings);
      fetched += res.contacts.length;

      for (const c of res.contacts) {
        const raw = asRecord(c);
        const preview = mapZetaClientToProtoCompanyPreview(c);
        const company_id = resolveCompanyId(raw, preview, byCodigo, byRutNorm);
        if (!company_id) {
          errors += 1;
          continue;
        }

        const mapped = mapZetaContactToProto(c);
        const insertRow: Record<string, unknown> = {
          workspace_company_id: wid,
          company_id,
        };

        if (extCol && mapped.external_id) insertRow[extCol] = mapped.external_id;
        if (nameCol && mapped.name) insertRow[nameCol] = mapped.name;
        if (emailCol && mapped.email) insertRow[emailCol] = mapped.email;
        if (phoneCol && mapped.telefono) insertRow[phoneCol] = mapped.telefono;
        if (docCol && mapped.document) insertRow[docCol] = mapped.document;
        if (esClienteCol && mapped.es_cliente !== null) {
          const col = esClienteCol;
          insertRow[col] = mapped.es_cliente;
        }
        if (rawCol) insertRow[rawCol] = mapped.raw_payload;
        if (columnSet.has("status")) insertRow.status = "active";
        if (columnSet.has("is_active")) insertRow.is_active = true;

        const existingId = await findExistingRowId(
          params.supabase,
          wid,
          company_id,
          extCol,
          mapped.external_id,
          docCol,
          mapped.document
        );

        if (existingId) {
          const { error: upErr } = await params.supabase.from("proto_contacts").update(insertRow).eq("id", existingId);
          if (upErr) errors += 1;
          else synced += 1;
        } else {
          const { error: insErr } = await params.supabase.from("proto_contacts").insert(insertRow).select("id").single();
          if (insErr) errors += 1;
          else synced += 1;
        }
      }

      hasMore = res.hasMore;
      page += 1;
    }

    const nowIso = new Date().toISOString();
    const nextWm: WatermarkV1 = {
      last_full_sync_at: nowIso,
      fecha_registro_desde: wm.fecha_registro_desde,
    };

    await updateZetaSyncRunById(params.supabase, runId, {
      status: errors > 0 ? "partial" : "succeeded",
      finished_at: nowIso,
      records_fetched: fetched,
      records_processed: synced,
      error_summary: errors > 0 ? `${errors} filas con error` : null,
    });

    await upsertZetaSyncState(params.supabase, {
      resource_flow: ZETA_CONTACTS_RESOURCE_FLOW,
      company_id: wid,
      watermark: JSON.stringify(nextWm),
      watermark_type: "timestamp",
      bootstrap_completed: errors === 0 ? true : (prior?.bootstrap_completed ?? false),
      last_success_at: errors === 0 ? nowIso : prior?.last_success_at ?? null,
      last_success_run_id: errors === 0 ? runId : prior?.last_success_run_id ?? null,
      last_run_id: runId,
    });

    if (warnings.length) {
      console.info("[syncZetaContactsIncremental] warnings", { count: warnings.length });
    }

    return {
      success: true,
      synced,
      errors,
      duration_ms: Date.now() - started,
      run_id: runId,
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
        resource_flow: ZETA_CONTACTS_RESOURCE_FLOW,
        company_id: wid,
        preserve_watermark: true,
        last_run_id: runId,
      });
    }
    return {
      success: false,
      synced: 0,
      errors: 1,
      duration_ms: Date.now() - started,
      run_id: runId,
      message: msg,
    };
  }
}
