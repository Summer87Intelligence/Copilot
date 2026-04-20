import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import { fetchInvoiceFinancialBalanceMap } from "@/lib/data/proto-analytics-read-repository";

const ROW_CAP = 5000;
const BALANCE_DIVERGENCE_EPS = 1.0;

export type FinancialConfidence = "high" | "medium" | "low";

export type FinancialCoverage = "full" | "partial" | "insufficient";

export type ValidationIssueSeverity = "blocking" | "warning";

export type ValidationIssue = {
  code: string;
  severity: ValidationIssueSeverity;
  message: string;
  count?: number;
};

/** Contadores y banderas inspeccionables (auditoría mínima ETAPA 1). */
export type FinancialValidationChecks = {
  active_invoices: number;
  active_receipts: number;
  active_payments: number;
  active_companies: number;
  invoices_missing_total_amount: number;
  invoices_missing_due_date: number;
  invoice_balance_divergence_count: number;
  receipts_missing_company_id: number;
  receipts_missing_invoice_id: number;
  payments_missing_company_id: number;
  /** Filas activas cuyo `workspace_company_id` ≠ tenant esperado (debería ser 0). */
  tenant_row_mismatch_invoices: number;
  tenant_row_mismatch_receipts: number;
  tenant_row_mismatch_payments: number;
  /** Vista `invoice_financials` no disponible o sin filas para el tenant. */
  invoice_financials_unavailable: boolean;
  /** Facturas activas sin fila correspondiente en `invoice_financials`. */
  invoices_missing_in_financials_view: number;
  insufficient_for_recommendation: boolean;
};

export type FinancialValidationReport = {
  version: 1;
  checks: FinancialValidationChecks;
  issues: ValidationIssue[];
  /** true si no hay issues `blocking`. */
  validation_ok: boolean;
};

export type FinancialContextGate = {
  validation_report: FinancialValidationReport;
  confidence: FinancialConfidence;
  coverage: FinancialCoverage;
  blocked_reasons: string[];
  /** false si no debe generarse contenido tipo “recomendación” sobre finanzas. */
  recommendations_enabled: boolean;
};

