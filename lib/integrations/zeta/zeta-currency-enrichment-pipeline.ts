/**
 * Pipeline de enriquecimiento de moneda: cruza VentasDetalladas con proto_invoices
 * y escribe currency_code + zeta_metadata.zeta_customer_voucher_v1.{moneda_codigo, moneda_simbolo, moneda_source}.
 *
 * Solo actualiza moneda. NO toca total_amount, balance_amount, fechas, ni clientes.
 * Diseñado para ejecutarse automaticamente despues de cada sync de comprobantes Zeta.
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import { fetchZetaVentasDetalladas } from "@/lib/integrations/zeta/zeta-ventas-detalladas-fetch";
import { normalizeZetaCurrency } from "@/lib/integrations/zeta/zeta-currency-normalize";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";

const MONEDA_SOURCE = "zeta_ventas_detalladas_v1" as const;

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export type CurrencyEnrichmentResult = {
  ok: boolean;
  dry_run: boolean;
  mes: string;
  anio: string;
  ventas_rows_fetched: number;
  unique_invoices_in_ventas: number;
  invoices_found: number;
  invoices_updated: number;
  invoices_skipped: number;
  invoices_not_matched: number;
  errors: number;
  error?: string;
  duration_ms: number;
};

export type CurrencyEnrichmentOptions = {
  /** Si true: calcula cambios pero NO escribe en DB. Util para debugging. Default: false. */
  dryRun?: boolean;
  /** Intentos maximos al llamar VentasDetalladas. Default: 2. */
  retries?: number;
};

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type CurrencyInfo = {
  moneda_codigo: string | null;
  moneda_simbolo: string | null;
  currency_code: "USD" | "UYU" | null;
};

type ProtoInvoiceRow = {
  id: string;
  invoice_number: string;
  zeta_metadata: unknown;
  currency_code: string | null;
};

