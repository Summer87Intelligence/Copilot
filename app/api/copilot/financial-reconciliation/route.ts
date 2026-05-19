/**
 * GET /api/copilot/financial-reconciliation
 *
 * Diagnostic report: currency coverage, pending balances, per-client data staleness,
 * and sync freshness for the authenticated tenant workspace.
 *
 * This is a read-only diagnostic endpoint — it writes nothing to the DB.
 * The core logic lives in `lib/copilot-financial-reconciliation.ts` (pure, testable).
 *
 * Staleness thresholds:
 *   ok           ≤ 24 h since last invoice update
 *   warning      > 24 h
 *   critical     > 72 h
 *   never_synced no invoice updated_at found for client
 *
 * Hardening (mayo 2026):
 *   - Try/catch global con `stage` tracking → cualquier excepción queda
 *     loggeada con stage, requestId, timings, counts parciales.
 *   - Timings por etapa (`performance.now`) para diagnosticar 500 lentos.
 *   - Queries Supabase paralelas (Promise.all) → reduce presión de pool y
 *     latencia total (antes era secuencial: invoices → companies → receipts
 *     → sync, cada una esperando a la anterior).
 *   - Sources opcionales (companies / receipts / sync_state) degradan a `[]`
 *     con warning. Solo `proto_invoices` (crítica) devuelve 500 si falla.
 *   - En dev devolvemos `{stage, requestId, message}` para facilitar debug.
 *     En prod solo `requestId` + mensaje seguro.
 */

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { readInvoiceZetaClientName } from "@/lib/copilot-clients-directory";
import {
  generateFinancialConsistencyReport,
  type CompanyInput,
  type InvoiceInput,
  type ReceiptInput,
  type ReconciliationMode,
  type SyncStateInput,
} from "@/lib/copilot-financial-reconciliation";
import {
  getCopilotOperationalEndDate,
  getCopilotOperationalStartDate,
  MIN_FINANCIAL_DATE,
} from "@/lib/copilot-operational-period";
import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { mergeZetaSyncStateRows } from "@/lib/integrations/zeta/zeta-sync-resource-keys";

