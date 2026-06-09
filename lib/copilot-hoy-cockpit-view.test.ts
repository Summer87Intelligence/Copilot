import { describe, expect, it } from "vitest";

import { buildCockpitView } from "@/lib/copilot-hoy-cockpit-view";
import { buildTodayBusinessPulse, type BusinessPulseGate } from "@/lib/copilot-today-business-pulse";

const gate: BusinessPulseGate = {
  confidence: "high",
  coverage: "full",
  recommendations_enabled: true,
};

describe("buildCockpitView", () => {
  it("exposes four money blocks and max 3 insights", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [
        {
          company_id: "1",
          name: "Cliente",
          debt_uyu: 1000,
          debt_usd: 0,
          overdue_debt: 0,
          risk: "Bajo",
        } as never,
      ],
      gate,
      treasuryCashPositions: [
        {
          currency: "UYU",
          availableCash: 5000,
          currentCash: 5000,
          collectedFromClients: 5000,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          openingConfigured: false,
          openingBalance: 0,
          movementsCount: 1,
          lastMovement: null,
        },
      ],
    });
    const view = buildCockpitView(pulse);
    expect(view.moneyAvailable.amounts.some((a) => a.currency === "UYU")).toBe(true);
    expect(view.afterPayments.amounts.some((a) => a.currency === "UYU")).toBe(true);
    expect(view.receivables.totalPending.some((a) => a.currency === "UYU")).toBe(true);
    expect(view.receivables.overdueTotal).toBeDefined();
    expect(view.receivables.overdue30).toBeDefined();
    expect(view.insights.length).toBeLessThanOrEqual(3);
    expect(view.hero.statusLabel).toMatch(/ESTABLE|REQUIERE ATENCIÓN|ATENCIÓN CRÍTICA/);
    expect(view.hero.headline.length).toBeGreaterThan(0);
    expect(view.hero.operacionalHref).toBe("/copilot/operacional");
  });
});
