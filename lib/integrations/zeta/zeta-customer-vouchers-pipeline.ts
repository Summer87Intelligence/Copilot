/**
 * Pipeline read-only: Zeta Query comprobantes por cliente → `proto_invoices` en Copilot.
 * No escribe ni llama métodos mutadores en Zeta (solo `fetchZetaCustomerVouchers` + Supabase local).
 */

import { createHash } from "node:crypto";

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type { ZetaSyncMode } from "@/lib/data/zeta-sync-types";
import {
  insertZetaSyncRawPayload,
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { protoCreateInvoice, protoUpdateInvoice } from "@/lib/copilot-proto-crud-service";
import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";
import {
  fetchZetaCustomerVouchers,
  type FetchZetaCustomerVouchersResult,
  type ZetaCustomerVouchersQueryFilters,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-fetch";
import {
  type CopilotCustomerVoucherV1,
  buildZetaCustomerVoucherInvoiceNumber,
  buildZetaCustomerVoucherInvoiceNumberLegacyCompKey,
  buildZetaCustomerVoucherInvoiceNumberLegacyHash,
  copilotCustomerVoucherHasPersistableIdentity,
  mapCopilotCustomerVoucherToProtoInvoiceInput,
  mapZetaCustomerVoucherToCopilot,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-mapper";
import {
  buildZetaComprobanteIdentityV1,
  findActiveProtoInvoiceIdByZetaRegistroMetadata,
  ZETA_METADATA_COMPROBANTE_IDENTITY_V1,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import {
  resolveZetaCustomerVouchersRestMethod,
  resolveZetaCustomerVouchersRootInKey,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-rest-method";
import {
  zetaCustomerVoucherClassifierRejectReason,
  zetaCustomerVoucherRowLooksLikeReciboCobranza,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { cleanZetaString, mapRutField } from "@/lib/integrations/zeta/zeta-client-mapper";
import {
  runCurrencyEnrichmentPipeline,
  type CurrencyEnrichmentResult,
} from "@/lib/integrations/zeta/zeta-currency-enrichment-pipeline";
import { normalizeRutForMatch } from "@/lib/integrations/zeta/zeta-client-import-preview";

console.log("🔥 PIPELINE FILE LOADED");

export const ZETA_CUSTOMER_VOUCHERS_RESOURCE_FLOW = "zeta_customer_vouchers_v1";

/** Valor de `zeta_sync_raw_payloads.resource_flow` para auditoría RAW (KB / producto). */
const ZETA_CUSTOMER_VOUCHERS_RAW_RESOURCE_FLOW = "comprobantes_cliente";

const MAX_PAGES = 5_000;

function isPostgresUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  return (err as { code?: string }).code === "23505";
}

function fingerprintCustomerVouchersPage(filters: ZetaCustomerVouchersQueryFilters, page: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        flow: ZETA_CUSTOMER_VOUCHERS_RAW_RESOURCE_FLOW,
        mes: filters.mes,
        anio: filters.anio,
        page,
        clienteCodigo: filters.clienteCodigo ?? "",
      }),
      "utf8"
    )
    .digest("hex");
}

/**
 * Persiste la respuesta JSON cruda de Zeta en `zeta_sync_raw_payloads` antes de mapear filas a `proto_invoices`.
 * `company_id` lo completa el trigger a partir de `sync_run_id` (ZETA-02).
 */
async function persistCustomerVouchersZetaRawPayload(
  client: OperationalSupabase,
  input: {
    syncRunId: string;
    page: number;
    zetaMethod: string;
    httpStatus: number | null;
    raw: unknown;
    filters: ZetaCustomerVouchersQueryFilters;
  }
): Promise<void> {
  try {
    console.log("RAW INSERT → executing");
    await insertZetaSyncRawPayload(client, {
      sync_run_id: input.syncRunId,
      resource_flow: ZETA_CUSTOMER_VOUCHERS_RAW_RESOURCE_FLOW,
      chunk_index: input.page,
      zeta_operation: input.zetaMethod,
      http_status: input.httpStatus ?? null,
      payload_json: input.raw ?? {},
      request_fingerprint: fingerprintCustomerVouchersPage(input.filters, input.page),
    });
  } catch (e) {
    console.error("RAW INSERT ERROR:", e);
    if (isPostgresUniqueViolation(e)) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_customer_vouchers_sync",
          kind: "zeta_raw_chunk_duplicate_skipped",
          sync_run_id: input.syncRunId,
          page: input.page,
          pg_code: "23505",
        })
      );
      return;
    }
    throw e;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadInvoiceColumns(client: OperationalSupabase): Promise<Set<string>> {
  const { data: sample, error } = await client.from("proto_invoices").select("*").limit(1);
  if (error || !sample?.[0]) return new Set();
  return new Set(Object.keys(sample[0] as Record<string, unknown>));
}