function num(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function isBlankDueDate(v: unknown): boolean {
  const s = String(v ?? "").trim();
  if (!s) return true;
  if (s.length >= 10) {
    const y = Number(s.slice(0, 4));
    return !Number.isFinite(y) || y < 1970 || y > 2100;
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t);
}

function isMissingTotalAmount(v: unknown): boolean {
  const n = num(v);
  return !Number.isFinite(n) || n <= 0;
}

/**
 * Validación conservadora sobre lecturas mínimas del tenant.
 * No modifica datos; solo clasifica riesgo y habilita/inhabilita recomendaciones.
 */
export async function runFinancialDatasetValidation(
  client: OperationalSupabase,
  tenantCompanyId: string
): Promise<FinancialContextGate> {
  const wid = tenantCompanyId.trim();
  const issues: ValidationIssue[] = [];

  const invQ = client
    .from("proto_invoices")
    .select("id,workspace_company_id,total_amount,due_date,balance_amount,is_active")
    .eq("is_active", true)
    .eq("workspace_company_id", wid)
    .limit(ROW_CAP);

  const recQ = client
    .from("proto_receipts")
    .select("id,workspace_company_id,company_id,invoice_id,is_active")
    .eq("is_active", true)
    .eq("workspace_company_id", wid)
    .limit(ROW_CAP);

  const payQ = client
    .from("proto_payments")
    .select("id,workspace_company_id,company_id,is_active")
    .eq("is_active", true)
    .eq("workspace_company_id", wid)
    .limit(ROW_CAP);

  const compQ = client
    .from("proto_companies")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("workspace_company_id", wid);

  const [invRes, recRes, payRes, compCountRes] = await Promise.all([
    invQ,
    recQ,
    payQ,
    compQ,
  ]);

  const checks: FinancialValidationChecks = {
    active_invoices: 0,
    active_receipts: 0,
    active_payments: 0,
    active_companies: 0,
    invoices_missing_total_amount: 0,
    invoices_missing_due_date: 0,
    invoice_balance_divergence_count: 0,
    receipts_missing_company_id: 0,
    receipts_missing_invoice_id: 0,
    payments_missing_company_id: 0,
    tenant_row_mismatch_invoices: 0,
    tenant_row_mismatch_receipts: 0,
    tenant_row_mismatch_payments: 0,
    invoice_financials_unavailable: true,
    invoices_missing_in_financials_view: 0,
    insufficient_for_recommendation: false,
  };

  if (compCountRes.error) {
    issues.push({
      code: "companies_count_query_failed",
      severity: "blocking",
      message: compCountRes.error.message,
    });
  }

  if (invRes.error) {
    issues.push({
      code: "invoices_query_failed",
      severity: "blocking",
      message: invRes.error.message,
    });
  }
  if (recRes.error) {
    issues.push({
      code: "receipts_query_failed",
      severity: "blocking",
      message: recRes.error.message,
    });
  }
  if (payRes.error) {
    issues.push({
      code: "payments_query_failed",
      severity: "blocking",
      message: payRes.error.message,
    });
  }

  const invoices = (invRes.data ?? []) as Record<string, unknown>[];
  const receipts = (recRes.data ?? []) as Record<string, unknown>[];
  const payments = (payRes.data ?? []) as Record<string, unknown>[];

  checks.active_invoices = invoices.length;
  checks.active_receipts = receipts.length;
  checks.active_payments = payments.length;
  checks.active_companies = compCountRes.error
    ? 0
    : (compCountRes.count ?? 0);

  for (const row of invoices) {
    const ws = String(row.workspace_company_id ?? "").trim();
    if (ws && ws !== wid) checks.tenant_row_mismatch_invoices += 1;

    if (isMissingTotalAmount(row.total_amount)) {
      checks.invoices_missing_total_amount += 1;
    }
    if (isBlankDueDate(row.due_date)) {
      checks.invoices_missing_due_date += 1;
    }
  }

  for (const row of receipts) {
    const ws = String(row.workspace_company_id ?? "").trim();
    if (ws && ws !== wid) checks.tenant_row_mismatch_receipts += 1;
    const cid = String(row.company_id ?? "").trim();
    if (!cid) checks.receipts_missing_company_id += 1;
    const iid = String(row.invoice_id ?? "").trim();
    if (!iid) checks.receipts_missing_invoice_id += 1;
  }

  for (const row of payments) {
    const ws = String(row.workspace_company_id ?? "").trim();
    if (ws && ws !== wid) checks.tenant_row_mismatch_payments += 1;
    const cid = String(row.company_id ?? "").trim();
    if (!cid) checks.payments_missing_company_id += 1;
  }

  const invoiceIds = invoices.map((r) => String(r.id ?? "").trim()).filter(Boolean);
  const derivedMap = await fetchInvoiceFinancialBalanceMap(client, wid, invoiceIds);
  checks.invoice_financials_unavailable = derivedMap.size === 0;

  let missingInView = 0;
  for (const inv of invoices) {
    const id = String(inv.id ?? "").trim();
    if (!id) continue;
    if (!derivedMap.has(id)) missingInView += 1;
  }
  checks.invoices_missing_in_financials_view = missingInView;

  if (derivedMap.size > 0) {
    for (const inv of invoices) {
      const id = String(inv.id ?? "").trim();
      if (!id || !derivedMap.has(id)) continue;
      const stored = num(inv.balance_amount);
      const derived = derivedMap.get(id) ?? NaN;
      if (
        Number.isFinite(stored) &&
        Number.isFinite(derived) &&
        Math.abs(stored - derived) > BALANCE_DIVERGENCE_EPS
      ) {
        checks.invoice_balance_divergence_count += 1;
      }
    }
  }

  if (checks.tenant_row_mismatch_invoices > 0) {
    issues.push({
      code: "tenant_mismatch_invoices",
      severity: "blocking",
      message:
        "Facturas activas con workspace_company_id distinto al tenant autenticado.",
      count: checks.tenant_row_mismatch_invoices,
    });
  }
  if (checks.tenant_row_mismatch_receipts > 0) {
    issues.push({
      code: "tenant_mismatch_receipts",
      severity: "blocking",
      message:
        "Recibos activos con workspace_company_id distinto al tenant autenticado.",
      count: checks.tenant_row_mismatch_receipts,
    });
  }
  if (checks.tenant_row_mismatch_payments > 0) {
    issues.push({
      code: "tenant_mismatch_payments",
      severity: "blocking",
      message:
        "Pagos operativos activos con workspace_company_id distinto al tenant autenticado.",
      count: checks.tenant_row_mismatch_payments,
    });
  }

  if (checks.invoices_missing_total_amount > 0) {
    issues.push({
      code: "invoices_missing_total_amount",
      severity: "blocking",
      message:
        "Hay facturas activas sin total_amount válido (> 0). No apto para métricas financieras confiables.",
      count: checks.invoices_missing_total_amount,
    });
  }
  if (checks.invoices_missing_due_date > 0) {
    issues.push({
      code: "invoices_missing_due_date",
      severity: "blocking",
      message:
        "Hay facturas activas sin due_date válido. La deuda vencida no es confiable.",
      count: checks.invoices_missing_due_date,
    });
  }
  if (checks.invoice_balance_divergence_count > 0) {
    issues.push({
      code: "invoice_balance_divergence",
      severity: "blocking",
      message:
        "Saldo en factura (balance_amount) diverge del saldo derivado (invoice_financials) por encima del umbral.",
      count: checks.invoice_balance_divergence_count,
    });
  }
  if (checks.receipts_missing_company_id > 0) {
    issues.push({
      code: "receipts_missing_company_id",
      severity: "blocking",
      message: "Hay recibos activos sin company_id.",
      count: checks.receipts_missing_company_id,
    });
  }
  if (checks.receipts_missing_invoice_id > 0) {
    issues.push({
      code: "receipts_missing_invoice_id",
      severity: "blocking",
      message:
        "Hay recibos activos sin invoice_id; la trazabilidad cobro ↔ factura no está garantizada.",
      count: checks.receipts_missing_invoice_id,
    });
  }
  if (checks.payments_missing_company_id > 0) {
    issues.push({
      code: "payments_missing_company_id",
      severity: "blocking",
      message: "Hay pagos operativos activos sin company_id.",
      count: checks.payments_missing_company_id,
    });
  }

  checks.insufficient_for_recommendation =
    checks.active_invoices < 1 || checks.active_companies < 1;

  if (checks.active_invoices < 1) {
    issues.push({
      code: "insufficient_invoices",
      severity: "blocking",
      message: "No hay facturas activas en el workspace; no hay base para recomendaciones financieras.",
      count: checks.active_invoices,
    });
  }
  if (checks.active_companies < 1) {
    issues.push({
      code: "insufficient_companies",
      severity: "blocking",
      message: "No hay empresas cliente (proto_companies) activas en el workspace.",
      count: checks.active_companies,
    });
  }

  if (checks.active_invoices > 0 && !invRes.error) {
    if (checks.invoice_financials_unavailable) {
      issues.push({
        code: "invoice_financials_required",
        severity: "blocking",
        message:
          "No hay filas en invoice_financials para este tenant; no se puede validar saldo derivado.",
      });
    } else if (checks.invoices_missing_in_financials_view > 0) {
      issues.push({
        code: "invoice_financials_incomplete",
        severity: "blocking",
        message:
          "Hay facturas activas sin entrada en invoice_financials; cobertura incompleta para validar saldos.",
        count: checks.invoices_missing_in_financials_view,
      });
    }
  }

  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const validation_ok = blocking.length === 0;

  let confidence: FinancialConfidence;
  let coverage: FinancialCoverage;

  if (!validation_ok) {
    confidence = "low";
    coverage = "insufficient";
  } else if (warnings.length > 0) {
    confidence = "medium";
    coverage = "partial";
  } else {
    confidence = "high";
    coverage = "full";
  }

  const blocked_reasons = blocking.map((b) => `${b.code}: ${b.message}`);
  const recommendations_enabled = validation_ok;

  const report: FinancialValidationReport = {
    version: 1,
    checks,
    issues,
    validation_ok,
  };

  return {
    validation_report: report,
    confidence,
    coverage,
    blocked_reasons,
    recommendations_enabled,
  };
}
