/**
 * FASE D — Paridad de VENTAS NETAS entre las tres superficies que la publican:
 *   Ventas (buildSalesPeriodSnapshot) == Finanzas (generateFinancialConsistencyReport)
 *   == Reportes (buildNetSalesReportModel)
 * sobre el MISMO universo documental, por moneda. Bloquea regresiones de drift
 * como la divergencia FASE 9E (comprobantes CCV1 sin currency_code).
 */

import { describe, it, expect } from "vitest";

import { dedupeZetaShadowInvoicesCanonical } from "@/lib/copilot-zeta-invoice-canonical-dedup";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { buildCanonicalSaleDocuments, type RawSaleInvoiceRow } from "@/lib/sales/canonical/build-canonical-sales";
import { buildSalesPeriodSnapshot } from "@/lib/sales/canonical/sales-aggregations";
import { generateFinancialConsistencyReport, type InvoiceInput } from "@/lib/copilot-financial-reconciliation";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { findCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";
import { buildNetSalesReportModel } from "@/lib/reports/net-sales-report/build-net-sales-report-model";

const FROM = "2026-07-01";
const TO = "2026-07-31";

function ccv1(
  n: string,
  opts: { total: number; currency_code: string | null; monedaCodigo?: string; cfe?: string; status?: string; issue?: string; company?: string }
): RawSaleInvoiceRow {
  const cfe = opts.cfe ?? "111";
  return {
    id: `id-${n}`,
    invoice_number: `ZETA:CCV1:0:1:A:${n}`,
    company_id: opts.company ?? `co-${n}`,
    issue_date: opts.issue ?? "2026-07-06",
    due_date: "2026-08-05",
    currency_code: opts.currency_code,
    total_amount: opts.total,
    balance_amount: 0,
    paid_amount: 0,
    status: opts.status ?? "paid",
    is_active: true,
    category: "Zeta / comprobantes por cliente",
    zeta_metadata: {
      zeta_customer_voucher_v1: {
        cfe_tipo: cfe,
        raw_payload: { MonedaCodigo: opts.monedaCodigo ?? (opts.currency_code === "USD" ? "2" : "1"), CFETipo: cfe, Serie: "A", Numero: n },
      },
    },
  };
}

function toInvoiceInput(rows: RawSaleInvoiceRow[]): InvoiceInput[] {
  return rows.map((r) => ({
    id: String(r.id),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: (r.currency_code as string | null) ?? null,
    total_amount: typeof r.total_amount === "number" ? r.total_amount : Number(r.total_amount),
    balance_amount: 0,
    status: r.status ?? null,
    updated_at: null,
    issue_date: r.issue_date ?? null,
    is_credit_note: isCreditNoteFromMetadata(r.zeta_metadata),
    is_active: true,
    category: (r.category as string) ?? null,
    invoice_number: r.invoice_number ?? null,
    zeta_metadata: r.zeta_metadata,
  }));
}

describe("net sales parity: Ventas == Finanzas == Reportes", () => {
  const universe: RawSaleInvoiceRow[] = [
    ccv1("1001", { total: 666122.5, currency_code: "UYU" }),
    ccv1("1002", { total: 97112, currency_code: null, monedaCodigo: "1", cfe: "0" }), // interno sin ccode
    ccv1("1003", { total: 2000, currency_code: "UYU", cfe: "112" }), // NC UYU
    ccv1("2001", { total: 9469.28, currency_code: "USD" }),
    ccv1("2002", { total: 305, currency_code: null, monedaCodigo: "2", cfe: "0" }), // interno USD sin ccode
    ccv1("9001", { total: 500000, currency_code: "UYU", status: "anulado" }),
    ccv1("9002", { total: 400000, currency_code: "UYU", issue: "2026-06-15" }),
  ];

  it("neto por moneda coincide en las tres superficies", () => {
    const deduped = dedupeZetaShadowInvoicesCanonical(universe as never) as unknown as RawSaleInvoiceRow[];
    const docs = buildCanonicalSaleDocuments({ workspaceId: "w", rows: deduped });
    const ventas = buildSalesPeriodSnapshot(docs, FROM, TO);
    const finReport = generateFinancialConsistencyReport({
      workspaceId: "w",
      invoices: toInvoiceInput(universe),
      companies: [],
      syncStates: [],
      mode: "period_only",
      periodStart: FROM,
      periodEnd: TO,
    });

    for (const cur of ["UYU", "USD"] as const) {
      const ventasNet = ventas.netSalesByCurrency[cur];
      const finNet = findCurrencyMetrics(finReport, cur)?.issuedInPeriodNet ?? 0;
      const reportNet = buildNetSalesReportModel({
        invoices: universe as unknown as DataRow[],
        companyNames: {},
        year: 2026,
        month: 7,
        currency: cur,
      }).totals.netSales;

      expect(finNet).toBeCloseTo(ventasNet, 2);
      expect(reportNet).toBeCloseTo(ventasNet, 2);
    }
  });

  it("valores esperados (UYU 761234.5, USD 9774.28)", () => {
    const uyu = buildNetSalesReportModel({ invoices: universe as unknown as DataRow[], companyNames: {}, year: 2026, month: 7, currency: "UYU" });
    const usd = buildNetSalesReportModel({ invoices: universe as unknown as DataRow[], companyNames: {}, year: 2026, month: 7, currency: "USD" });
    expect(uyu.totals.netSales).toBeCloseTo(761234.5, 2);
    expect(usd.totals.netSales).toBeCloseTo(9774.28, 2);
  });
});