async function fetchPageWithRetry(
  ctx: ZetaCallContext,
  page: string,
  filters: ZetaCustomerVouchersQueryFilters
): Promise<FetchZetaCustomerVouchersResult> {
  const rootDefault = resolveZetaCustomerVouchersRootInKey();
  let last: FetchZetaCustomerVouchersResult | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetchZetaCustomerVouchers({ ctx, page, filters });
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
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_customer_vouchers_sync",
          kind: "fetch_retry",
          page,
          attempt,
          error_code: r.error_code,
          errors: r.errors,
          http_status: r.httpStatus,
          details: r.details ?? null,
          zeta_method: r.zeta_method,
          root_in_key: r.root_in_key,
        })
      );
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
      zeta_method: resolveZetaCustomerVouchersRestMethod(),
      root_in_key: rootDefault,
    }
  );
}

async function mergeInvoiceZetaMetadata(
  client: OperationalSupabase,
  invoiceId: string,
  voucherBlock: Record<string, unknown>
): Promise<void> {
  const { data } = await client.from("proto_invoices").select("zeta_metadata").eq("id", invoiceId).maybeSingle();
  const row = data as { zeta_metadata?: unknown } | null;
  const prevRaw = row?.zeta_metadata;
  const prev =
    prevRaw !== null &&
    prevRaw !== undefined &&
    typeof prevRaw === "object" &&
    !Array.isArray(prevRaw)
      ? { ...(prevRaw as Record<string, unknown>) }
      : {};
  prev.zeta_customer_voucher_v1 = voucherBlock;
  const regFromBlock =
    voucherBlock.zeta_registro_id != null && String(voucherBlock.zeta_registro_id).trim() !== ""
      ? String(voucherBlock.zeta_registro_id).trim()
      : null;
  prev[ZETA_METADATA_COMPROBANTE_IDENTITY_V1] = buildZetaComprobanteIdentityV1(regFromBlock);
  await client.from("proto_invoices").update({ zeta_metadata: prev }).eq("id", invoiceId);
}

const ZETA_VOUCHER_INVOICE_NUMBER_BUILDER = "buildZetaCustomerVoucherInvoiceNumber";

