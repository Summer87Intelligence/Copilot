import { describe, expect, it } from "vitest";

import { buildFinanzasCanonicalState } from "@/lib/copilot-finanzas-canonical-state";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

function makeCashPosition(
  currency: "UYU" | "USD",
  availableCash: number
): CashPositionByCurrency {
  return {
    currency,
    openingConfigured: true,
    openingBalance: availableCash,
    collectedFromClients: 0,
    manualIncome: 0,
    manualExpense: 0,
    adjustments: 0,
    transfersNet: 0,
    availableCash,
    currentCash: availableCash,
    movementsCount: 0,
    lastMovement: null,
    lastIncome: null,
    lastExpense: null,
  };
}

function makeOutflowSummary(
  currency: "UYU" | "USD",
  next30Days: number,
  itemsCount = 1
): TreasuryOutflowSummary {
  return {
    currency,
    totalScheduled: next30Days,
    overdue: 0,
    next7Days: 0,
    next30Days,
    paidInPeriod: 0,
    itemsCount,
    byCategory: [],
  };
}

describe("buildFinanzasCanonicalState", () => {
  it("returns per-currency state — UYU and USD never summed", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [
        makeCashPosition("UYU", 100_000),
        makeCashPosition("USD", 5_000),
      ],
      treasurySummaries: [
        makeOutflowSummary("UYU", 30_000),
        makeOutflowSummary("USD", 2_000),
      ],
      portfolioRows: [
        { debt_uyu: 50_000, debt_usd: 3_000, overdue_uyu: 10_000, overdue_usd: 500 },
      ],
    });

    const uyu = result.find((r) => r.currency === "UYU");
    const usd = result.find((r) => r.currency === "USD");

    expect(uyu).toBeDefined();
    expect(usd).toBeDefined();
    expect(uyu!.currency).toBe("UYU");
    expect(usd!.currency).toBe("USD");
    // Each slot only reflects its own currency
    expect(uyu!.availableCash).toBe(100_000);
    expect(usd!.availableCash).toBe(5_000);
  });

  it("expectedCash30d = availableCash + pendingReceivables - scheduledPayments30d", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 100_000)],
      treasurySummaries: [makeOutflowSummary("UYU", 30_000)],
      portfolioRows: [{ debt_uyu: 50_000, debt_usd: 0 }],
    });

    const uyu = result.find((r) => r.currency === "UYU")!;
    expect(uyu.expectedCash30d).toBe(
      uyu.availableCash + uyu.pendingReceivables - uyu.scheduledPayments30d
    );
  });

  it("safeCash30d = availableCash - scheduledPayments30d", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 100_000)],
      treasurySummaries: [makeOutflowSummary("UYU", 30_000)],
      portfolioRows: [],
    });

    const uyu = result.find((r) => r.currency === "UYU")!;
    expect(uyu.safeCash30d).toBe(uyu.availableCash - uyu.scheduledPayments30d);
  });

  it("safeCash30d is negative when payments exceed available cash", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("USD", 1_000)],
      treasurySummaries: [makeOutflowSummary("USD", 5_000)],
      portfolioRows: [{ debt_usd: 0 }],
    });

    const usd = result.find((r) => r.currency === "USD")!;
    expect(usd.safeCash30d).toBeLessThan(0);
  });

  it("scheduledPayments30d is 0 and hasConfiguredPayments false when no treasury outflows", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 80_000)],
      treasurySummaries: [],
      portfolioRows: [{ debt_uyu: 20_000 }],
    });

    const uyu = result.find((r) => r.currency === "UYU")!;
    expect(uyu.scheduledPayments30d).toBe(0);
    expect(uyu.hasConfiguredPayments).toBe(false);
  });

  it("overdueReceivables reflects portfolio rows (shadow-deduped by caller)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("USD", 0)],
      treasurySummaries: [],
      portfolioRows: [{ debt_usd: 1_000, overdue_usd: 976 }],
    });

    const usd = result.find((r) => r.currency === "USD")!;
    expect(usd.overdueReceivables).toBe(976);
  });

  it("UYU overdueReceivables does not bleed into USD slot", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [
        makeCashPosition("UYU", 1_000),
        makeCashPosition("USD", 1_000),
      ],
      treasurySummaries: [],
      portfolioRows: [{ debt_uyu: 0, overdue_uyu: 50_000, debt_usd: 500, overdue_usd: 0 }],
    });

    const usd = result.find((r) => r.currency === "USD")!;
    expect(usd.overdueReceivables).toBe(0);
  });

  it("returns empty array when no cash positions have activity", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [],
      treasurySummaries: [],
      portfolioRows: [],
    });

    expect(result).toHaveLength(0);
  });

  it("UYU availableCash does not contaminate USD slot", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [
        makeCashPosition("UYU", 200_000),
        makeCashPosition("USD", 1_000),
      ],
      treasurySummaries: [],
      portfolioRows: [],
    });

    const usd = result.find((r) => r.currency === "USD")!;
    expect(usd.availableCash).toBe(1_000);
  });
});

