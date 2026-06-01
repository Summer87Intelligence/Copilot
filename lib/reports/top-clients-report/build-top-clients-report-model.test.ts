import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";

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

const BASE = {
  year: 2026,
  month: 5,
  currency: "UYU" as const,
  generatedAt: new Date("2026-06-01T10:00:00.000Z"),
};

describe("buildTopClientsReportModel", () => {
  it("excluye clientes sin actividad en la moneda seleccionada", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      currency: "UYU",
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 5000, debt_uyu: 0 }),
        portRow({ company_id: "c2", name: "B", billing_uyu: 0, billing_usd: 1000, debt_uyu: 0 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.companyId).toBe("c1");
  });

  it("incluye clientes con deuda pero sin ventas en la moneda", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 0, debt_uyu: 2000 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.totalDebt).toBe(2000);
    expect(result.rows[0]?.netSales).toBe(0);
  });

  it("ordena por ventas DESC por defecto", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "Bajo", billing_uyu: 1000 }),
        portRow({ company_id: "c2", name: "Alto", billing_uyu: 5000 }),
        portRow({ company_id: "c3", name: "Medio", billing_uyu: 3000 }),
      ],
    });
    expect(result.rows[0]?.companyId).toBe("c2");
    expect(result.rows[1]?.companyId).toBe("c3");
    expect(result.rows[2]?.companyId).toBe("c1");
  });

  it("ordena por deuda DESC cuando sortBy=debt", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      sortBy: "debt",
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 5000, debt_uyu: 1000 }),
        portRow({ company_id: "c2", name: "B", billing_uyu: 1000, debt_uyu: 8000 }),
      ],
    });
    expect(result.rows[0]?.companyId).toBe("c2");
    expect(result.rows[1]?.companyId).toBe("c1");
  });

  it("ordena por deuda vencida DESC cuando sortBy=overdue", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      sortBy: "overdue",
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 5000, overdue_uyu: 100 }),
        portRow({ company_id: "c2", name: "B", billing_uyu: 1000, overdue_uyu: 9000 }),
      ],
    });
    expect(result.rows[0]?.companyId).toBe("c2");
    expect(result.rows[0]?.overdueDebt).toBe(9000);
  });

  it("asigna ranking correlativo correcto", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 3000 }),
        portRow({ company_id: "c2", name: "B", billing_uyu: 1000 }),
      ],
    });
    expect(result.rows[0]?.rank).toBe(1);
    expect(result.rows[1]?.rank).toBe(2);
  });

  it("calcula porcentaje de participación correctamente", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 3000 }),
        portRow({ company_id: "c2", name: "B", billing_uyu: 1000 }),
      ],
    });
    expect(result.rows[0]?.sharePercent).toBeCloseTo(75, 1);
    expect(result.rows[1]?.sharePercent).toBeCloseTo(25, 1);
  });

  it("calcula totales correctamente", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_uyu: 3000, debt_uyu: 500, overdue_uyu: 200 }),
        portRow({ company_id: "c2", name: "B", billing_uyu: 2000, debt_uyu: 800, overdue_uyu: 300 }),
      ],
    });
    expect(result.totals.clientCount).toBe(2);
    expect(result.totals.netSales).toBe(5000);
    expect(result.totals.totalDebt).toBe(1300);
    expect(result.totals.overdueDebt).toBe(500);
  });

  it("empty state cuando no hay clientes con actividad en la moneda", () => {
    const result = buildTopClientsReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "A", billing_usd: 5000, debt_usd: 1000 }),
      ],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.clientCount).toBe(0);
    expect(result.totals.netSales).toBe(0);
    expect(result.period.label).toBe("Mayo 2026");
  });
});
