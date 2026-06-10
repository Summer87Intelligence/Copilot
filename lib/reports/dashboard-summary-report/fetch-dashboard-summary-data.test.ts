import { describe, expect, it } from "vitest";

import { generateFinancialConsistencyReport, invoiceInputFromProtoRow } from "@/lib/copilot-financial-reconciliation";
import { ZETA_SALDOS_PENDIENTES_CATEGORY } from "@/lib/zeta/zeta-operational-debt-dedup";

import { mapDashboardSummaryInvoiceRows } from "./fetch-dashboard-summary-data";

const COMPANY = "co-pdf-dedupe";
const NOW = "2026-06-01T12:00:00.000Z";
const PERIOD_FROM = "2026-06-01";
const PERIOD_TO = "2026-06-10";

function ccv1Row(id: string, registroId: string, balance: number): Record<string, unknown> {
  return {
    id,
    company_id: COMPANY,
    currency_code: "UYU",
    total_amount: balance,
    balance_amount: balance,
    status: null,
    updated_at: NOW,
    issue_date: "2026-06-03",
    due_date: "2026-07-01",
    due_date_source: "synthetic_30d",
    category: "Zeta / factura cliente",
    invoice_number: `ZETA:CCV1:EMP:${COMPANY}:A:${id}`,
    zeta_metadata: {
      zeta_comprobante_identity_v1: { schema_version: 1, registro_id: registroId },
      zeta_customer_voucher_v1: { zeta_registro_id: registroId },
    },
  };
}

function shadowRow(registroId: string, balance: number): Record<string, unknown> {
  return {
    id: `sp-${registroId}`,
    company_id: COMPANY,
    currency_code: "UYU",
    total_amount: balance,
    balance_amount: balance,
    status: null,
    updated_at: NOW,
    issue_date: "2026-06-03",
    category: ZETA_SALDOS_PENDIENTES_CATEGORY,
    invoice_number: `ZETA:${registroId}`,
    zeta_metadata: null,
  };
}
describe("mapDashboardSummaryInvoiceRows + generateFinancialConsistencyReport", () => {
  it("CCV1 + shadow → pendingAtCutoff dedupeado (path PDF/dashboard summary)", () => {
    const balance = 54_900;
    const invoices = mapDashboardSummaryInvoiceRows([
      ccv1Row("real-1", "9001", balance),
      shadowRow("9001", balance),
    ]);

    const outstanding = generateFinancialConsistencyReport({
      workspaceId: "ws-pdf",
      invoices,
      companies: [{ id: COMPANY, name: "Cliente PDF" }],
      syncStates: [],
      mode: "all_outstanding",
      now: NOW,
    });

    const uyuOutstanding = outstanding.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyuOutstanding?.pendingAtCutoff).toBe(balance);
    expect(uyuOutstanding?.totalPending).toBe(balance);
  });

  it("mismo fixture → totalInvoiced del período NO deduplica (ventas/cobros intactos)", () => {
    const balance = 54_900;
    const invoices = mapDashboardSummaryInvoiceRows([
      ccv1Row("real-1", "9001", balance),
      shadowRow("9001", balance),
    ]);

    const period = generateFinancialConsistencyReport({
      workspaceId: "ws-pdf",
      invoices,
      companies: [{ id: COMPANY, name: "Cliente PDF" }],
      syncStates: [],
      receipts: [],
      mode: "period_only",
      periodStart: PERIOD_FROM,
      periodEnd: PERIOD_TO,
      now: NOW,
    });

    const uyuPeriod = period.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyuPeriod?.pendingAtCutoff).toBe(balance);
    expect(uyuPeriod?.issuedInPeriod).toBe(balance * 2);
    expect(uyuPeriod?.totalInvoiced).toBe(balance * 2);
  });

  it("sin category/invoice_number en select el pending se inflaba (riesgo real pre-2B)", () => {
    const balance = 54_900;
    const rawRows = [ccv1Row("real-3", "7001", balance), shadowRow("7001", balance)];

    const legacyInvoices = rawRows.map((r) => {
      const { category: _c, invoice_number: _n, ...withoutDedupeKeys } = r;
      return {
        ...invoiceInputFromProtoRow(withoutDedupeKeys as Record<string, unknown>),
        zeta_client_name: null,
        reconciliation_missing_count: null,
      };
    });

    const canonicalInvoices = mapDashboardSummaryInvoiceRows(rawRows);

    const legacyReport = generateFinancialConsistencyReport({
      workspaceId: "ws-pdf",
      invoices: legacyInvoices,
      companies: [{ id: COMPANY, name: "Legacy" }],
      syncStates: [],
      mode: "all_outstanding",
      now: NOW,
    });

    const canonicalReport = generateFinancialConsistencyReport({
      workspaceId: "ws-pdf",
      invoices: canonicalInvoices,
      companies: [{ id: COMPANY, name: "Canonical" }],
      syncStates: [],
      mode: "all_outstanding",
      now: NOW,
    });

    expect(
      legacyReport.currencies.find((c) => c.currencyCode === "UYU")?.pendingAtCutoff
    ).toBe(balance * 2);
    expect(
      canonicalReport.currencies.find((c) => c.currencyCode === "UYU")?.pendingAtCutoff
    ).toBe(balance);
  });
});
