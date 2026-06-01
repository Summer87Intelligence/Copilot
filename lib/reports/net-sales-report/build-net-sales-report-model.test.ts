import { describe, expect, it } from "vitest";

import type { DataRow } from "@/lib/data/proto-operational-read-repository";

import { buildNetSalesReportModel } from "./build-net-sales-report-model";

function inv(overrides: Partial<DataRow> = {}): DataRow {
  return {
    id: "i1",
    issue_date: "2026-05-15",
    total_amount: 1000,
    currency_code: "UYU",
    company_id: "c1",
    is_active: true,
    status: "issued",
    zeta_metadata: null,
    ...overrides,
  };
}

function ncMetadata(cfeTipo = 112): Record<string, unknown> {
  return { zeta_customer_voucher_v1: { cfe_tipo: cfeTipo } };
}

const NAMES = { c1: "Cliente Uno", c2: "Cliente Dos" };

const BASE = {
  companyNames: NAMES,
  year: 2026,
  month: 5,
  currency: "UYU" as const,
  generatedAt: new Date("2026-06-01T10:00:00.000Z"),
};

describe("buildNetSalesReportModel", () => {
  it("filtra por mes correcto", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", issue_date: "2026-04-30", total_amount: 999 }),
        inv({ id: "i2", issue_date: "2026-05-01", total_amount: 100 }),
        inv({ id: "i3", issue_date: "2026-05-31", total_amount: 200 }),
        inv({ id: "i4", issue_date: "2026-06-01", total_amount: 999 }),
      ],
    });
    expect(result.totals.grossSales).toBe(300);
  });

  it("filtra por moneda", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      currency: "UYU",
      invoices: [
        inv({ id: "i1", currency_code: "UYU", total_amount: 500 }),
        inv({ id: "i2", currency_code: "USD", total_amount: 9999 }),
      ],
    });
    expect(result.totals.grossSales).toBe(500);
  });

  it("excluye facturas inactivas", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", is_active: true, total_amount: 300 }),
        inv({ id: "i2", is_active: false, total_amount: 9999 }),
      ],
    });
    expect(result.totals.grossSales).toBe(300);
  });

  it("excluye facturas canceladas", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", status: "issued", total_amount: 400 }),
        inv({ id: "i2", status: "cancelled", total_amount: 9999 }),
      ],
    });
    expect(result.totals.grossSales).toBe(400);
  });

  it("separa NC de facturas normales", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", total_amount: 1000, zeta_metadata: null }),
        inv({ id: "i2", total_amount: 200, zeta_metadata: ncMetadata(112) }),
      ],
    });
    expect(result.totals.grossSales).toBe(1000);
    expect(result.totals.creditNoteTotal).toBe(200);
    expect(result.totals.netSales).toBe(800);
    expect(result.rows[0]?.invoiceCount).toBe(1);
    expect(result.rows[0]?.creditNoteCount).toBe(1);
  });

  it("calcula ventas netas por cliente correctamente", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 5000, zeta_metadata: null }),
        inv({ id: "i2", company_id: "c1", total_amount: 500, zeta_metadata: ncMetadata() }),
        inv({ id: "i3", company_id: "c2", total_amount: 3000, zeta_metadata: null }),
      ],
    });
    const c1Row = result.rows.find((r) => r.companyId === "c1")!;
    const c2Row = result.rows.find((r) => r.companyId === "c2")!;
    expect(c1Row.grossSales).toBe(5000);
    expect(c1Row.creditNoteTotal).toBe(500);
    expect(c1Row.netSales).toBe(4500);
    expect(c2Row.netSales).toBe(3000);
  });

  it("ordena por ventas netas DESC", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 1000 }),
        inv({ id: "i2", company_id: "c2", total_amount: 5000 }),
      ],
    });
    expect(result.rows[0]?.companyId).toBe("c2");
    expect(result.rows[1]?.companyId).toBe("c1");
  });

  it("calcula porcentaje de participación correctamente", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 3000 }),
        inv({ id: "i2", company_id: "c2", total_amount: 1000 }),
      ],
    });
    // c2 is first (higher net) — wait c1=3000 > c2=1000, so c1 first
    expect(result.rows[0]?.companyId).toBe("c1");
    expect(result.rows[0]?.sharePercent).toBeCloseTo(75, 1);
    expect(result.rows[1]?.sharePercent).toBeCloseTo(25, 1);
  });

  it("acepta cfe_tipo 102 como NC", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", total_amount: 2000, zeta_metadata: null }),
        inv({ id: "i2", total_amount: 300, zeta_metadata: ncMetadata(102) }),
      ],
    });
    expect(result.totals.creditNoteTotal).toBe(300);
    expect(result.totals.netSales).toBe(1700);
  });

  it("period.label y totales correctos", () => {
    const result = buildNetSalesReportModel({
      ...BASE,
      year: 2026,
      month: 3,
      invoices: [],
    });
    expect(result.period.label).toBe("Marzo 2026");
    expect(result.period.from).toBe("2026-03-01");
    expect(result.period.to).toBe("2026-03-31");
    expect(result.totals.clientCount).toBe(0);
    expect(result.totals.netSales).toBe(0);
  });

  it("empty state con totales en 0", () => {
    const result = buildNetSalesReportModel({ ...BASE, invoices: [] });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.grossSales).toBe(0);
    expect(result.totals.creditNoteTotal).toBe(0);
    expect(result.totals.netSales).toBe(0);
    expect(result.totals.clientCount).toBe(0);
  });
});
