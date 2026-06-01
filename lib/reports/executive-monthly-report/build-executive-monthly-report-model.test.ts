import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import type { TreasuryCashOpeningBalanceRow } from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

import { buildExecutiveMonthlyReportModel } from "./build-executive-monthly-report-model";

function mov(overrides: Partial<ManualCashMovement> = {}): ManualCashMovement {
  return {
    id: "m1",
    workspaceId: "w1",
    companyId: null,
    accountId: null,
    ledgerType: "cash",
    movementType: "income",
    source: "cash",
    concept: "Cobro",
    category: null,
    amount: 1000,
    currencyCode: "UYU",
    movementDate: "2026-05-15",
    paymentMethod: null,
    counterparty: null,
    reference: null,
    notes: null,
    affectsCashflow: true,
    reconciled: false,
    bankReconciliationId: null,
    status: "active",
    createdBy: null,
    createdAt: "2026-05-15T10:00:00.000Z",
    updatedAt: "2026-05-15T10:00:00.000Z",
    rawPayload: null,
    metadata: null,
    ...overrides,
  };
}

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

function bal(
  currencyCode: "UYU" | "USD",
  amount: number
): TreasuryCashOpeningBalanceRow {
  return {
    id: "b1",
    workspaceId: "w1",
    currencyCode,
    amount,
    effectiveDate: "2026-01-01",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const BASE = {
  movements: [] as ManualCashMovement[],
  openingBalances: [] as TreasuryCashOpeningBalanceRow[],
  invoices: [] as DataRow[],
  companyNames: { c1: "Cliente Uno", c2: "Cliente Dos" } as Record<string, string>,
  portfolioRows: [] as ClientPortfolioRow[],
  year: 2026,
  month: 5,
  currency: "UYU" as const,
  generatedAt: new Date("2026-06-01T10:00:00.000Z"),
};

describe("buildExecutiveMonthlyReportModel", () => {
  it("period label y rango correctos", () => {
    const result = buildExecutiveMonthlyReportModel({ ...BASE });
    expect(result.period.label).toBe("Mayo 2026");
    expect(result.period.from).toBe("2026-05-01");
    expect(result.period.to).toBe("2026-05-31");
  });

  it("calcula netSales desde facturas", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", total_amount: 5000 }),
        inv({ id: "i2", total_amount: 3000 }),
      ],
    });
    expect(result.keyMetrics.netSales).toBe(8000);
  });

  it("calcula cashClosingBalance con apertura y movimientos", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      openingBalances: [bal("UYU", 10000)],
      movements: [
        mov({ id: "m1", movementType: "income", amount: 5000 }),
        mov({ id: "m2", movementType: "expense", amount: 2000 }),
      ],
    });
    expect(result.keyMetrics.cashOpeningBalance).toBe(10000);
    expect(result.keyMetrics.cashIncome).toBe(5000);
    expect(result.keyMetrics.cashExpense).toBe(2000);
    expect(result.keyMetrics.cashClosingBalance).toBe(13000);
  });

  it("top5Clients limitado a 5 filas", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "C1", billing_uyu: 1000 }),
        portRow({ company_id: "c2", name: "C2", billing_uyu: 2000 }),
        portRow({ company_id: "c3", name: "C3", billing_uyu: 3000 }),
        portRow({ company_id: "c4", name: "C4", billing_uyu: 4000 }),
        portRow({ company_id: "c5", name: "C5", billing_uyu: 5000 }),
        portRow({ company_id: "c6", name: "C6", billing_uyu: 6000 }),
      ],
    });
    expect(result.top5Clients).toHaveLength(5);
    expect(result.top5Clients[0]?.rank).toBe(1);
  });

  it("top5Debtors limitado a 5 filas", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      portfolioRows: Array.from({ length: 7 }, (_, i) =>
        portRow({
          company_id: `c${i + 1}`,
          name: `C${i + 1}`,
          debt_uyu: (i + 1) * 1000,
        })
      ),
    });
    expect(result.top5Debtors).toHaveLength(5);
  });

  it("riskLevel Bajo cuando no hay deuda vencida y caja positiva", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      openingBalances: [bal("UYU", 5000)],
      portfolioRows: [
        portRow({ company_id: "c1", name: "C1", debt_uyu: 1000, overdue_uyu: 0 }),
      ],
    });
    expect(result.riskLevel).toBe("Bajo");
    expect(result.alerts).toHaveLength(0);
  });

  it("riskLevel Atención cuando hay deuda vencida", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "C1", debt_uyu: 5000, overdue_uyu: 1000 }),
      ],
    });
    expect(result.riskLevel).toBe("Atención");
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it("riskLevel Crítico cuando caja negativa", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      openingBalances: [bal("UYU", 0)],
      movements: [
        mov({ id: "m1", movementType: "expense", amount: 5000 }),
      ],
    });
    expect(result.riskLevel).toBe("Crítico");
    expect(result.alerts).toContainEqual(expect.stringContaining("negativo"));
  });

  it("riskLevel Crítico cuando deuda vencida supera 40% de deuda total", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      portfolioRows: [
        portRow({ company_id: "c1", name: "C1", debt_uyu: 10000, overdue_uyu: 5000 }),
      ],
    });
    expect(result.riskLevel).toBe("Crítico");
  });

  it("empty state con todos los indicadores en 0", () => {
    const result = buildExecutiveMonthlyReportModel({ ...BASE });
    expect(result.keyMetrics.netSales).toBe(0);
    expect(result.keyMetrics.cashClosingBalance).toBe(0);
    expect(result.keyMetrics.totalDebt).toBe(0);
    expect(result.top5Clients).toHaveLength(0);
    expect(result.top5Debtors).toHaveLength(0);
    expect(result.riskLevel).toBe("Bajo");
  });
});