function logZetaVoucherPersistIdentity(
  op: "protoUpdateInvoice" | "protoCreateInvoice",
  ctx: {
    invoice_number_final: string;
    invoice_number_from_mapper_input: string;
    serie: string | null;
    numero: string | null;
    clienteCodigo: string | null;
    empresaCodigo: string | null;
  }
): void {
  if (ctx.invoice_number_final !== ctx.invoice_number_from_mapper_input) {
    console.error(
      "ZETA_VOUCHER_PERSIST_INVOICE_NUMBER_MISMATCH",
      JSON.stringify({ op, ...ctx, builder_fn: ZETA_VOUCHER_INVOICE_NUMBER_BUILDER })
    );
  }
  if (ctx.invoice_number_final.includes("ZETA:CCV1:COMP:")) {
    console.warn(
      "ZETA_VOUCHER_PERSIST_LEGACY_COMP_PATTERN",
      JSON.stringify({
        op,
        hint:
          "La clave ZETA:CCV1:COMP:* no la genera buildZetaCustomerVoucherInvoiceNumber actual; si aparece aquí, revisá deploy o filas ya existentes / Serie+Numero vacíos en Zeta.",
        ...ctx,
        builder_fn: ZETA_VOUCHER_INVOICE_NUMBER_BUILDER,
      })
    );
  }
  console.log(
    "ZETA_VOUCHER_PERSIST",
    JSON.stringify({
      op,
      source: "zeta-customer-vouchers-pipeline.ts",
      builder_fn: ZETA_VOUCHER_INVOICE_NUMBER_BUILDER,
      invoice_number_final: ctx.invoice_number_final,
      serie: ctx.serie,
      numero: ctx.numero,
      clienteCodigo: ctx.clienteCodigo,
      empresaCodigo: ctx.empresaCodigo,
    })
  );
}

async function findActiveInvoiceIdByNumber(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  protoCompanyId: string,
  invoiceNumber: string
): Promise<string | null> {
  const q = applyProtoActiveListFilter(
    client
      .from("proto_invoices")
      .select("id")
      .eq("workspace_company_id", workspaceCompanyId.trim())
      .eq("company_id", protoCompanyId)
      .eq("invoice_number", invoiceNumber),
    "active"
  );
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  const id = data && typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : null;
  return id;
}

