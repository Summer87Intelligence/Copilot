import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";

import { buildTopClientsReportModel } from "./build-top-clients-report-model";

function portRow(
  overrides: Partial<ClientPortfolioRow> & { company_id: string; name: string }
): ClientPortfolioRow {
  return {
    industry: "",
    total_billing: 0,
    total_debt: 0,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "bueno",
    risk: "Bajo",
    source: "zeta_invoice",
    has_contact_data: false,
    derived_from_debt: false,
    debt_uyu: 0,
    debt_usd: 0,
    billing_uyu: 0,
    billing_usd: 0,
    overdue_uyu: 0,
    overdue_usd: 0,
    ...overrides,
  };
}

/** Factura mínima para el filtro de período (net-sales usa issue_date + currency). */
function invoiceRow(o: {
  id: string;
  company_id: string;
  currency: "UYU" | "USD";
  total: number;
  issue_date: string;
  creditNote?: boolean;
}): DataRow {
  return {
    id: o.id,
    company_id: o.company_id,
    currency_code: o.currency,
    total_amount: o.total,
    issue_date: o.issue_date,
    is_active: true,
    status: "issued",
    invoice_number: o.id,
    zeta_metadata: o.creditNote ? { zeta_customer_voucher_v1: { cfe_tipo: 102 } } : null,
  } as DataRow;
}

const BASE = {
  year: 2026,
  month: 5, // Mayo 2026 → 2026-05-01 .. 2026-05-31
  currency: "UYU" as const,
  generatedAt: new Date("2026-06-01T10:00:00.000Z"),
};

const NAMES = { c1: "A", c2: "B", c3: "C" };

describe("buildTopClientsReportModel (ventas del período)", () => {
  it("usa ventas netas emitidas DENTRO del período (issue_date), no billing lifetime", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [
        // billing lifetime enorme, pero solo debe contar la venta de mayo.
        portRow({ company_id: "c1", name: "A", billing_uyu: 999999, debt_uyu: 0 }),
      ],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 5000, issue_date: "2026-05-10" }),
        // Venta de abril: fuera del período, no cuenta.
        invoiceRow({ id: "i2", company_id: "c1", currency: "UYU", total: 8000, issue_date: "2026-04-10" }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.netSales).toBe(5000);
  });

  it("nota de crédito del período reduce ventas netas", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [portRow({ company_id: "c1", name: "A" })],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 10000, issue_date: "2026-05-05" }),
        invoiceRow({ id: "nc1", company_id: "c1", currency: "UYU", total: 2000, issue_date: "2026-05-08", creditNote: true }),
      ],
    });
    expect(result.rows[0]?.netSales).toBe(8000);
  });

  it("separa UYU y USD: ventas USD no aparecen en reporte UYU", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      currency: "UYU",
      companyNames: NAMES,
      portfolioRows: [portRow({ company_id: "c1", name: "A", debt_uyu: 0 })],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "USD", total: 5000, issue_date: "2026-05-10" }),
      ],
    });
    // Sin ventas UYU ni deuda UYU → sin filas.
    expect(result.rows).toHaveLength(0);
  });

  it("incluye clientes con deuda actual pero sin ventas del período (netSales 0)", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [portRow({ company_id: "c1", name: "A", debt_uyu: 2000, overdue_uyu: 500 })],
      invoices: [],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.netSales).toBe(0);
    expect(result.rows[0]?.totalDebt).toBe(2000);
    expect(result.rows[0]?.overdueDebt).toBe(500);
  });

  it("ordena por ventas DESC por defecto", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A" }),
        portRow({ company_id: "c2", name: "B" }),
        portRow({ company_id: "c3", name: "C" }),
      ],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 1000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i2", company_id: "c2", currency: "UYU", total: 5000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i3", company_id: "c3", currency: "UYU", total: 3000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows.map((r) => r.companyId)).toEqual(["c2", "c3", "c1"]);
  });

  it("ordena por deuda DESC cuando sortBy=debt", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      sortBy: "debt",
      companyNames: NAMES,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", debt_uyu: 1000 }),
        portRow({ company_id: "c2", name: "B", debt_uyu: 8000 }),
      ],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 5000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i2", company_id: "c2", currency: "UYU", total: 1000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows[0]?.companyId).toBe("c2");
  });

  it("ordena por deuda atrasada DESC cuando sortBy=overdue", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      sortBy: "overdue",
      companyNames: NAMES,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", overdue_uyu: 100 }),
        portRow({ company_id: "c2", name: "B", overdue_uyu: 9000 }),
      ],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 5000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i2", company_id: "c2", currency: "UYU", total: 1000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows[0]?.companyId).toBe("c2");
    expect(result.rows[0]?.overdueDebt).toBe(9000);
  });

  it("desempata por nombre ascendente", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: { c1: "Zeta", c2: "Alfa" },
      portfolioRows: [
        portRow({ company_id: "c1", name: "Zeta" }),
        portRow({ company_id: "c2", name: "Alfa" }),
      ],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 3000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i2", company_id: "c2", currency: "UYU", total: 3000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows.map((r) => r.clientName)).toEqual(["Alfa", "Zeta"]);
  });

  it("cliente sin identificación usa 'Cliente desconocido'", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: {}, // sin nombre
      portfolioRows: [],
      invoices: [
        invoiceRow({ id: "i1", company_id: "cX", currency: "UYU", total: 1000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows[0]?.clientName).toBe("Cliente desconocido");
  });

  it("asigna ranking correlativo y calcula participación", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [portRow({ company_id: "c1", name: "A" }), portRow({ company_id: "c2", name: "B" })],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 3000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i2", company_id: "c2", currency: "UYU", total: 1000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows[0]?.rank).toBe(1);
    expect(result.rows[1]?.rank).toBe(2);
    expect(result.rows[0]?.sharePercent).toBeCloseTo(75, 1);
    expect(result.rows[1]?.sharePercent).toBeCloseTo(25, 1);
  });

  it("calcula totales y respeta el label del período", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", debt_uyu: 500, overdue_uyu: 200 }),
        portRow({ company_id: "c2", name: "B", debt_uyu: 800, overdue_uyu: 300 }),
      ],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "UYU", total: 3000, issue_date: "2026-05-01" }),
        invoiceRow({ id: "i2", company_id: "c2", currency: "UYU", total: 2000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.totals.clientCount).toBe(2);
    expect(result.totals.netSales).toBe(5000);
    expect(result.totals.totalDebt).toBe(1300);
    expect(result.totals.overdueDebt).toBe(500);
    expect(result.period.label).toBe("Mayo 2026");
  });

  it("empty state cuando no hay actividad en la moneda", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      companyNames: NAMES,
      portfolioRows: [portRow({ company_id: "c1", name: "A", debt_usd: 1000, overdue_usd: 100 })],
      invoices: [
        invoiceRow({ id: "i1", company_id: "c1", currency: "USD", total: 5000, issue_date: "2026-05-01" }),
      ],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.clientCount).toBe(0);
  });
});
