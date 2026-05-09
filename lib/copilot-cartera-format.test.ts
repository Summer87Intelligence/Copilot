import { describe, it, expect } from "vitest";

import {
  currencyLabelFor,
  currencyShortLabelFor,
  currencySymbolFor,
  deriveCollectionEffectiveness,
  formatCarteraInteger,
  formatCarteraMoney,
  formatCarteraPercent,
  formatRelativeAgeHours,
  pickMostRecentSync,
  pickWorstSyncStatus,
} from "./copilot-cartera-format";
import type { SyncStateSummary } from "./copilot-financial-reconciliation";

describe("currency helpers", () => {
  it("returns canonical symbols for known currencies", () => {
    expect(currencySymbolFor("UYU")).toBe("$");
    expect(currencySymbolFor("USD")).toBe("U$S");
  });

  it("falls back to the raw code for unknown currencies", () => {
    expect(currencySymbolFor("EUR")).toBe("EUR");
  });

  it("returns spanish labels for known currencies", () => {
    expect(currencyLabelFor("UYU")).toBe("Pesos uruguayos");
    expect(currencyLabelFor("USD")).toBe("Dólares");
    expect(currencyShortLabelFor("UYU")).toBe("Pesos");
    expect(currencyShortLabelFor("USD")).toBe("Dólares");
  });
});

describe("formatCarteraMoney", () => {
  it("formats UYU with 2 decimals by default", () => {
    expect(formatCarteraMoney("UYU", 12345.6)).toBe("$ 12.345,60");
  });

  it("formats USD with 2 decimals by default", () => {
    expect(formatCarteraMoney("USD", 15366.65)).toBe("U$S 15.366,65");
  });

  it("respects custom fractionDigits", () => {
    expect(formatCarteraMoney("UYU", 12345.67, { fractionDigits: 0 })).toBe("$ 12.346");
  });

  it("treats non-finite inputs as 0", () => {
    expect(formatCarteraMoney("USD", Number.NaN)).toBe("U$S 0,00");
  });
});

describe("formatCarteraInteger", () => {
  it("formats integers with es-UY thousands", () => {
    expect(formatCarteraInteger(1234567)).toBe("1.234.567");
  });

  it("rounds non-integer inputs", () => {
    expect(formatCarteraInteger(99.7)).toBe("100");
  });

  it("returns 0 for non-finite values", () => {
    expect(formatCarteraInteger(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("formatCarteraPercent", () => {
  it("formats ratios with 1 decimal", () => {
    expect(formatCarteraPercent(0.8146)).toBe("81,5%");
  });

  it("clamps ratios outside [0,1]", () => {
    expect(formatCarteraPercent(1.5)).toBe("100,0%");
    expect(formatCarteraPercent(-0.2)).toBe("0,0%");
  });

  it("returns em-dash for null/undefined/NaN", () => {
    expect(formatCarteraPercent(null)).toBe("—");
    expect(formatCarteraPercent(undefined)).toBe("—");
    expect(formatCarteraPercent(Number.NaN)).toBe("—");
  });
});

describe("formatRelativeAgeHours", () => {
  it("returns 'hace minutos' for sub-hour ages", () => {
    expect(formatRelativeAgeHours(0.5)).toBe("hace minutos");
  });

  it("returns hours for ages under 24h", () => {
    expect(formatRelativeAgeHours(3)).toBe("hace 3h");
    expect(formatRelativeAgeHours(23.4)).toBe("hace 23h");
  });

  it("returns days for ages >= 24h", () => {
    expect(formatRelativeAgeHours(48)).toBe("hace 2 d");
    expect(formatRelativeAgeHours(120)).toBe("hace 5 d");
  });

  it("returns 'sin registro' for null/undefined", () => {
    expect(formatRelativeAgeHours(null)).toBe("sin registro");
    expect(formatRelativeAgeHours(undefined)).toBe("sin registro");
  });
});

function syncRow(overrides: Partial<SyncStateSummary>): SyncStateSummary {
  return {
    resource_flow: "x",
    last_success_at: null,
    bootstrap_completed: true,
    ageHours: null,
    status: "ok",
    ...overrides,
  };
}

describe("pickMostRecentSync", () => {
  it("returns the most recent sync state by last_success_at", () => {
    const a = syncRow({ resource_flow: "a", last_success_at: "2026-05-01T10:00:00Z" });
    const b = syncRow({ resource_flow: "b", last_success_at: "2026-05-08T22:00:00Z" });
    const c = syncRow({ resource_flow: "c", last_success_at: "2026-05-05T08:00:00Z" });
    expect(pickMostRecentSync([a, b, c])?.resource_flow).toBe("b");
  });

  it("ignores rows without timestamp", () => {
    const a = syncRow({ resource_flow: "a", last_success_at: null });
    const b = syncRow({ resource_flow: "b", last_success_at: "2026-05-08T22:00:00Z" });
    expect(pickMostRecentSync([a, b])?.resource_flow).toBe("b");
  });

  it("returns null if no row has a valid timestamp", () => {
    expect(pickMostRecentSync([])).toBeNull();
    expect(pickMostRecentSync([syncRow({ last_success_at: null })])).toBeNull();
  });
});

describe("pickWorstSyncStatus", () => {
  it("returns 'never_synced' for empty input", () => {
    expect(pickWorstSyncStatus([])).toBe("never_synced");
  });

  it("returns the worst status across rows", () => {
    expect(
      pickWorstSyncStatus([
        syncRow({ status: "ok" }),
        syncRow({ status: "warning" }),
        syncRow({ status: "ok" }),
      ])
    ).toBe("warning");

    expect(
      pickWorstSyncStatus([
        syncRow({ status: "warning" }),
        syncRow({ status: "critical" }),
        syncRow({ status: "ok" }),
      ])
    ).toBe("critical");

    expect(
      pickWorstSyncStatus([
        syncRow({ status: "warning" }),
        syncRow({ status: "never_synced" }),
      ])
    ).toBe("never_synced");
  });
});

describe("deriveCollectionEffectiveness", () => {
  it("returns ratio in [0,1] for valid totals", () => {
    expect(
      deriveCollectionEffectiveness({ totalInvoiced: 100, totalPending: 25 })
    ).toBeCloseTo(0.75, 5);
  });

  it("clamps overpaid (negative pending) to 1", () => {
    expect(
      deriveCollectionEffectiveness({ totalInvoiced: 100, totalPending: -10 })
    ).toBe(1);
  });

  it("clamps fully-pending to 0", () => {
    expect(
      deriveCollectionEffectiveness({ totalInvoiced: 100, totalPending: 100 })
    ).toBe(0);
  });

  it("returns null when totalInvoiced <= 0 (avoid div/0)", () => {
    expect(
      deriveCollectionEffectiveness({ totalInvoiced: 0, totalPending: 0 })
    ).toBeNull();
    expect(
      deriveCollectionEffectiveness({ totalInvoiced: -10, totalPending: 0 })
    ).toBeNull();
  });
});