function readVoucherSerieNumFromZetaMetadata(row: {
  zeta_metadata?: unknown;
}): { serie: string; numero: string } | null {
  const zm = row.zeta_metadata;
  if (zm === null || zm === undefined || typeof zm !== "object" || Array.isArray(zm)) return null;
  const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
  if (v1 === null || v1 === undefined || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const rec = v1 as Record<string, unknown>;
  const serie = String(rec.serie ?? "").trim();
  const numero = String(rec.numero ?? "").trim();
  if (!serie || !numero) return null;
  return { serie, numero };
}

/**
 * Encuentra la fila `proto_invoices` de un comprobante Zeta ya persistido:
 * 0) `RegistroId` en `zeta_metadata` (`zeta_comprobante_identity_v1` / voucher v1 / raw)
 * 1) clave semántica actual (`ZETA:CCV1:{emp}:{cli}:{serie}:{numero}`)
 * 2) hash legacy (`ZETA:CC:{hex}`)
 * 3) mismo `Serie`/`Numero` en `zeta_metadata`
 * 4) clave antigua `ZETA:CCV1:COMP:{ComprobanteCodigo}` (migración; solo si hay match único o coincide metadata)
 */
async function findActiveInvoiceIdForZetaCustomerVoucher(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  protoCompanyId: string,
  semanticInvoiceNumber: string,
  legacyHashInvoiceNumber: string,
  serie: string | null,
  numero: string | null,
  mapped: CopilotCustomerVoucherV1
): Promise<string | null> {
  const rid = mapped.zeta_registro_id?.trim();
  if (rid) {
    const byReg = await findActiveProtoInvoiceIdByZetaRegistroMetadata(
      client,
      workspaceCompanyId,
      protoCompanyId,
      rid
    );
    if (byReg) return byReg.id;
  }

  const a = await findActiveInvoiceIdByNumber(
    client,
    workspaceCompanyId,
    protoCompanyId,
    semanticInvoiceNumber
  );
  if (a) return a;
  const b = await findActiveInvoiceIdByNumber(
    client,
    workspaceCompanyId,
    protoCompanyId,
    legacyHashInvoiceNumber
  );
  if (b) return b;
  const ser = serie?.trim() ?? "";
  const num = numero != null ? String(numero).trim() : "";
  if (ser && num) {
    const q = applyProtoActiveListFilter(
      client
        .from("proto_invoices")
        .select("id")
        .eq("workspace_company_id", workspaceCompanyId.trim())
        .eq("company_id", protoCompanyId)
        .filter("zeta_metadata->zeta_customer_voucher_v1->>serie", "eq", ser)
        .filter("zeta_metadata->zeta_customer_voucher_v1->>numero", "eq", num)
        .order("issue_date", { ascending: true })
        .limit(1),
      "active"
    );
    const { data, error } = await q;
    if (!error && data?.length) {
      const row0 = data[0] as { id?: unknown };
      if (typeof row0.id === "string") return row0.id;
    }
  }

  const legacyComp = buildZetaCustomerVoucherInvoiceNumberLegacyCompKey(mapped);
  if (legacyComp) {
    const qComp = applyProtoActiveListFilter(
      client
        .from("proto_invoices")
        .select("id, zeta_metadata")
        .eq("workspace_company_id", workspaceCompanyId.trim())
        .eq("company_id", protoCompanyId)
        .eq("invoice_number", legacyComp)
        .order("issue_date", { ascending: true })
        .limit(12),
      "active"
    );
    const { data: compRows, error: compErr } = await qComp;
    if (!compErr && compRows?.length) {
      const typed = compRows as Array<{ id?: unknown; zeta_metadata?: unknown }>;
      if (ser && num) {
        for (const row of typed) {
          const sn = readVoucherSerieNumFromZetaMetadata(row);
          if (sn && sn.serie === ser && sn.numero === num && typeof row.id === "string") {
            return row.id;
          }
        }
      }
      if (typed.length === 1 && typeof typed[0].id === "string") {
        return typed[0].id;
      }
    }
  }

  return null;
}

export type SyncZetaCustomerVouchersParams = {
  supabase: OperationalSupabase;
  ctx: ZetaCallContext;
  workspaceCompanyId: string;
  filters: ZetaCustomerVouchersQueryFilters;
};

export type SyncZetaCustomerVouchersResult = {
  success: boolean;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  /** Filas excluidas solo por el clasificador (factura vs recibo / CFE DGI). */
  skipped_classifier?: number;
  /** Filas devueltas por Zeta en la corrida (suma de páginas). */
  zeta_rows_total?: number;
  errors: number;
  duration_ms: number;
  zeta_method: string;
  root_in_key?: string;
  /** Error principal para API (fetch Zeta o excepción pipeline). */
  error?: string;
  error_code?: string;
  details?: Record<string, unknown>;
  message?: string;
  /** Resultado del pipeline de currency enrichment ejecutado post-sync. Ausente si no corrió. */
  currency_enrichment?: CurrencyEnrichmentResult;
};

export async function syncZetaCustomerVouchers(
  params: SyncZetaCustomerVouchersParams
): Promise<SyncZetaCustomerVouchersResult> {
  const started = Date.now();
  const zeta_method = resolveZetaCustomerVouchersRestMethod();
  const root_in_key = resolveZetaCustomerVouchersRootInKey();
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
      root_in_key,
      error: "workspace_company_id vacío.",
      error_code: "validation",
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
      root_in_key,
      error: "Mes (1-12) y año (AAAA) son obligatorios para la Query Zeta.",
      error_code: "validation",
      message: "Mes (1-12) y año (AAAA) son obligatorios para la Query Zeta.",
    };
  }

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zeta_customer_vouchers_sync",
      kind: "pipeline_start",
      zeta_method,
      root_in_key,
      filters: params.filters,
      workspace_company_id: wid,
      request_id: params.ctx.requestId,
    })
  );

  let runId: string | null = null;
  let lastRootInKey = root_in_key;
  try {
    console.log("🔥 LAYER:", "zeta-customer-vouchers-pipeline.ts → try (main sync body)");
    const prior = await selectZetaSyncStateByResource(params.supabase, ZETA_CUSTOMER_VOUCHERS_RESOURCE_FLOW);
    const syncMode: ZetaSyncMode = prior?.bootstrap_completed ? "incremental" : "bootstrap";
    console.log("🔥 BEFORE insertZetaSyncRun");
    const run = await insertZetaSyncRun(params.supabase, {
      resource_flow: ZETA_CUSTOMER_VOUCHERS_RESOURCE_FLOW,
      sync_mode: syncMode,
      status: "running",
      company_id: wid,
    });
    runId = run.id;
    console.log("🔥 AFTER insertZetaSyncRun", runId);
    const zetaCtx: ZetaCallContext = { ...params.ctx, syncRunId: runId };

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

    const columnSet = await loadInvoiceColumns(params.supabase);
    const hasZetaMeta = columnSet.has("zeta_metadata");

    let page = 1;
    let hasMore = true;
    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let rowsReceived = 0;
    let skippedClassifier = 0;
    let skippedClassifierReciboText = 0;
    let skippedClassifierCfeNotDgi = 0;
    const classifierSkipSamples: Array<{
      TipoComprobanteNombre: unknown;
      CFETipo: unknown;
      Nombre: unknown;
      reject: string;
      looksLikeReciboCobranza: boolean;
    }> = [];

    console.log("🔥 BEFORE while loop");
    while (hasMore && page <= MAX_PAGES) {
      console.log("🔥 PAGE LOOP START", { page });
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_customer_vouchers_sync",
          kind: "pre_zeta_fetch",
          zeta_method,
          root_in_key,
          page,
          filters: params.filters,
        })
      );
      const res = await fetchPageWithRetry(zetaCtx, String(page), params.filters);
      console.log("🔥 AFTER fetchPageWithRetry", {
        ok: res.ok,
        hasRaw: !!res.raw,
        rows: res.rows?.length ?? null,
        rootInKey: res.root_in_key ?? null,
      });
      if (!res.ok) {
        if (runId && res.raw != null) {
          try {
            await persistCustomerVouchersZetaRawPayload(params.supabase, {
              syncRunId: runId,
              page,
              zetaMethod: res.zeta_method,
              httpStatus: res.httpStatus,
              raw: res.raw,
              filters: params.filters,
            });
          } catch (rawErr) {
            if (!isPostgresUniqueViolation(rawErr)) {
              console.error(
                JSON.stringify({
                  timestamp: new Date().toISOString(),
                  source: "zeta_customer_vouchers_sync",
                  kind: "zeta_raw_payload_insert_failed",
                  page,
                  message: rawErr instanceof Error ? rawErr.message : String(rawErr),
                })
              );
            }
          }
        }
        errors += 1;
        const errMsg = res.errors[0] ?? "Error Zeta";
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            source: "zeta_customer_vouchers_sync",
            kind: "zeta_fetch_failed",
            zeta_method: res.zeta_method,
            root_in_key: res.root_in_key,
            page,
            error_code: res.error_code,
            errors: res.errors,
            http_status: res.httpStatus,
            details: res.details ?? null,
          })
        );
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
            resource_flow: ZETA_CUSTOMER_VOUCHERS_RESOURCE_FLOW,
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
          root_in_key: res.root_in_key,
          error: errMsg,
          error_code: res.error_code,
          details: {
            fetch_errors: res.errors,
            http_status: res.httpStatus,
            ...(res.details ?? {}),
          },
          message: errMsg,
        };
      }

      console.log("🔥 BEFORE RAW PERSIST BLOCK", {
        runId,
        hasRaw: !!res.raw,
      });
      lastRootInKey = res.root_in_key;
      console.log("RAW DEBUG → runId:", runId);
      console.log("RAW DEBUG → res.raw exists:", !!res.raw);
      console.log("RAW DEBUG → entering insert block");
      if (runId) {
        await persistCustomerVouchersZetaRawPayload(params.supabase, {
          syncRunId: runId,
          page,
          zetaMethod: res.zeta_method,
          httpStatus: res.httpStatus,
          raw: res.raw,
          filters: params.filters,
        });
      }
      rowsReceived += res.rows.length;
      console.log("ZETA ROWS TOTAL:", res.rows.length);
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_customer_vouchers_sync",
          kind: "page",
          zeta_method: res.zeta_method,
          root_in_key: res.root_in_key,
          page,
          rows_received: res.rows.length,
          http_status: res.httpStatus,
        })
      );

      console.log("ROWS BEFORE INSERT:", res.rows.length);

      const syncedAt = new Date().toISOString();
      for (const row of res.rows) {
        processed += 1;
        const zRow = row as ZetaCustomerVoucherRecord;
        const reject = zetaCustomerVoucherClassifierRejectReason(zRow);
        if (reject !== null) {
          skipped += 1;
          skippedClassifier += 1;
          if (reject.code === "recibo_text") {
            skippedClassifierReciboText += 1;
          } else {
            skippedClassifierCfeNotDgi += 1;
          }
          const z = zRow as Record<string, unknown>;
          if (classifierSkipSamples.length < 3) {
            classifierSkipSamples.push({
              TipoComprobanteNombre: z.TipoComprobanteNombre ?? z.tipoComprobanteNombre,
              CFETipo: z.CFETipo ?? z.cfeTipo ?? z.CfeTipo,
              Nombre: z.Nombre ?? z.nombre,
              reject: reject.code,
              looksLikeReciboCobranza: zetaCustomerVoucherRowLooksLikeReciboCobranza(zRow),
            });
          }
          console.log(
            "ROW SKIP: no es factura/CFE para proto_invoices (recibo de cobranza u otro no CFE DGI)",
            JSON.stringify({
              motivo: "classifier_voucher_pipeline_invoices_only",
              reject,
              cfe_tipo: z.CFETipo ?? z.cfeTipo,
            })
          );
          continue;
        }
        const mapped = mapZetaCustomerVoucherToCopilot(zRow);
        if (!copilotCustomerVoucherHasPersistableIdentity(mapped)) {
          skipped += 1;
          console.log(
            "ROW SKIP: mapper rejected row",
            JSON.stringify({
              zeta_comprobante_codigo: mapped.zeta_comprobante_codigo,
              serie: mapped.serie,
              numero: mapped.numero,
              motivo: "sin ComprobanteCodigo y sin Serie+Numero válidos (encabezado Zeta)",
            })
          );
          continue;
        }

        const codigoCliente = mapped.zeta_cliente_codigo;
        const rutNorm = mapped.cliente_documento ? normalizeRutForMatch(mapped.cliente_documento) : null;
        const companyId =
          (codigoCliente && byCodigo.get(codigoCliente)) ?? (rutNorm ? byRut.get(rutNorm) ?? undefined : undefined);
        if (!companyId) {
          skipped += 1;
          const reasons: string[] = [];
          if (!codigoCliente?.trim()) reasons.push("fila_sin_ClienteCodigo_o_vacio");
          else if (!byCodigo.has(codigoCliente)) reasons.push("ClienteCodigo_no_coincide_con_ningun_proto_companies.Codigo");
          if (!mapped.cliente_documento?.trim()) reasons.push("fila_sin_ClienteDocumento_mapeable");
          else if (!rutNorm) reasons.push("documento_no_normalizable_a_RUT");
          else if (!byRut.has(rutNorm)) reasons.push("RUT_normalizado_no_coincide_con_ningun_proto_companies.RUT");
          console.log(
            "ROW SKIP: no company match",
            JSON.stringify({
              zeta_cliente_codigo_received: codigoCliente ?? null,
              cliente_documento_mapped: mapped.cliente_documento,
              rut_normalized: rutNorm,
              match_rules: "solo_Codigo_o_RUT_documento_nunca_nombre",
              reasons,
              proto_companies_codigo_sample: [...byCodigo.keys()].slice(0, 12),
            })
          );
          continue;
        }

        const mapResult = mapCopilotCustomerVoucherToProtoInvoiceInput(companyId, mapped, runId ?? "");
        if (!mapResult.ok) {
          // H1 fix: anti-fallback `new Date()`. Pre-operational guard.
          // Si `fecha_emision` no parsea o es pre-2026, NO persistimos.
          // Se cuenta como error del sync para trazabilidad.
          errors += 1;
          const logExtra =
            mapResult.reason === "invalid_fecha_emision"
              ? { raw_fecha_emision: mapResult.raw_fecha_emision }
              : { issue_date: mapResult.issue_date };
          console.log(
            `ROW SKIP: ${mapResult.reason}`,
            JSON.stringify({
              timestamp: new Date().toISOString(),
              source: "zeta_customer_vouchers_sync",
              kind: mapResult.reason === "pre_operational_date"
                ? "row_skip_pre_operational_fecha_emision"
                : "row_skip_invalid_fecha_emision",
              reason: mapResult.reason,
              ...logExtra,
              serie: mapped.serie ?? null,
              numero: mapped.numero ?? null,
              zeta_comprobante_codigo: mapped.zeta_comprobante_codigo ?? null,
              zeta_cliente_codigo: mapped.zeta_cliente_codigo ?? null,
              zeta_empresa_codigo: mapped.zeta_empresa_codigo ?? null,
              workspace_company_id: wid,
              company_id: companyId,
              sync_run_id: runId ?? null,
            })
          );
          continue;
        }
        const input = mapResult.input;
        const invNum = buildZetaCustomerVoucherInvoiceNumber(mapped);
        const legacyInvNum = buildZetaCustomerVoucherInvoiceNumberLegacyHash(mapped);
        const persistIdentityLog = {
          invoice_number_final: invNum,
          invoice_number_from_mapper_input: input.invoice_number,
          serie: mapped.serie,
          numero: mapped.numero,
          clienteCodigo: mapped.zeta_cliente_codigo,
          empresaCodigo: mapped.zeta_empresa_codigo,
        };
        const existingId = await findActiveInvoiceIdForZetaCustomerVoucher(
          params.supabase,
          wid,
          companyId,
          invNum,
          legacyInvNum,
          mapped.serie,
          mapped.numero,
          mapped
        );

        if (existingId) {
          logZetaVoucherPersistIdentity("protoUpdateInvoice", persistIdentityLog);
          const up = await protoUpdateInvoice(
            params.supabase,
            existingId,
            {
              invoice_number: invNum,
              issue_date: input.issue_date,
              due_date: input.due_date,
              total_amount: input.total_amount,
              balance_amount: input.balance_amount,
              status: input.status,
              category: input.category,
              notes: input.notes,
            },
            wid,
            { allowBalanceGtTotal: true }
          );
          if (!up.ok) {
            errors += 1;
            console.log(
              "ROW SKIP: proto persist failed",
              JSON.stringify({
                op: "protoUpdateInvoice",
                code: up.code,
                message: up.message,
                invoice_number: invNum,
              })
            );
          } else {
            updated += 1;
            if (hasZetaMeta) {
              await mergeInvoiceZetaMetadata(params.supabase, existingId, {
                ...mapped,
                synced_at: syncedAt,
              });
            }
          }
        } else {
          logZetaVoucherPersistIdentity("protoCreateInvoice", persistIdentityLog);
          const inputForCreate = { ...input, invoice_number: invNum };
          const cr = await protoCreateInvoice(params.supabase, inputForCreate, wid, { allowBalanceGtTotal: true });
          if (!cr.ok) {
            errors += 1;
            console.log(
              "ROW SKIP: proto persist failed",
              JSON.stringify({
                op: "protoCreateInvoice",
                code: cr.code,
                message: cr.message,
                invoice_number: invNum,
              })
            );
          } else {
            inserted += 1;
            if (hasZetaMeta && cr.data && typeof (cr.data as { id?: unknown }).id === "string") {
              const newId = (cr.data as { id: string }).id;
              await mergeInvoiceZetaMetadata(params.supabase, newId, { ...mapped, synced_at: syncedAt });
            }
          }
        }
      }

      hasMore = res.hasMore;
      console.log("ZETA ROWS SKIPPED (classifier, cumulative):", skippedClassifier);
      page += 1;
    }

    console.log("ZETA ROWS SKIPPED:", skippedClassifier);
    if (classifierSkipSamples.length > 0) {
      console.log("ZETA CLASSIFIER SKIP EXAMPLES (max 3):", JSON.stringify(classifierSkipSamples, null, 2));
    }
    const allSkipsDueToReciboTextHeuristic =
      skippedClassifier > 0 &&
      skippedClassifierCfeNotDgi === 0 &&
      skippedClassifierReciboText === skippedClassifier;
    console.log(
      "ZETA CLASSIFIER ALL SKIPS DUE TO zetaCustomerVoucherRowLooksLikeReciboCobranza:",
      skippedClassifier === 0 ? "n/a (no hubo skips por clasificador)" : String(allSkipsDueToReciboTextHeuristic)
    );
    console.log(
      JSON.stringify({
        total: rowsReceived,
        skipped: skippedClassifier,
        inserted,
        updated,
      })
    );

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
        resource_flow: ZETA_CUSTOMER_VOUCHERS_RESOURCE_FLOW,
        company_id: wid,
        watermark: JSON.stringify({ last_sync_at: nowIso, mes, anio }),
        watermark_type: "timestamp",
        bootstrap_completed: errors === 0 ? true : prior?.bootstrap_completed ?? false,
        last_success_at: errors === 0 ? nowIso : prior?.last_success_at ?? null,
        last_success_run_id: errors === 0 ? runId : prior?.last_success_run_id ?? null,
        last_run_id: runId,
      });
    }

    const durationMs = Date.now() - started;
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_customer_vouchers_sync",
        kind: "summary",
        zeta_method,
        processed,
        inserted,
        updated,
        skipped,
        skipped_classifier: skippedClassifier,
        skipped_classifier_recibo_text: skippedClassifierReciboText,
        skipped_classifier_cfe_not_dgi: skippedClassifierCfeNotDgi,
        errors,
        rows_received_total: rowsReceived,
        duration_ms: durationMs,
      })
    );
    console.log(
      "FINAL SUMMARY customer_vouchers:",
      `processed=${processed} inserted=${inserted} updated=${updated} skipped=${skipped} skipped_classifier=${skippedClassifier} errors=${errors} rows_received=${rowsReceived} duration_ms=${durationMs}`
    );

    // Post-sync: currency enrichment (non-blocking — errors never break main sync)
    let currencyEnrichment: CurrencyEnrichmentResult | undefined;
    try {
      currencyEnrichment = await runCurrencyEnrichmentPipeline(
        params.supabase,
        wid,
        zetaCtx,
        { mes, anio }
      );
    } catch (enrichErr) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "zeta_customer_vouchers_sync",
          kind: "currency_enrichment_warning",
          message: enrichErr instanceof Error ? enrichErr.message : String(enrichErr),
        })
      );
    }

    return {
      success: true,
      processed,
      inserted,
      updated,
      skipped,
      skipped_classifier: skippedClassifier,
      zeta_rows_total: rowsReceived,
      errors,
      duration_ms: durationMs,
      zeta_method,
      root_in_key: lastRootInKey,
      currency_enrichment: currencyEnrichment,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_customer_vouchers_sync",
        kind: "pipeline_exception",
        zeta_method,
        root_in_key,
        message: msg,
        stack,
      })
    );
    if (runId) {
      await updateZetaSyncRunById(params.supabase, runId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: msg.slice(0, 2000),
        error_code: "pipeline_exception",
      });
      await upsertZetaSyncState(params.supabase, {
        resource_flow: ZETA_CUSTOMER_VOUCHERS_RESOURCE_FLOW,
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
      root_in_key,
      error: msg,
      error_code: "pipeline_exception",
      details: { stack },
      message: msg,
    };
  }
}
