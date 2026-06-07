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
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 1000 }),
        inv({ id: "i2", company_id: "c2", total_amount: 2000 }),
        inv({ id: "i3", company_id: "c3", total_amount: 3000 }),
        inv({ id: "i4", company_id: "c4", total_amount: 4000 }),
        inv({ id: "i5", company_id: "c5", total_amount: 5000 }),
        inv({ id: "i6", company_id: "c6", total_amount: 6000 }),
      ],
      companyNames: { c1: "C1", c2: "C2", c3: "C3", c4: "C4", c5: "C5", c6: "C6" },
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

  // ── Consistencia fuente de datos ──────────────────────────────

  it("top5Clients UYU usa misma fuente periódica que keyMetrics.netSales", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 8000 }),
        inv({ id: "i2", company_id: "c2", total_amount: 5000 }),
      ],
      // portfolioRows con billing histórico diferente — no debe influir en top5Clients
      portfolioRows: [
        portRow({ company_id: "c1", name: "C1", billing_uyu: 999000 }),
      ],
    });
    expect(result.top5Clients).toHaveLength(2);
    expect(result.top5Clients[0]?.clientName).toBe("Cliente Uno");
    expect(result.top5Clients[0]?.netSales).toBe(8000);
    expect(result.keyMetrics.netSales).toBe(13000);
  });

  it("top5Clients USD usa facturas USD del período", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      currency: "USD",
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 1500, currency_code: "USD" }),
        inv({ id: "i2", company_id: "c2", total_amount: 1000, currency_code: "USD" }),
        inv({ id: "i3", company_id: "c1", total_amount: 9000, currency_code: "UYU" }),
      ],
      portfolioRows: [],
    });
    expect(result.top5Clients).toHaveLength(2);
    expect(result.top5Clients[0]?.netSales).toBe(1500);
    expect(result.keyMetrics.netSales).toBe(2500);
  });

  it("top5Clients no incluye facturas fuera del período reportado", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      // BASE: month=5, year=2026
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 9000, issue_date: "2026-05-15" }),
        inv({ id: "i2", company_id: "c2", total_amount: 7000, issue_date: "2026-04-30" }),
      ],
    });
    expect(result.top5Clients).toHaveLength(1);
    expect(result.top5Clients[0]?.clientName).toBe("Cliente Uno");
    expect(result.keyMetrics.netSales).toBe(9000);
  });

  it("top5Clients UYU no incluye facturas en USD", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      currency: "UYU",
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 5000, currency_code: "UYU" }),
        inv({ id: "i2", company_id: "c2", total_amount: 3000, currency_code: "USD" }),
      ],
    });
    expect(result.top5Clients).toHaveLength(1);
    expect(result.top5Clients[0]?.clientName).toBe("Cliente Uno");
    expect(result.keyMetrics.netSales).toBe(5000);
  });

  it("top5Clients sharePercent es consistente con keyMetrics.netSales", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 7500 }),
        inv({ id: "i2", company_id: "c2", total_amount: 2500 }),
      ],
    });
    const total = result.top5Clients.reduce((s, r) => s + r.sharePercent, 0);
    expect(total).toBeCloseTo(100, 1);
    const sumNetSales = result.top5Clients.reduce((s, r) => s + r.netSales, 0);
    expect(sumNetSales).toBe(result.keyMetrics.netSales);
  });

  it("activeClients refleja clientes con ventas en el período, no cartera histórica", () => {
    const result = buildExecutiveMonthlyReportModel({
      ...BASE,
      invoices: [
        inv({ id: "i1", company_id: "c1", total_amount: 5000 }),
        inv({ id: "i2", company_id: "c2", total_amount: 3000 }),
      ],
      // 3 clientes adicionales en cartera pero sin factura en el período
      portfolioRows: [
        portRow({ company_id: "c3", name: "C3", billing_uyu: 1000 }),
        portRow({ company_id: "c4", name: "C4", billing_uyu: 2000 }),
        portRow({ company_id: "c5", name: "C5", billing_uyu: 3000 }),
      ],
    });
    expect(result.keyMetrics.activeClients).toBe(2);
  });

  it("portfolioRows no afecta top5Clients", () => {
    const withPortfolio = buildExecutiveMonthlyReportModel({
      ...BASE,
      invoices: [inv({ id: "i1", company_id: "c1", total_amount: 4000 })],
      portfolioRows: [
        portRow({ company_id: "c2", name: "C2", billing_uyu: 99999 }),
        portRow({ company_id: "c3", name: "C3", billing_uyu: 99999 }),
      ],
    });
    const withoutPortfolio = buildExecutiveMonthlyReportModel({
      ...BASE,
      invoices: [inv({ id: "i1", company_id: "c1", total_amount: 4000 })],
      portfolioRows: [],
    });
    expect(withPortfolio.top5Clients).toEqual(withoutPortfolio.top5Clients);
    expect(withPortfolio.keyMetrics.activeClients).toEqual(withoutPortfolio.keyMetrics.activeClients);
  });
});
