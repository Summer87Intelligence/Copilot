import { describe, it, expect } from "vitest";
import {
  emptyCurrencyTotals,
  mergeCurrencyTotals,
  buildSnapshotCurrencyBreakdown,
  detectSnapshotCurrency,
  snapshotHasMixedCurrency,
  type SnapshotCurrencyBreakdown,
} from "./copilot-snapshot-currency";

const TODAY = "2025-05-19";

describe("emptyCurrencyTotals", () => {
  it("returns zero-initialized totals", () => {
    const t = emptyCurrencyTotals();
    expect(t.invoiced).toBe(0);
    expect(t.pending).toBe(0);
    expect(t.overdue).toBe(0);
  });
});

describe("mergeCurrencyTotals", () => {
  it("adds invoiced + pending + overdue", () => {
    const a = { invoiced: 100, pending: 50, overdue: 20 };
    const b = { invoiced: 200, pending: 80, overdue: 0 };
    const result = mergeCurrencyTotals(a, b);
    expect(result.invoiced).toBe(300);
    expect(result.pending).toBe(130);
    expect(result.overdue).toBe(20);
  });

  it("handles missing fields as zero", () => {
    const a = { invoiced: 100 };
    const b = { pending: 50 };
    const result = mergeCurrencyTotals(a, b);
    expect(result.invoiced).toBe(100);
    expect(result.pending).toBe(50);
    expect(result.overdue).toBe(0);
  });

  it("propagates optional collected and expenses when present", () => {
    const a = { invoiced: 0, pending: 0, overdue: 0, collected: 100, expenses: 40 };
    const b = { invoiced: 0, pending: 0, overdue: 0, collected: 50, expenses: 10 };
    const result = mergeCurrencyTotals(a, b);
    expect(result.collected).toBe(150);
    expect(result.expenses).toBe(50);
  });

  it("omits collected when neither side has it", () => {
    const a = { invoiced: 10, pending: 5, overdue: 0 };
    const b = { invoiced: 20, pending: 10, overdue: 0 };
    const result = mergeCurrencyTotals(a, b);
    expect("collected" in result).toBe(false);
  });
});

describe("buildSnapshotCurrencyBreakdown", () => {
  it("returns empty object for empty list", () => {
    const breakdown = buildSnapshotCurrencyBreakdown([], TODAY);
    expect(Object.keys(breakdown)).toHaveLength(0);
  });

  it("ignores invoices without currency_code", () => {
    const invoices = [{ balance_amount: 100, total_amount: 500, due_date: "2025-01-01" }];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(Object.keys(breakdown)).toHaveLength(0);
  });

  it("ignores invoices with unsupported currency", () => {
    const invoices = [{ currency_code: "EUR", balance_amount: 100, total_amount: 500 }];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(Object.keys(breakdown)).toHaveLength(0);
  });

  it("accumulates UYU-only invoices", () => {
    const invoices = [
      { currency_code: "UYU", total_amount: 1000, balance_amount: 400, due_date: "2025-01-01" },
      { currency_code: "UYU", total_amount: 2000, balance_amount: 0, due_date: "2025-06-01" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.UYU?.invoiced).toBe(3000);
    expect(breakdown.UYU?.pending).toBe(400);
    expect(breakdown.UYU?.overdue).toBe(400);
    expect(breakdown.USD).toBeUndefined();
  });

  it("accumulates USD-only invoices", () => {
    const invoices = [
      { currency_code: "USD", total_amount: 500, balance_amount: 200, due_date: "2025-01-01" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.USD?.invoiced).toBe(500);
    expect(breakdown.USD?.pending).toBe(200);
    expect(breakdown.USD?.overdue).toBe(200);
    expect(breakdown.UYU).toBeUndefined();
  });

  it("separates UYU and USD invoices", () => {
    const invoices = [
      { currency_code: "UYU", total_amount: 1000, balance_amount: 300, due_date: "2025-01-01" },
      { currency_code: "USD", total_amount: 800, balance_amount: 100, due_date: "2025-01-01" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.UYU?.invoiced).toBe(1000);
    expect(breakdown.USD?.invoiced).toBe(800);
  });

  it("does not count future due as overdue", () => {
    const invoices = [
      { currency_code: "UYU", total_amount: 1000, balance_amount: 500, due_date: "2099-12-31" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.UYU?.pending).toBe(500);
    expect(breakdown.UYU?.overdue).toBe(0);
  });

  it("balance_amount=0 is not overdue", () => {
    const invoices = [
      { currency_code: "UYU", total_amount: 1000, balance_amount: 0, due_date: "2020-01-01" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.UYU?.pending).toBe(0);
    expect(breakdown.UYU?.overdue).toBe(0);
  });

  it("handles non-numeric amounts as zero", () => {
    const invoices = [
      { currency_code: "UYU", total_amount: "not-a-number", balance_amount: null, due_date: "2020-01-01" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.UYU?.invoiced).toBe(0);
    expect(breakdown.UYU?.pending).toBe(0);
    expect(breakdown.UYU?.overdue).toBe(0);
  });

  it("handles lowercase currency code via normalization", () => {
    const invoices = [
      { currency_code: "uyu", total_amount: 500, balance_amount: 100, due_date: "2020-01-01" },
    ];
    const breakdown = buildSnapshotCurrencyBreakdown(invoices, TODAY);
    expect(breakdown.UYU?.invoiced).toBe(500);
  });
});

describe("detectSnapshotCurrency", () => {
  it("returns unspecified for empty breakdown", () => {
    expect(detectSnapshotCurrency({})).toBe("unspecified");
  });

  it("returns UYU when only UYU present", () => {
    const b: SnapshotCurrencyBreakdown = { UYU: emptyCurrencyTotals() };
    expect(detectSnapshotCurrency(b)).toBe("UYU");
  });

  it("returns USD when only USD present", () => {
    const b: SnapshotCurrencyBreakdown = { USD: emptyCurrencyTotals() };
    expect(detectSnapshotCurrency(b)).toBe("USD");
  });

  it("returns mixed when both UYU and USD present", () => {
    const b: SnapshotCurrencyBreakdown = { UYU: emptyCurrencyTotals(), USD: emptyCurrencyTotals() };
    expect(detectSnapshotCurrency(b)).toBe("mixed");
  });
});

describe("snapshotHasMixedCurrency", () => {
  it("returns false for undefined", () => {
    expect(snapshotHasMixedCurrency(undefined)).toBe(false);
  });

  it("returns false for empty breakdown", () => {
    expect(snapshotHasMixedCurrency({})).toBe(false);
  });

  it("returns false for single currency", () => {
    expect(snapshotHasMixedCurrency({ UYU: emptyCurrencyTotals() })).toBe(false);
  });

  it("returns true for both UYU and USD", () => {
    expect(
      snapshotHasMixedCurrency({ UYU: emptyCurrencyTotals(), USD: emptyCurrencyTotals() })
    ).toBe(true);
  });
});
