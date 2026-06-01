import { describe, expect, it } from "vitest";

import {
  buildFinancialExecutiveDashboard,
  trendDirectionLabel,
} from "@/lib/copilot-financial-executive-dashboard";
import type { NormalizedCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";

const BASE_INVOICES = [
  { issue_date: "2026-05-10", total_amount: 1000, currency_code: "USD", is_active: true },
  { issue_date: "2026-04-15", total_amount: 800, currency_code: "USD", is_active: true },
  { issue_date: "2026-06-01", total_amount: 100, currency_code: "USD", is_active: true },
];

const BASE_RECEIPTS = [
  { receipt_date: "2026-05-20", amount: 900, currency_code: "USD", is_active: true },
  { receipt_date: "2026-04-18", amount: 700, currency_code: "USD", is_active: true },
];

function buildDashboard(asOf = "2026-06-01") {
  return buildFinancialExecutiveDashboard({
    periodLabel: "01/06/2026 - 01/06/2026",
    asOfYmd: asOf,
    metricsByCode: {
      USD: {
        currencyCode: "USD",
        totalInvoiced: 100,
        totalPending: 500,
        totalCollected: 50,
        invoiceCount: 1,
        pendingInvoiceCount: 1,
        collectionEffectiveness: null,
        issuedInPeriod: 100,
        pendingAtCutoff: 500,
        issuedInPeriodNet: 100,
        creditNoteAmount: 0,
        portfolioResolvedAmount: 50,
      } as NormalizedCurrencyMetrics,
    },
    agingByCurrency: {
      USD: [{ range: "90_plus", amount: 200, invoiceCount: 1, clientCount: 1, percentage: 0.4, realDueDateCount: 0, syntheticDueDateCount: 1 }],
    },
    snapshot: null,
    cashPositions: [
      {
        currency: "USD",
        openingConfigured: false,
        openingBalance: 0,
        collectedFromClients: 0,
        manualIncome: 0,
        manualExpense: 0,
        adjustments: 0,
        transfersNet: 0,
        availableCash: 1000,
      } as CashPositionByCurrency,
    ],
    portfolioRows: [
      {
        company_id: "c1",
        name: "Cliente A",
        debt_usd: 500,
        overdue_usd: 200,
        debt_uyu: 0,
        billing_usd: 100,
        risk: "Alto",
      } as never,
    ],
    fiscal: { upcomingCount: 0, overdueCount: 0, paidCount: 0, estimated30: 0, isEmpty: true },
    invoices: BASE_INVOICES,
    receipts: BASE_RECEIPTS,
  });
}

describe("copilot-financial-executive-dashboard", () => {
  it("no mezcla monedas en paneles", () => {
    const dash = buildDashboard();
    expect(dash.currencies.every((c) => c.currency === "USD")).toBe(true);
    expect(dash.currencies.length).toBe(1);
  });

  it("último mes cerrado Mayo vs Abril en comparativa principal", () => {
    const dash = buildDashboard("2026-06-01");
    const usd = dash.currencies[0];
    const net = usd.lastClosedMonthComparison.metrics.find((m) => m.id === "net");
    expect(net?.current).toBe(1000);
    expect(net?.previous).toBe(800);
    expect(usd.lastClosedMonthComparison.title).toMatch(/Mayo 2026 vs Abril 2026/);
  });

  it("mes en curso separado de comparativa cerrada", () => {
    const dash = buildDashboard("2026-06-01");
    const inProgress = dash.currencies[0].currentMonthInProgress;
    expect(inProgress.layout).toBe("current-only");
    expect(inProgress.title).toMatch(/Junio 2026 en curso/);
    const net = inProgress.metrics.find((m) => m.id === "net");
    expect(net?.current).toBe(100);
  });

  it("periodContext con callout de mes parcial", () => {
    const dash = buildDashboard("2026-06-01");
    expect(dash.periodContext.isCurrentMonthPartial).toBe(true);
    expect(dash.periodContext.partialMonthCallout).toMatch(/en curso/i);
    expect(dash.periodContext.lastClosedMonthLabel).toBe("Mayo 2026");
  });

  it("deuda vencida % calculada", () => {
    const dash = buildDashboard();
    expect(dash.currencies[0].collectionDebt.overduePct).toBeCloseTo(0.4);
  });

  it("top clientes por deuda ordenados", () => {
    const dash = buildDashboard();
    expect(dash.currencies[0].topDebtClients[0]?.clientName).toBe("Cliente A");
  });

  it("executive bullets máximo 5", () => {
    const dash = buildDashboard();
    expect(dash.executiveBullets.length).toBeLessThanOrEqual(5);
    expect(dash.executiveBullets.length).toBeGreaterThan(0);
    expect(dash.executiveBullets[0]).toMatch(/en curso/i);
  });

  it("no usa datos 2025 en tendencias", () => {
    const dash = buildFinancialExecutiveDashboard({
      periodLabel: "test",
      asOfYmd: "2026-06-01",
      metricsByCode: {},
      snapshot: null,
      cashPositions: [],
      portfolioRows: [],
      fiscal: { upcomingCount: 0, overdueCount: 0, paidCount: 0, estimated30: 0, isEmpty: true },
      invoices: [
        { issue_date: "2025-12-01", total_amount: 9999, currency_code: "USD", is_active: true },
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "USD", is_active: true },
      ],
      receipts: [],
    });
    expect(dash.periodContext.trendsDataRangeLabel).not.toMatch(/2025/);
  });

  it("trendDirectionLabel", () => {
    expect(trendDirectionLabel("growing")).toBe("Creciendo");
    expect(trendDirectionLabel("insufficient")).toBe("Sin datos suficientes");
  });
});
