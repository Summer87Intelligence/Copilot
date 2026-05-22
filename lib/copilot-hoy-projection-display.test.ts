import { describe, expect, it } from "vitest";

import type { HoyProjection30dBlock, HoyTreasuryAlert } from "@/lib/copilot-hoy-treasury";
import {
  projectionCurrencySummaryLine,
  selectHoyProjectionUiAlerts,
} from "@/lib/copilot-hoy-projection-display";

function block(
  partial: Partial<HoyProjection30dBlock> & Pick<HoyProjection30dBlock, "currency">
): HoyProjection30dBlock {
  return {
    currentCash: 1000,
    scheduledPayments: 500,
    safeCash30d: 500,
    pendingReceivables: 200,
    expectedCash30d: 700,
    hasConfiguredPayments: true,
    safeCoverageStatus: "healthy",
    ...partial,
  };
}

describe("selectHoyProjectionUiAlerts", () => {
  it("deduplicates per-currency pending-not-cash into one general overdue alert", () => {
    const raw: HoyTreasuryAlert[] = [
      {
        id: "treasury_pending_not_cash_UYU",
        tone: "attention",
        message: "UYU duplicate",
      },
      {
        id: "treasury_pending_not_cash_USD",
        tone: "attention",
        message: "USD duplicate",
      },
    ];
    const ui = selectHoyProjectionUiAlerts(
      raw,
      [block({ currency: "UYU" }), block({ currency: "USD" })],
      { UYU: 100, USD: 0 }
    );
    expect(ui.some((a) => a.id === "treasury_overdue_general")).toBe(true);
    expect(ui.some((a) => a.id.startsWith("treasury_pending_not_cash"))).toBe(false);
    expect(ui.length).toBeLessThanOrEqual(3);
  });

  it("collapses safe deficit per currency into one general message", () => {
    const raw: HoyTreasuryAlert[] = [
      { id: "treasury_safe_deficit_UYU", tone: "critical", message: "UYU" },
      { id: "treasury_safe_deficit_USD", tone: "critical", message: "USD" },
    ];
    const blocks = [
      block({ currency: "UYU", safeCash30d: -100, expectedCash30d: -50 }),
      block({ currency: "USD", safeCash30d: -50, expectedCash30d: -20 }),
    ];
    const ui = selectHoyProjectionUiAlerts(raw, blocks, { UYU: 0, USD: 0 });
    expect(ui.filter((a) => a.id === "treasury_safe_deficit_general")).toHaveLength(1);
    expect(ui.some((a) => a.id === "treasury_safe_deficit_UYU")).toBe(false);
  });
});

describe("projectionCurrencySummaryLine", () => {
  it("returns depends-on-collection line when safe negative but expected positive", () => {
    const line = projectionCurrencySummaryLine(
      block({ currency: "UYU", safeCash30d: -10, expectedCash30d: 100 })
    );
    expect(line).toContain("si se cobra");
  });
});
