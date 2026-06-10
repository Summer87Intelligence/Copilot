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
 *   - En dev devolvemos `{stage, requestId }` para facilitar debug.
 *     En prod solo `requestId` + mensaje seguro.
 */

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { readInvoiceZetaClientName } from "@/lib/copilot-clients-directory";
import {
  generateFinancialConsistencyReport,
  invoiceInputFromProtoRow,
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
import { mergeZetaSyncStateRows } from "@/lib/integrations/zeta/zeta-sync-resource-keys";
import { buildInstallmentCoverageDiagnostics } from "@/lib/copilot-installment-coverage";
import { buildFinancialReconciliationDatasetCaps } from "@/lib/copilot-financial-reconciliation-dataset-caps";
import { computeInstallmentAging } from "@/lib/copilot-installment-aging";
import {
  buildAgingComparativeDiagnostics,
  resolveAgingMode,
} from "@/lib/copilot-installment-aging-delta";
import { buildInstallmentAgingObservation } from "@/lib/copilot-installment-aging-observation";
import type { FinancialReconciliationDiagnostics } from "@/lib/copilot-financial-reconciliation";
import {
  DEFAULT_MAX_ROWS,
  DEFAULT_PAGE_SIZE,
  fetchAllRows,
  fetchAllRowsSafe,
} from "@/lib/supabase-pagination";
import { COPILOT_INTERNAL_ERROR_MESSAGE } from "@/lib/api/copilot-request-errors";

// CRÍTICO: el reporte debe recalcularse en cada request porque depende del
// `period_start`/`period_end` recibidos por query string. Sin `force-dynamic`
// + `revalidate = 0`, el Data Cache de Next puede servir respuestas stale
// para la misma URL entre rangos confirmados sucesivos en `/copilot/cartera`.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

const FINANCIAL_RECON_PAGE_SIZE = (() => {
  const raw = process.env.FINANCIAL_RECONCILIATION_PAGE_SIZE;
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAGE_SIZE;
})();

const FINANCIAL_RECON_MAX_ROWS = (() => {
  const raw = process.env.FINANCIAL_RECONCILIATION_MAX_ROWS;
  if (!raw) return DEFAULT_MAX_ROWS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ROWS;
})();

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
    "invoices" | "receipts" | "companies" | "syncStates" | "installments",
    number | null
  > = {
    invoices: null,
    receipts: null,
    companies: null,
    syncStates: null,
    installments: null,
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
    const auth = await requireCopilotModuleAccess(request, "finanzas");
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
    const agingMode = resolveAgingMode(
      process.env.AGING_MODE,
      params.get("aging_mode")
    );

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

    // Carga paralela con paginación `.range(from, to)` (A-02 / FIX-8).
    stage = "load_data";

    const paginationOpts = {
      pageSize: FINANCIAL_RECON_PAGE_SIZE,
      maxRows: FINANCIAL_RECON_MAX_ROWS,
    };

    let invoiceFetch;
    let companyFetch;
    let receiptFetch;
    let installmentFetch;
    let syncRes;

    try {
      [invoiceFetch, companyFetch, receiptFetch, installmentFetch, syncRes] = await Promise.all([
        fetchAllRows<Record<string, unknown>>({
          ...paginationOpts,
          queryPage: (from, to) =>
            supabase
              .from("proto_invoices")
              .select(
                "id, company_id, currency_code, total_amount, balance_amount, status, updated_at, issue_date, due_date, due_date_source, category, invoice_number, zeta_metadata"
              )
              .eq("workspace_company_id", workspaceId)
              .eq("is_active", true)
              .gte("issue_date", MIN_FINANCIAL_DATE)
              .order("id", { ascending: true })
              .range(from, to),
        }),
        fetchAllRowsSafe<Record<string, unknown>>({
          ...paginationOpts,
          queryPage: (from, to) =>
            supabase
              .from("proto_companies")
              .select("id, name")
              .eq("workspace_company_id", workspaceId)
              .eq("is_active", true)
              .order("id", { ascending: true })
              .range(from, to),
        }),
        fetchAllRowsSafe<Record<string, unknown>>({
          ...paginationOpts,
          queryPage: (from, to) => {
            let q = supabase
              .from("proto_receipts")
              .select("id, company_id, currency_code, amount, receipt_date, status")
              .eq("workspace_company_id", workspaceId)
              .eq("is_active", true)
              .gte("receipt_date", MIN_FINANCIAL_DATE);
            if (mode === "period_only" && periodEnd) {
              q = q.lte("receipt_date", periodEnd);
            }
            return q
              .order("receipt_date", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to);
          },
        }),
        fetchAllRowsSafe<Record<string, unknown>>({
          ...paginationOpts,
          queryPage: (from, to) =>
            supabase
              .from("proto_invoice_installments")
              .select(
                "invoice_id, currency_code, cuota_saldo, cuota_total, cuota_vencimiento"
              )
              .eq("workspace_company_id", workspaceId)
              .order("cuota_vencimiento", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
        }),
        supabase
          .from("zeta_sync_state")
          .select("resource_flow, last_success_at, bootstrap_completed")
          .eq("company_id", workspaceId)
          .order("resource_flow"),
      ]);
    } catch (invoiceErr) {
      const message =
        invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr);
      stage = "load_invoices_failed";
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error",
          request_id: requestId,
          table: "proto_invoices",
          workspace_id: workspaceId,
        })
      );
      emitTiming({ critical_error: true });
      return NextResponse.json(
        {
          ok: false,
          code: "DB_ERROR",
          message,
          stage,
          requestId,
        },
        { status: 500 }
      );
    }
    mark("load_data_ms");

    counts.invoices = invoiceFetch.totalFetched;

    if (companyFetch.fetchError) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "proto_companies",
          error: companyFetch.fetchError,
          workspace_id: workspaceId,
          impact: "company names empty",
        })
      );
    }
    counts.companies = companyFetch.totalFetched;

    if (installmentFetch.fetchError) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "proto_invoice_installments",
          error: installmentFetch.fetchError,
          workspace_id: workspaceId,
          impact: "installment_coverage diagnostics omitted",
        })
      );
    }
    counts.installments = installmentFetch.totalFetched;

    if (receiptFetch.fetchError) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "proto_receipts",
          error: receiptFetch.fetchError,
          workspace_id: workspaceId,
          impact: "collected_in_period y opening_balance no calculables",
        })
      );
    }
    counts.receipts = receiptFetch.totalFetched;

    if (syncRes.error) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "db_error_degraded",
          request_id: requestId,
          table: "zeta_sync_state",
          error: COPILOT_INTERNAL_ERROR_MESSAGE,
          workspace_id: workspaceId,
          impact: "sync freshness badges no disponibles",
        })
      );
    }
    counts.syncStates = syncRes.data?.length ?? 0;

    const datasetDiagnostics = buildFinancialReconciliationDatasetCaps({
      maxRows: FINANCIAL_RECON_MAX_ROWS,
      invoices: invoiceFetch,
      receipts: receiptFetch,
      companies: companyFetch,
    });

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
    const invoiceData = invoiceFetch.rows;
    const companyData = companyFetch.fetchError ? [] : companyFetch.rows;
    const receiptData = receiptFetch.fetchError ? [] : receiptFetch.rows;
    const syncData = syncRes.error ? [] : syncRes.data;

    const invoices: InvoiceInput[] = (
      (invoiceData ?? []) as Record<string, unknown>[]
    ).map((r) => {
      if (typeof r.total_amount === "string") rawStringAmounts++;
      if (typeof r.balance_amount === "string") rawStringBalances++;
      const mapped = invoiceInputFromProtoRow(r);
      if (mapped.is_credit_note) creditNoteCount++;
      return {
        ...mapped,
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

    const diagnostics: FinancialReconciliationDiagnostics = {
      ...datasetDiagnostics,
    };
    let pendingInstResult: ReturnType<typeof computeInstallmentAging> | null = null;

    if (!installmentFetch.fetchError) {
      const installmentData = installmentFetch.rows;
      const mappedInstallments = (
        (installmentData ?? []) as Record<string, unknown>[]
      ).map((r) => ({
        invoice_id: r.invoice_id != null ? String(r.invoice_id) : null,
        currency_code: r.currency_code != null ? String(r.currency_code) : null,
        cuota_saldo: toSafeNumber(r.cuota_saldo),
        cuota_total: toSafeNumber(r.cuota_total),
        cuota_vencimiento:
          r.cuota_vencimiento != null ? String(r.cuota_vencimiento) : null,
      }));

      diagnostics.installment_coverage = buildInstallmentCoverageDiagnostics({
        invoices: invoices.map((inv) => ({
          id: inv.id,
          company_id: inv.company_id,
          balance_amount: inv.balance_amount,
          due_date: inv.due_date ?? null,
          due_date_source: inv.due_date_source ?? null,
          status: inv.status,
        })),
        installments: mappedInstallments,
      });

      if (agingMode !== "legacy") {
        pendingInstResult = computeInstallmentAging(
          mappedInstallments,
          new Date().toISOString()
        );
      }
    }

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
      diagnostics,
    });

    // Attach shadow aging comparative after report — requires report.agingByCurrency.
    if (pendingInstResult) {
      diagnostics.aging_comparative = buildAgingComparativeDiagnostics(
        pendingInstResult,
        report.agingByCurrency,
        agingMode
      );

      diagnostics.aging_observation = buildInstallmentAgingObservation({
        installments: (
          (installmentFetch.rows ?? []) as Record<string, unknown>[]
        ).map((r) => ({
          invoice_id: r.invoice_id != null ? String(r.invoice_id) : null,
          currency_code: r.currency_code != null ? String(r.currency_code) : null,
          cuota_saldo: toSafeNumber(r.cuota_saldo),
          cuota_vencimiento:
            r.cuota_vencimiento != null ? String(r.cuota_vencimiento) : null,
        })),
        invoices: invoices.map((inv) => ({
          id: inv.id,
          company_id: inv.company_id ?? null,
          currency_code: inv.currency_code ?? null,
          balance_amount: inv.balance_amount,
          status: inv.status,
          due_date: inv.due_date ?? null,
          due_date_source: inv.due_date_source ?? null,
          issue_date: inv.issue_date ?? null,
        })),
        companies,
        agingComparative: diagnostics.aging_comparative,
        installmentCoverage: diagnostics.installment_coverage,
        now: new Date().toISOString(),
      });
    }
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
        truncated: datasetDiagnostics.dataset_caps.isTruncated,
        dataset_caps: datasetDiagnostics.dataset_caps,
        installment_coverage: diagnostics.installment_coverage ?? null,
        aging_mode: agingMode,
        aging_comparative: diagnostics.aging_comparative ?? null,
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

    // Shadow aging observability log (solo cuando está activo el shadow mode)
    if (diagnostics.aging_comparative && diagnostics.aging_observation) {
      const obs = diagnostics.aging_observation;
      const comp = diagnostics.aging_comparative;
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "financial_reconciliation",
          kind: "installment_aging_shadow",
          request_id: requestId,
          workspace_id: workspaceId,
          aging_mode: agingMode,
          legacy_overdue_by_currency: comp.installment_vs_legacy_delta.byCurrency.map((d) => ({
            currency: d.currency,
            legacy_overdue: d.legacy_overdue_total,
            installment_overdue: d.installment_overdue_total,
            delta: d.diff,
            hidden_overdue: d.hidden_overdue,
          })),
          total_hidden_overdue: comp.installment_vs_legacy_delta.total_hidden_overdue,
          affected_clients: obs.top_underestimated_clients.length,
          overdue_invoice_count: comp.installment_vs_legacy_delta.overdue_invoice_count,
          mixed_aging_invoice_count: comp.installment_vs_legacy_delta.mixed_aging_invoice_count,
          recommendation: comp.installment_vs_legacy_delta.recommendation,
          switch_readiness: obs.switch_readiness,
        })
      );
    }

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
        /** @deprecated use max_rows — kept for cartera RowCapBanner compat */
        invoice_limit: FINANCIAL_RECON_MAX_ROWS,
        max_rows: FINANCIAL_RECON_MAX_ROWS,
        page_size: FINANCIAL_RECON_PAGE_SIZE,
        invoices_loaded: invoices.length,
        receipts_loaded: receiptData.length,
        companies_loaded: companyData.length,
        truncated: datasetDiagnostics.dataset_caps.isTruncated,
        pages_fetched: datasetDiagnostics.dataset_caps.pages_fetched,
        dataset_caps: datasetDiagnostics.dataset_caps,
        installment_coverage: diagnostics.installment_coverage ?? null,
        aging_mode: agingMode,
        aging_comparative: diagnostics.aging_comparative ?? null,
        aging_observation: diagnostics.aging_observation ?? null,
        installments_loaded: installmentFetch.fetchError
          ? 0
          : installmentFetch.totalFetched,
        excluded_by_min_financial_date: report.excludedByMinFinancialDateCount,
        excluded_receipts_by_min_financial_date: report.excludedByMinFinancialDateReceiptCount,
        requestId,
      },
    });
    mark("serialize_response_ms");

    stage = "done";
    emitTiming({
      degraded: {
        companies: !!companyFetch.fetchError,
        receipts: !!receiptFetch.fetchError,
        syncStates: !!syncRes.error,
      },
    });

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