// CRÍTICO: el reporte debe recalcularse en cada request porque depende del
// `period_start`/`period_end` recibidos por query string. Sin `force-dynamic`
// + `revalidate = 0`, el Data Cache de Next puede servir respuestas stale
// para la misma URL entre rangos confirmados sucesivos en `/copilot/cartera`.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const INVOICE_LIMIT = 5000;
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function normalizePeriodParam(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim().slice(0, 10);
  return ISO_DATE_RX.test(trimmed) ? trimmed : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Stages observables del pipeline. Sirven como tag en logs para que el
 * operador sepa dónde fall el handler con un solo grep.
 */
type Stage =
  | "init"
  | "auth"
  | "parse_params"
  | "validate_workspace"
  | "load_data"
  | "load_invoices_failed"
  | "map_inputs"
  | "generate_report"
  | "serialize_response"
  | "done";

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const counts: Record<
    "invoices" | "receipts" | "companies" | "syncStates",
    number | null
  > = {
    invoices: null,
    receipts: null,
    companies: null,
    syncStates: null,
  };
  let stage: Stage = "init";
  let workspaceId = "";
  let periodStartCtx: string | null = null;
  let periodEndCtx: string | null = null;
  let modeCtx: ReconciliationMode = "period_only";

  /** Marca un timing acumulado desde t0 con nombre legible (`stage_name_ms`). */
  function mark(name: string): void {
    timings[name] = round2(performance.now() - t0);
  }

  /** Log de timings (no errores). Útil para diagnosticar latencia normal. */
  function emitTiming(extra: Record<string, unknown> = {}): void {
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "financial_reconciliation",
        kind: "financial_reconciliation_timing",
        request_id: requestId,
        workspace_id: workspaceId || null,
        mode: modeCtx,
        period_start: periodStartCtx,
        period_end: periodEndCtx,
        stage,
        counts,
        timings_ms: timings,
        duration_ms: round2(performance.now() - t0),
        ...extra,
      })
    );
  }

  try {
    stage = "auth";
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      mark("auth_ms");
      emitTiming({ auth_ok: false });
      return auth.response;
    }
    const { supabase, tenantCompanyId } = auth.ctx;
    workspaceId = tenantCompanyId.trim();
    mark("auth_ms");

    stage = "parse_params";
    const params = request.nextUrl.searchParams;
    const mode = (params.get("mode") ?? "period_only") as ReconciliationMode;
    modeCtx = mode;

    // Parseo seguro: si `period_start`/`period_end` no respetan YYYY-MM-DD se
    // descartan y se cae al período operativo default (mode=period_only).
    // Esto evita pasar strings basura al motor (que retornaría 0 facturas) y
    // bugs sutiles donde un input parcial contamina el resultado.
    const rawPeriodStart = params.get("period_start");
    const rawPeriodEnd = params.get("period_end");
    const normalizedStart = normalizePeriodParam(rawPeriodStart);
    const normalizedEnd = normalizePeriodParam(rawPeriodEnd);

    const periodStart =
      normalizedStart ??
      (mode === "period_only" ? getCopilotOperationalStartDate() : undefined);
    const periodEnd =
      normalizedEnd ??
      (mode === "period_only" ? getCopilotOperationalEndDate() : undefined);

    periodStartCtx = periodStart ?? null;
    periodEndCtx = periodEnd ?? null;

    if (mode === "period_only" && (!periodStart || !periodEnd)) {
      mark("parse_params_ms");
      emitTiming({ validation_error: "INVALID_PERIOD" });
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_PERIOD",
          message:
            "period_start y period_end deben respetar formato YYYY-MM-DD en mode=period_only.",
          requestId,
        },
        { status: 400 }
      );
    }
    if (
      mode === "period_only" &&
      periodStart &&
      periodEnd &&
      periodStart > periodEnd
    ) {
      mark("parse_params_ms");
      emitTiming({ validation_error: "INVALID_PERIOD_RANGE" });
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_PERIOD_RANGE",
          message: "period_start no puede ser posterior a period_end.",
          requestId,
        },
        { status: 400 }
      );
    }
    mark("parse_params_ms");

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "financial_reconciliation",
        kind: "range_received",
        request_id: requestId,
        workspace_id: workspaceId,
        from: periodStart ?? null,
        to: periodEnd ?? null,
        mode,
        raw_from: rawPeriodStart,
        raw_to: rawPeriodEnd,
      })
    );

    stage = "validate_workspace";
    if (!workspaceId) {
      mark("validate_workspace_ms");
      emitTiming({ validation_error: "FORBIDDEN_TENANT" });
      return NextResponse.json(
        {
          ok: false,
          code: "FORBIDDEN_TENANT",
          message: "Sin workspace válido.",
          requestId,
        },
        { status: 403 }
      );
    }
    mark("validate_workspace_ms");

    // ---- Load all sources in parallel ----
    //
    // Antes eran 4 queries secuenciales (invoices → companies → receipts →
    // sync). Bajo carga (47 requests `collection-actions` en paralelo en la
    // misma página), el pool de Supabase se saturaba y el handler colgaba
    // 10+ segundos sin loggear nada → 500 ciego.
    //
    // Paralelizar reduce el tiempo total al máximo de las 4 (≈ 1 query) y
    // libera slots de pool más rápido.
    //
    // `.order("id")` en invoices garantiza reproducibilidad si se trunca por
    // INVOICE_LIMIT.
    stage = "load_data";
    // MIN_FINANCIAL_DATE filter aplicado a nivel Supabase para evitar que
    // comprobantes históricos (< 2026-01-01) consuman slots del INVOICE_LIMIT.
    // El motor también filtra como segunda línea de defensa.
    let receiptsQuery = supabase
      .from("proto_receipts")
      .select("id, company_id, currency_code, amount, receipt_date, status")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .gte("receipt_date", MIN_FINANCIAL_DATE);
    if (mode === "period_only" && periodEnd) {
      receiptsQuery = receiptsQuery.lte("receipt_date", periodEnd);
    }

    const [invoiceRes, companyRes, receiptRes, syncRes] = await Promise.all([
      supabase
        .from("proto_invoices")
        .select(
          "id, company_id, currency_code, total_amount, balance_amount, status, updated_at, issue_date, due_date, due_date_source, zeta_metadata"
        )
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .gte("issue_date", MIN_FINANCIAL_DATE)
        .order("id", { ascending: true })
        .limit(INVOICE_LIMIT),
      supabase
        .from("proto_companies")
        .select("id, name")
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true),
      receiptsQuery
        .order("receipt_date", { ascending: true })
        .limit(INVOICE_LIMIT),
      supabase
        .from("zeta_sync_state")
        .select("resource_flow, last_success_at, bootstrap_completed")
        .eq("company_id", workspaceId)
        .order("resource_flow"),
    ]);
    mark("load_data_ms");

    // proto_invoices ES la fuente crítica. Sin invoices no hay reporte posible.
    if (invoiceRes.error) {
      stage = "load_invoices_failed";
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error",
          request_id: requestId,
          table: "proto_invoices",
          error: invoiceRes.error.message,
          workspace_id: workspaceId,
        })
      );
      emitTiming({ critical_error: true });
      return NextResponse.json(
        {
          ok: false,
          code: "DB_ERROR",
          message: invoiceRes.error.message,
          stage,
          requestId,
        },
        { status: 500 }
      );
    }
    counts.invoices = invoiceRes.data?.length ?? 0;

    // Sources opcionales: si fallan, degradamos a `[]` con warning. Mejor
    // mostrar reporte parcial (sin nombres de cliente, sin opening balance,
    // sin staleness) que reventar toda la pantalla.
    if (companyRes.error) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "proto_companies",
          error: companyRes.error.message,
          workspace_id: workspaceId,
          impact: "company names empty",
        })
      );
    }
    counts.companies = companyRes.data?.length ?? 0;

    if (receiptRes.error) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "proto_receipts",
          error: receiptRes.error.message,
          workspace_id: workspaceId,
          impact: "collected_in_period y opening_balance no calculables",
        })
      );
    }
    counts.receipts = receiptRes.data?.length ?? 0;

    if (syncRes.error) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "zeta_sync_state",
          error: syncRes.error.message,
          workspace_id: workspaceId,
          impact: "sync freshness badges no disponibles",
        })
      );
    }
    counts.syncStates = syncRes.data?.length ?? 0;

    // ---- Map to typed inputs ----
    //
    // IMPORTANTE: Supabase serializa columnas `numeric` (precio/saldo) como
    // STRING para preservar precisión decimal exacta. Por eso usamos
    // `toSafeNumber` y NO `typeof === "number"`. Si la fila viene como
    // `"1234.56"` (string), `typeof === "number"` la trunca a null y los
    // totales del reporte quedan en 0 — bug que se manifiesta con cards
    // "Pendiente $ 0,00" aunque haya facturas reales con balance > 0.
    stage = "map_inputs";
    let rawStringAmounts = 0;
    let rawStringBalances = 0;
    let creditNoteCount = 0;
    const invoiceData = invoiceRes.data;
    const companyData = companyRes.error ? [] : companyRes.data;
    const receiptData = receiptRes.error ? [] : receiptRes.data;
    const syncData = syncRes.error ? [] : syncRes.data;

    const invoices: InvoiceInput[] = (
      (invoiceData ?? []) as Record<string, unknown>[]
    ).map((r) => {
      if (typeof r.total_amount === "string") rawStringAmounts++;
      if (typeof r.balance_amount === "string") rawStringBalances++;
      const isCreditNote = isCreditNoteFromMetadata(r.zeta_metadata);
      if (isCreditNote) creditNoteCount++;
      return {
        id: String(r.id ?? ""),
        company_id: r.company_id != null ? String(r.company_id) : null,
        currency_code: r.currency_code != null ? String(r.currency_code) : null,
        total_amount: toSafeNumber(r.total_amount),
        balance_amount: toSafeNumber(r.balance_amount),
        status: r.status != null ? String(r.status) : null,
        updated_at: r.updated_at != null ? String(r.updated_at) : null,
        issue_date: r.issue_date != null ? String(r.issue_date) : null,
        due_date: r.due_date != null ? String(r.due_date) : null,
        due_date_source:
          r.due_date_source != null ? String(r.due_date_source) : null,
        is_credit_note: isCreditNote,
        zeta_client_name: readInvoiceZetaClientName(r.zeta_metadata),
        reconciliation_missing_count: (() => {
          try {
            const meta = r.zeta_metadata as Record<string, unknown> | null;
            const rec = meta?.zeta_reconciliation as
              | Record<string, unknown>
              | undefined;
            const count = rec?.pending_sync_missing_count;
            return typeof count === "number" && count > 0 ? count : null;
          } catch {
            return null;
          }
        })(),
      };
    });

    const companies: CompanyInput[] = (
      (companyData ?? []) as Record<string, unknown>[]
    ).map((r) => ({
      id: String(r.id ?? ""),
      name: r.name != null ? String(r.name) : null,
    }));

    const syncStates: SyncStateInput[] = mergeZetaSyncStateRows(
      ((syncData ?? []) as Record<string, unknown>[]).map((r) => ({
        resource_flow: String(r.resource_flow ?? ""),
        last_success_at:
          r.last_success_at != null ? String(r.last_success_at) : null,
        bootstrap_completed: Boolean(r.bootstrap_completed),
      }))
    );

    const receipts: ReceiptInput[] = (
      (receiptData ?? []) as Record<string, unknown>[]
    ).map((r) => ({
      id: String(r.id ?? ""),
      company_id: r.company_id != null ? String(r.company_id) : null,
      currency_code: r.currency_code != null ? String(r.currency_code) : null,
      amount: toSafeNumber(r.amount),
      receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
      status: r.status != null ? String(r.status) : null,
    }));
    mark("map_inputs_ms");

    // ---- Generate report (pure) ----
    stage = "generate_report";
    const report = generateFinancialConsistencyReport({
      workspaceId,
      invoices,
      companies,
      syncStates,
      receipts,
      mode,
      periodStart,
      periodEnd,
    });
    mark("generate_report_ms");

    // ---- Observability logs (existentes) ----
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "financial_reconciliation",
        kind: "report_generated",
        request_id: requestId,
        workspace_id: workspaceId,
        total_invoices: report.totalInvoices,
        invoices_without_currency: report.totalInvoicesWithoutCurrency,
        voided_invoices: report.voidedInvoices,
        truncated: invoices.length >= INVOICE_LIMIT,
        currencies: report.currencies.map((c) => ({
          currency: c.currencyCode,
          total_pending: c.totalPending,
          total_invoiced: c.totalInvoiced,
          invoice_count: c.invoiceCount,
        })),
        stale_summary: report.staleSummary,
        sync_states: report.syncStates.map((s) => ({
          resource_flow: s.resource_flow,
          age_hours: s.ageHours,
          status: s.status,
        })),
        raw_amount_shapes: {
          total_amount_strings: rawStringAmounts,
          balance_amount_strings: rawStringBalances,
          invoices_loaded: invoices.length,
          credit_notes_detected: creditNoteCount,
          excluded_by_min_financial_date: report.excludedByMinFinancialDateCount,
          excluded_receipts_by_min_financial_date: report.excludedByMinFinancialDateReceiptCount,
        },
        duration_ms: round2(performance.now() - t0),
      })
    );

    // Alerta de inconsistencia: si hay facturas cargadas pero el reporte
    // queda con 0 monedas activas o totales en cero, dejamos rastro claro
    // para diagnóstico (sin alterar la respuesta).
    if (
      invoices.length > 0 &&
      (report.currencies.length === 0 ||
        report.currencies.every((c) => c.totalInvoiced === 0))
    ) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "report_amounts_all_zero",
          request_id: requestId,
          workspace_id: workspaceId,
          invoices_loaded: invoices.length,
          currencies_in_report: report.currencies.length,
          total_amount_strings: rawStringAmounts,
          balance_amount_strings: rawStringBalances,
          hint: "Si total_amount_strings > 0, el cliente Supabase devolvió numeric como string. Validar toSafeNumber.",
        })
      );
    }

    stage = "serialize_response";
    const response = NextResponse.json({
      ok: true,
      report,
      meta: {
        invoice_limit: INVOICE_LIMIT,
        invoices_loaded: invoices.length,
        truncated: invoices.length >= INVOICE_LIMIT,
        excluded_by_min_financial_date: report.excludedByMinFinancialDateCount,
        excluded_receipts_by_min_financial_date: report.excludedByMinFinancialDateReceiptCount,
        requestId,
      },
    });
    mark("serialize_response_ms");

    stage = "done";
    emitTiming({ degraded: { companies: !!companyRes.error, receipts: !!receiptRes.error, syncStates: !!syncRes.error } });

    return response;
  } catch (err) {
    const isErr = err instanceof Error;
    const errorPayload = {
      name: isErr ? err.name : "UnknownError",
      message: isErr ? err.message : String(err),
      stack: isErr ? err.stack : undefined,
    };
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "financial_reconciliation",
        kind: "financial_reconciliation_failed",
        request_id: requestId,
        workspace_id: workspaceId || null,
        mode: modeCtx,
        period_start: periodStartCtx,
        period_end: periodEndCtx,
        stage,
        counts,
        timings_ms: timings,
        duration_ms: round2(performance.now() - t0),
        error: errorPayload,
      })
    );

    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      isDev
        ? {
            ok: false,
            error: "financial_reconciliation_failed",
            code: "FINANCIAL_RECONCILIATION_FAILED",
            // Mensaje crudo para la UI en dev: stage + nombre de error + texto +
            // requestId. Permite al desarrollador buscar el log estructurado
            // por `request_id` y reproducir el fallo. En prod queda neutro.
            message: `[${stage}] ${errorPayload.name}: ${errorPayload.message} (requestId=${requestId})`,
            stage,
            requestId,
            errorName: errorPayload.name,
          }
        : {
            ok: false,
            code: "FINANCIAL_RECONCILIATION_FAILED",
            message: `Error interno generando reconciliación financiera. (requestId=${requestId})`,
            requestId,
          },
      { status: 500 }
    );
  }
}