describe("CajaProyectadaSection — projection fields from helper", () => {
  it("expectedCash30d = availableCash + pendingReceivables - scheduledPayments30d (UYU)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 80_000)],
      treasurySummaries: [makeOutflowSummary("UYU", 20_000)],
      portfolioRows: [{ debt_uyu: 15_000 }],
    });
    const uyu = result.find((r) => r.currency === "UYU")!;
    // 80_000 + 15_000 - 20_000 = 75_000
    expect(uyu.expectedCash30d).toBe(75_000);
    expect(uyu.expectedCash30d).toBe(
      uyu.availableCash + uyu.pendingReceivables - uyu.scheduledPayments30d
    );
  });

  it("safeCash30d = availableCash - scheduledPayments30d (no receivables counted)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 80_000)],
      treasurySummaries: [makeOutflowSummary("UYU", 20_000)],
      portfolioRows: [{ debt_uyu: 15_000 }],
    });
    const uyu = result.find((r) => r.currency === "UYU")!;
    // 80_000 - 20_000 = 60_000 (receivables not counted)
    expect(uyu.safeCash30d).toBe(60_000);
    expect(uyu.safeCash30d).toBe(uyu.availableCash - uyu.scheduledPayments30d);
  });

  it("safeCash30d < 0 signals 'Riesgo de caja' — deficit equals Math.abs(safeCash30d)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("USD", 1_000)],
      treasurySummaries: [makeOutflowSummary("USD", 8_000)],
      portfolioRows: [{ debt_usd: 3_000 }],
    });
    const usd = result.find((r) => r.currency === "USD")!;
    // safeCash30d = 1_000 - 8_000 = -7_000
    expect(usd.safeCash30d).toBeLessThan(0);
    expect(Math.abs(usd.safeCash30d)).toBe(7_000);
  });

  it("UYU and USD projection blocks are independent — no cross-currency bleeding", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 100_000), makeCashPosition("USD", 5_000)],
      treasurySummaries: [makeOutflowSummary("UYU", 40_000), makeOutflowSummary("USD", 2_000)],
      portfolioRows: [{ debt_uyu: 20_000, debt_usd: 1_000 }],
    });
    const uyu = result.find((r) => r.currency === "UYU")!;
    const usd = result.find((r) => r.currency === "USD")!;
    // UYU: 100_000 + 20_000 - 40_000 = 80_000
    expect(uyu.expectedCash30d).toBe(80_000);
    // USD: 5_000 + 1_000 - 2_000 = 4_000
    expect(usd.expectedCash30d).toBe(4_000);
    expect(uyu.expectedCash30d).not.toBe(usd.expectedCash30d);
  });
});

describe("RiesgoEjecutivoSection — risk classification from canonical state", () => {
  it("safeCash30d >= 0 => ok (covered with current cash)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 100_000)],
      treasurySummaries: [makeOutflowSummary("UYU", 30_000)],
      portfolioRows: [],
    });
    const uyu = result.find((r) => r.currency === "UYU")!;
    // safeCash30d = 100_000 - 30_000 = 70_000 >= 0 => "ok"
    expect(uyu.safeCash30d).toBeGreaterThanOrEqual(0);
    expect(uyu.scheduledPayments30d).toBeGreaterThan(0);
  });

  it("safeCash30d < 0 && expectedCash30d >= 0 => warning (depends on collections)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("USD", 1_000)],
      treasurySummaries: [makeOutflowSummary("USD", 5_000)],
      portfolioRows: [{ debt_usd: 10_000 }],
    });
    const usd = result.find((r) => r.currency === "USD")!;
    // safeCash30d = 1_000 - 5_000 = -4_000 < 0
    expect(usd.safeCash30d).toBeLessThan(0);
    // expectedCash30d = 1_000 + 10_000 - 5_000 = 6_000 >= 0 => "warning"
    expect(usd.expectedCash30d).toBeGreaterThanOrEqual(0);
  });

  it("expectedCash30d < 0 => danger (not covered even with collections)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("USD", 500)],
      treasurySummaries: [makeOutflowSummary("USD", 10_000)],
      portfolioRows: [{ debt_usd: 2_000 }],
    });
    const usd = result.find((r) => r.currency === "USD")!;
    // expectedCash30d = 500 + 2_000 - 10_000 = -7_500 < 0 => "danger"
    expect(usd.expectedCash30d).toBeLessThan(0);
    expect(usd.safeCash30d).toBeLessThan(0);
  });

  it("scheduledPayments30d = 0 => neutral (no payments configured)", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 50_000)],
      treasurySummaries: [],
      portfolioRows: [{ debt_uyu: 5_000 }],
    });
    const uyu = result.find((r) => r.currency === "UYU")!;
    // no treasury summaries => scheduledPayments30d = 0 => "neutral"
    expect(uyu.scheduledPayments30d).toBe(0);
  });

  it("UYU danger does not affect USD risk classification", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 100), makeCashPosition("USD", 50_000)],
      treasurySummaries: [
        makeOutflowSummary("UYU", 99_000),
        makeOutflowSummary("USD", 1_000),
      ],
      portfolioRows: [{ debt_uyu: 0, debt_usd: 0 }],
    });
    const uyu = result.find((r) => r.currency === "UYU")!;
    const usd = result.find((r) => r.currency === "USD")!;
    // UYU: danger (expectedCash30d = 100 + 0 - 99_000 < 0)
    expect(uyu.expectedCash30d).toBeLessThan(0);
    // USD: ok (safeCash30d = 50_000 - 1_000 = 49_000 >= 0)
    expect(usd.safeCash30d).toBeGreaterThanOrEqual(0);
  });
});