type RowOutcome = "updated" | "skipped" | "not_matched" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStr(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

function normalizeToIso(simbolo: string | null, codigoRaw: string | null): "USD" | "UYU" | null {
  return normalizeZetaCurrency(null, simbolo, codigoRaw);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Construye mapa `{clienteCodigo}|{serie}|{numero}` → CurrencyInfo.
 * VentasDetalladas es linea-nivel; agrega por factura tomando el primer registro de cada key.
 */
function buildCurrencyMap(rows: readonly Record<string, unknown>[]): Map<string, CurrencyInfo> {
  const map = new Map<string, CurrencyInfo>();
  for (const row of rows) {
    const serie = readStr(row, "FacturaSerie", "facturaSerie", "Serie", "serie");
    const numero = readStr(row, "FacturaNumero", "facturaNumero", "Numero", "numero");
    const cliente = readStr(row, "ClienteCodigo", "clienteCodigo");
    if (!serie || !numero) continue;

    const key = `${cliente ?? ""}|${serie}|${numero}`;
    if (map.has(key)) continue;

    const moneda_simbolo = readStr(row, "MonedaSimbolo", "monedaSimbolo");
    const moneda_codigo = readStr(row, "MonedaCodigo", "monedaCodigo");
    map.set(key, {
      moneda_codigo,
      moneda_simbolo,
      currency_code: normalizeToIso(moneda_simbolo, moneda_codigo),
    });
  }
  return map;
}

async function loadInvoicesForPeriod(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  mes: string,
  anio: string
): Promise<ProtoInvoiceRow[]> {
  const y = anio.padStart(4, "0");
  const m = mes.padStart(2, "0");
  const dateFrom = `${y}-${m}-01`;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const dateTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await client
    .from("proto_invoices")
    .select("id, invoice_number, zeta_metadata, currency_code")
    .eq("workspace_company_id", workspaceCompanyId)
    .gte("issue_date", dateFrom)
    .lte("issue_date", dateTo);

  if (error) throw new Error(error.message);
  return (data ?? []) as ProtoInvoiceRow[];
}

/**
 * Extrae {clienteCodigo, serie, numero} del invoice_number semántico.
 * Soporta dos formatos:
 *   - ZETA:CCV1:{empresa}:{cliente}:{serie}:{numero}   — formato vouchers pipeline
 *   - ZETA:{RegistroId}                                — formato fallback saldos pipeline
 *     Para el segundo caso lee zeta_metadata para extraer serie/numero si están disponibles.
 */
function parseInvoiceNumberParts(
  invNum: string,
  zetaMetadata?: unknown
): { clienteCodigo: string; serie: string; numero: string } | null {
  // Formato principal CCV1
  if (invNum.startsWith("ZETA:CCV1:")) {
    const parts = invNum.slice("ZETA:CCV1:".length).split(":");
    if (parts.length < 4) return null;
    const [, cliente, serie, numero] = parts;
    if (!serie || !numero) return null;
    return { clienteCodigo: cliente ?? "", serie, numero };
  }

  // Formato fallback ZETA:{RegistroId} — intentar extraer desde zeta_metadata
  if (invNum.startsWith("ZETA:") && !invNum.startsWith("ZETA:CCV1:")) {
    if (zetaMetadata == null || typeof zetaMetadata !== "object" || Array.isArray(zetaMetadata)) {
      return null;
    }
    const meta = zetaMetadata as Record<string, unknown>;
    // Intentar desde zeta_comprobante_identity_v1
    const identity = meta.zeta_comprobante_identity_v1;
    if (identity && typeof identity === "object" && !Array.isArray(identity)) {
      const id = identity as Record<string, unknown>;
      const serie = readStr(id, "FacturaSerie", "Serie", "serie");
      const numero = readStr(id, "FacturaNumero", "Numero", "numero");
      const cliente = readStr(id, "ClienteCodigo", "clienteCodigo");
      if (serie && numero) return { clienteCodigo: cliente ?? "", serie, numero };
    }
    // Intentar desde zeta_customer_voucher_v1
    const voucherV1 = meta.zeta_customer_voucher_v1;
    if (voucherV1 && typeof voucherV1 === "object" && !Array.isArray(voucherV1)) {
      const v = voucherV1 as Record<string, unknown>;
      const serie = readStr(v, "FacturaSerie", "Serie", "serie");
      const numero = readStr(v, "FacturaNumero", "Numero", "numero");
      const cliente = readStr(v, "ClienteCodigo", "clienteCodigo");
      if (serie && numero) return { clienteCodigo: cliente ?? "", serie, numero };
    }
  }

  return null;
}

function lookupCurrencyInfo(
  map: Map<string, CurrencyInfo>,
  clienteCodigo: string,
  serie: string,
  numero: string
): CurrencyInfo | undefined {
  return (
    map.get(`${clienteCodigo}|${serie}|${numero}`) ??
    // Fallback sin clienteCodigo (Consumidor Final con codigo vacio en VentasDetalladas)
    map.get(`|${serie}|${numero}`)
  );
}

async function applyEnrichmentToRow(
  client: OperationalSupabase,
  row: ProtoInvoiceRow,
  info: CurrencyInfo,
  dryRun: boolean
): Promise<"updated" | "skipped" | "error"> {
  try {
    const prevMeta =
      row.zeta_metadata !== null &&
      typeof row.zeta_metadata === "object" &&
      !Array.isArray(row.zeta_metadata)
        ? { ...(row.zeta_metadata as Record<string, unknown>) }
        : {};

    const prevV1 =
      prevMeta.zeta_customer_voucher_v1 !== null &&
      typeof prevMeta.zeta_customer_voucher_v1 === "object" &&
      !Array.isArray(prevMeta.zeta_customer_voucher_v1)
        ? { ...(prevMeta.zeta_customer_voucher_v1 as Record<string, unknown>) }
        : {};

    // Guard rail: no sobreescribir si ya coincide exactamente
    if (
      prevV1.moneda_codigo === info.moneda_codigo &&
      prevV1.moneda_simbolo === info.moneda_simbolo &&
      prevV1.moneda_source === MONEDA_SOURCE
    ) {
      return "skipped";
    }

    if (dryRun) {
      console.info(
        JSON.stringify({
          source: "currency_enrichment",
          kind: "dry_run_would_update",
          id: row.id,
          invoice_number: row.invoice_number,
          prev: { moneda_codigo: prevV1.moneda_codigo, moneda_simbolo: prevV1.moneda_simbolo },
          next: { moneda_codigo: info.moneda_codigo, moneda_simbolo: info.moneda_simbolo, currency_code: info.currency_code },
        })
      );
      return "updated";
    }

    prevV1.moneda_codigo = info.moneda_codigo;
    prevV1.moneda_simbolo = info.moneda_simbolo;
    prevV1.moneda_source = MONEDA_SOURCE;
    prevMeta.zeta_customer_voucher_v1 = prevV1;

    const updatePayload: Record<string, unknown> = { zeta_metadata: prevMeta };
    if (info.currency_code) updatePayload.currency_code = info.currency_code;

    const { error } = await client
      .from("proto_invoices")
      .update(updatePayload)
      .eq("id", row.id);

    if (error) {
      console.error(
        JSON.stringify({
          source: "currency_enrichment",
          kind: "update_error",
          id: row.id,
          invoice_number: row.invoice_number,
          error: error.message,
        })
      );
      return "error";
    }
    return "updated";
  } catch (e) {
    console.error(
      JSON.stringify({
        source: "currency_enrichment",
        kind: "update_exception",
        id: row.id,
        invoice_number: row.invoice_number,
        error: e instanceof Error ? e.message : String(e),
      })
    );
    return "error";
  }
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

export async function runCurrencyEnrichmentPipeline(
  supabase: OperationalSupabase,
  workspaceCompanyId: string,
  ctx: ZetaCallContext,
  filters: { mes: string; anio: string },
  options: CurrencyEnrichmentOptions = {}
): Promise<CurrencyEnrichmentResult> {
  const started = Date.now();
  const { mes, anio } = filters;
  const dryRun = options.dryRun ?? false;
  const maxRetries = Math.max(1, options.retries ?? 2);

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "currency_enrichment",
      kind: "start",
      mes,
      anio,
      dry_run: dryRun,
      max_retries: maxRetries,
      workspace_company_id: workspaceCompanyId,
      request_id: ctx.requestId,
    })
  );

  // 1. Fetch VentasDetalladas con retry
  let fetchResult = await fetchZetaVentasDetalladas(ctx, { mes, anio });
  for (let attempt = 2; attempt <= maxRetries && !fetchResult.ok; attempt++) {
    console.warn(
      JSON.stringify({
        source: "currency_enrichment",
        kind: "fetch_retry",
        attempt,
        error: fetchResult.error,
        error_code: fetchResult.error_code,
      })
    );
    await sleep(500 * attempt);
    fetchResult = await fetchZetaVentasDetalladas(ctx, { mes, anio });
  }

  if (!fetchResult.ok) {
    console.error(
      JSON.stringify({
        source: "currency_enrichment",
        kind: "fetch_failed_all_attempts",
        mes,
        anio,
        error: fetchResult.error,
        error_code: fetchResult.error_code,
      })
    );
    return {
      ok: false,
      dry_run: dryRun,
      mes,
      anio,
      ventas_rows_fetched: 0,
      unique_invoices_in_ventas: 0,
      invoices_found: 0,
      invoices_updated: 0,
      invoices_skipped: 0,
      invoices_not_matched: 0,
      errors: 1,
      error: fetchResult.error,
      duration_ms: Date.now() - started,
    };
  }

  const currencyMap = buildCurrencyMap(fetchResult.rows as Record<string, unknown>[]);

  console.info(
    JSON.stringify({
      source: "currency_enrichment",
      kind: "ventas_fetched",
      mes,
      anio,
      ventas_rows: fetchResult.rows.length,
      unique_invoices: currencyMap.size,
    })
  );

  // 2. Cargar facturas del periodo desde la DB
  let dbInvoices: ProtoInvoiceRow[];
  try {
    dbInvoices = await loadInvoicesForPeriod(supabase, workspaceCompanyId, mes, anio);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        source: "currency_enrichment",
        kind: "db_load_error",
        mes,
        anio,
        error: msg,
      })
    );
    return {
      ok: false,
      dry_run: dryRun,
      mes,
      anio,
      ventas_rows_fetched: fetchResult.rows.length,
      unique_invoices_in_ventas: currencyMap.size,
      invoices_found: 0,
      invoices_updated: 0,
      invoices_skipped: 0,
      invoices_not_matched: 0,
      errors: 1,
      error: msg,
      duration_ms: Date.now() - started,
    };
  }

  // 3. Cross-reference y update
  let updated = 0;
  let skipped = 0;
  let notMatched = 0;
  let errors = 0;

  for (const row of dbInvoices) {
    const parts = parseInvoiceNumberParts(row.invoice_number, row.zeta_metadata);
    if (!parts) {
      notMatched++;
      continue;
    }

    const info = lookupCurrencyInfo(currencyMap, parts.clienteCodigo, parts.serie, parts.numero);
    if (!info) {
      notMatched++;
      continue;
    }

    const outcome = await applyEnrichmentToRow(supabase, row, info, dryRun);
    if (outcome === "updated") updated++;
    else if (outcome === "skipped") skipped++;
    else if (outcome === "error") errors++;
  }

  const result: CurrencyEnrichmentResult = {
    ok: errors === 0,
    dry_run: dryRun,
    mes,
    anio,
    ventas_rows_fetched: fetchResult.rows.length,
    unique_invoices_in_ventas: currencyMap.size,
    invoices_found: dbInvoices.length,
    invoices_updated: updated,
    invoices_skipped: skipped,
    invoices_not_matched: notMatched,
    errors,
    duration_ms: Date.now() - started,
  };

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "currency_enrichment",
      kind: "summary",
      ...result,
    })
  );

  return result;
}
