import { describe, expect, it } from "vitest";

import {
  buildFinancialMonthlyTrends,
  defaultTrendCurrency,
  filterTrendsByCurrency,
} from "@/lib/copilot-financial-monthly-trends";

describe("copilot-financial-monthly-trends", () => {
  it("agrupa facturas por mes", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-10", total_amount: 1000, currency_code: "UYU", is_active: true },
        { issue_date: "2026-04-15", total_amount: 2000, currency_code: "UYU", is_active: true },
      ],
      receipts: [],
    });
    const uyu = filterTrendsByCurrency(result.trends, "UYU");
    expect(uyu.some((t) => t.month === "2026-05" && t.grossIssued === 1000)).toBe(true);
    expect(uyu.some((t) => t.month === "2026-04" && t.grossIssued === 2000)).toBe(true);
  });

  it("resta NC del neto", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        {
          issue_date: "2026-05-10",
          total_amount: 1000,
          currency_code: "UYU",
          is_active: true,
        },
        {
          issue_date: "2026-05-12",
          total_amount: 200,
          currency_code: "UYU",
          is_active: true,
          zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: 102 } },
        },
      ],
      receipts: [],
    });
    const may = result.trends.find((t) => t.month === "2026-05" && t.currency === "UYU");
    expect(may?.grossIssued).toBe(1000);
    expect(may?.creditNotes).toBe(200);
    expect(may?.netIssued).toBe(800);
  });

  it("agrupa recibos por mes", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [],
      receipts: [
        { receipt_date: "2026-05-20", amount: 500, currency_code: "UYU", is_active: true },
      ],
    });
    const may = result.trends.find((t) => t.month === "2026-05" && t.currency === "UYU");
    expect(may?.collected).toBe(500);
  });

  it("separa UYU/USD", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "UYU", is_active: true },
        { issue_date: "2026-05-01", total_amount: 50, currency_code: "USD", is_active: true },
      ],
      receipts: [],
    });
    expect(result.trends.some((t) => t.currency === "UYU")).toBe(true);
    expect(result.trends.some((t) => t.currency === "USD")).toBe(true);
  });

  it("no mezcla monedas en una fila", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "UYU", is_active: true },
        { issue_date: "2026-05-01", total_amount: 50, currency_code: "USD", is_active: true },
      ],
      receipts: [],
    });
    for (const t of result.trends) {
      expect(["UYU", "USD"]).toContain(t.currency);
    }
    const uyuMay = result.trends.find((t) => t.month === "2026-05" && t.currency === "UYU");
    const usdMay = result.trends.find((t) => t.month === "2026-05" && t.currency === "USD");
    expect(uyuMay?.grossIssued).toBe(100);
    expect(usdMay?.grossIssued).toBe(50);
  });

  it("empty state sin datos", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [],
      receipts: [],
    });
    expect(result.isEmpty).toBe(true);
    expect(defaultTrendCurrency(result.trends)).toBe("UYU");
  });

  it("marca pendiente como snapshot actual", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "UYU", is_active: true },
      ],
      receipts: [],
    });
    expect(result.pendingIsCurrentSnapshotOnly).toBe(true);
    expect(result.trends[0]?.pending).toBe(0);
  });
});
