import { describe, expect, it } from "vitest";

import { buildNetSalesReportModel } from "./build-net-sales-report-model";
import {
  NET_SALES_PDF_INVOICE_TABLE_HEADERS,
  renderNetSalesReportPdf,
} from "./render-net-sales-report-pdf";

describe("renderNetSalesReportPdf", () => {
  it("expone columnas de detalle por factura (sin Fact.)", () => {
    expect(NET_SALES_PDF_INVOICE_TABLE_HEADERS).toEqual([
      "Fecha",
      "Número de factura",
      "Cliente",
      "Importe",
    ]);
    expect(NET_SALES_PDF_INVOICE_TABLE_HEADERS).not.toContain("Fact.");
  });

  it("genera PDF para modelo con invoiceRows deduplicadas", async () => {
    const companyId = "6e50f5e7-161a-48c2-af38-be209ab6f330";
    const model = buildNetSalesReportModel({
      companyNames: { [companyId]: "DOBSURA CORPORATION SA" },
      year: 2026,
      month: 6,
      currency: "USD",
      generatedAt: new Date("2026-06-05T12:00:00.000Z"),
      invoices: [
        {
          id: "ccv1",
          company_id: companyId,
          issue_date: "2026-06-04",
          total_amount: 530.7,
          currency_code: "USD",
          invoice_number: "ZETA:CCV1:0:33:A:2944",
          is_active: true,
          status: "issued",
          zeta_metadata: { zeta_customer_voucher_v1: { serie: "A", numero: "2944" } },
        },
        {
          id: "legacy",
          company_id: companyId,
          issue_date: "2026-06-04",
          total_amount: 530.7,
          currency_code: "USD",
          invoice_number: "ZETA:2748",
          is_active: true,
          status: "issued",
          zeta_metadata: { zeta_reconciliation: { source: "saldos" } },
        },
      ],
    });

    expect(model.invoiceRows).toHaveLength(1);

    const pdf = await renderNetSalesReportPdf({ model });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
