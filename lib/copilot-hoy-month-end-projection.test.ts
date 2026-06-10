import { describe, expect, it } from "vitest";

import {
  buildHoyMonthEndProjection,
  buildHoyMonthEndProjectionBundle,
  classifyMonthEndCashRisk,
  daysUntilMonthEnd,
  DEFAULT_MONTH_END_SCENARIO,
  listExecutiveMonthDates,
  monthEndYmd,
  MONTH_END_ATTENTION_MARGIN_RATE,
  MONTH_END_SCENARIO_COLLECTION_RATE,
  sumScheduledOutflowsThroughDate,
} from "@/lib/copilot-hoy-month-end-projection";
import type { HoyCashPositionBlock } from "@/lib/copilot-hoy-treasury";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";

function cashBlock(currency: "UYU" | "USD", availableCash: number): HoyCashPositionBlock {
  return {
    currency,
    openingConfigured: true,
    openingBalance: availableCash,
    collectedFromClients: 0,
    manualIncome: 0,
    manualExpense: 0,
    availableCash,
    lastMovement: null,
    lastIncome: null,
    lastExpense: null,
  };
}

function scheduled(
  partial: Partial<TreasuryScheduledPayment> &
    Pick<TreasuryScheduledPayment, "dueDate" | "amount" | "currency">
): TreasuryScheduledPayment {
  return {
    id: "s1",
    workspaceId: "ws",
    name: "Pago",
    category: "Proveedores",
    obligationType: "supplier",
    status: "scheduled",
    recurrence: "none",
    source: "manual",
    notes: null,
    paidAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    recurringCategoryLabel: null,
    ...partial,
  };
}

const baseInput = {
  asOfDate: "2026-06-10",
  pendingByCurrency: { UYU: 500_000, USD: 0 },
  cashPositionBlocks: [cashBlock("UYU", 1_000_000)],
  scheduledPayments: [
    scheduled({ currency: "UYU", amount: 400_000, dueDate: "2026-06-25" }),
  ],
};

describe("copilot-hoy-month-end-projection", () => {
  const asOf = "2026-06-10";

  it("monthEndYmd devuelve último día del mes", () => {
    expect(monthEndYmd("2026-06-10")).toBe("2026-06-30");
    expect(monthEndYmd("2026-02-15")).toBe("2026-02-28");
  });

  it("daysUntilMonthEnd", () => {
    expect(daysUntilMonthEnd("2026-06-10")).toBe(20);
  });

  it("sumScheduledOutflowsThroughDate incluye vencidos y excluye futuros lejanos", () => {
    const items = [
      scheduled({ currency: "UYU", amount: 100, dueDate: "2026-06-05", status: "overdue" }),
      scheduled({ currency: "UYU", amount: 200, dueDate: "2026-06-20" }),
      scheduled({ currency: "UYU", amount: 999, dueDate: "2026-07-05" }),
    ];
    expect(sumScheduledOutflowsThroughDate(items, "2026-06-30", "UYU")).toBe(300);
  });

  it("default escenario es esperado (75%)", () => {
    expect(DEFAULT_MONTH_END_SCENARIO).toBe("expected");
    const projection = buildHoyMonthEndProjection(baseInput);
    expect(projection?.scenario).toBe("expected");
    expect(projection?.collectionRatePct).toBe(75);
  });

  it("caja fin de mes esperado = caja hoy + 75% pendiente − egresos", () => {
    const projection = buildHoyMonthEndProjection({ ...baseInput, scenario: "expected" });
    expect(projection).not.toBeNull();
    const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;
    expect(uyu.estimatedCollectionsMonth).toBe(375_000);
    expect(uyu.monthEndCash).toBe(975_000);
    expect(uyu.deltaVsToday).toBe(-25_000);
  });

  it("conservador <= esperado <= optimista en caja al cierre", () => {
    const bundle = buildHoyMonthEndProjectionBundle(baseInput);
    const conservative = bundle.scenarios.conservative!.currencyBlocks.find(
      (b) => b.currency === "UYU"
    )!.monthEndCash;
    const expected = bundle.scenarios.expected!.currencyBlocks.find(
      (b) => b.currency === "UYU"
    )!.monthEndCash;
    const optimistic = bundle.scenarios.optimistic!.currencyBlocks.find(
      (b) => b.currency === "UYU"
    )!.monthEndCash;

    expect(conservative).toBeLessThanOrEqual(expected);
    expect(expected).toBeLessThanOrEqual(optimistic);
    expect(conservative).toBe(1_000_000 + 250_000 - 400_000);
    expect(expected).toBe(975_000);
    expect(optimistic).toBe(1_100_000);
  });

  it("pagos programados iguales en los 3 escenarios", () => {
    const bundle = buildHoyMonthEndProjectionBundle(baseInput);
    const outflows = (["conservative", "expected", "optimistic"] as const).map(
      (s) =>
        bundle.scenarios[s]!.currencyBlocks.find((b) => b.currency === "UYU")!
          .scheduledOutflowsMonth
    );
    expect(outflows[0]).toBe(outflows[1]);
    expect(outflows[1]).toBe(outflows[2]);
    expect(outflows[0]).toBe(400_000);
  });

  it("viernes a viernes cambia según escenario", () => {
    const fridayDate = "2026-06-19";
    const conservative = buildHoyMonthEndProjection({
      ...baseInput,
      scenario: "conservative",
    })!.fridayStrip.find((c) => c.date === fridayDate)!;
    const optimistic = buildHoyMonthEndProjection({
      ...baseInput,
      scenario: "optimistic",
    })!.fridayStrip.find((c) => c.date === fridayDate)!;

    expect(conservative.closingCash.UYU).toBeLessThan(optimistic.closingCash.UYU);
    expect(conservative.cumulativeOutflows.UYU).toBe(optimistic.cumulativeOutflows.UYU);
  });

  it("listExecutiveMonthDates incluye cierre de mes", () => {
    const dates = listExecutiveMonthDates("2026-06-10");
    expect(dates.some((d) => d.isMonthEnd && d.date === "2026-06-30")).toBe(true);
  });

  it("multimoneda: UYU y USD independientes", () => {
    const projection = buildHoyMonthEndProjection({
      asOfDate: asOf,
      pendingByCurrency: { UYU: 100, USD: 200 },
      cashPositionBlocks: [cashBlock("UYU", 1_000), cashBlock("USD", 500)],
      scheduledPayments: [
        scheduled({ currency: "UYU", amount: 50, dueDate: "2026-06-15" }),
        scheduled({ currency: "USD", amount: 100, dueDate: "2026-06-15" }),
      ],
      scenario: "expected",
    });
    const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;
    const usd = projection!.currencyBlocks.find((b) => b.currency === "USD")!;
    expect(uyu.estimatedCollectionsMonth).toBe(roundPct(100, "expected"));
    expect(usd.estimatedCollectionsMonth).toBe(roundPct(200, "expected"));
    expect(uyu.monthEndCash).toBe(1_000 + 75 - 50);
    expect(usd.monthEndCash).toBe(500 + 150 - 100);
  });

  it("tasas de cobro por escenario", () => {
    expect(MONTH_END_SCENARIO_COLLECTION_RATE.conservative).toBe(0.5);
    expect(MONTH_END_SCENARIO_COLLECTION_RATE.expected).toBe(0.75);
    expect(MONTH_END_SCENARIO_COLLECTION_RATE.optimistic).toBe(1);
  });

  describe("semáforo de riesgo (FEATURE-001C)", () => {
    it("classifyMonthEndCashRisk: caja final negativa => crítico", () => {
      expect(classifyMonthEndCashRisk(-1, 400_000)).toBe("critical");
      const projection = buildHoyMonthEndProjection({
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 0, USD: 0 },
        cashPositionBlocks: [cashBlock("UYU", 50_000)],
        scheduledPayments: [
          scheduled({ currency: "UYU", amount: 200_000, dueDate: "2026-06-30" }),
        ],
      });
      const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;
      expect(uyu.monthEndCash).toBeLessThan(0);
      expect(uyu.risk).toBe("critical");
    });

    it("viernes negativo => crítico aunque cierre final sea positivo", () => {
      const fridayDate = "2026-06-12";
      const projection = buildHoyMonthEndProjection({
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 800_000, USD: 0 },
        cashPositionBlocks: [cashBlock("UYU", 100_000)],
        scheduledPayments: [
          scheduled({ currency: "UYU", amount: 250_000, dueDate: fridayDate }),
        ],
        scenario: "optimistic",
      });
      const friday = projection!.fridayStrip.find((c) => c.date === fridayDate)!;
      const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;

      expect(friday.closingCash.UYU).toBeLessThan(0);
      expect(friday.riskByCurrency.UYU).toBe("critical");
      expect(uyu.monthEndCash).toBeGreaterThan(0);
      expect(uyu.risk).toBe("critical");
    });

    it("caja positiva pero menor al 15% de pagos => atención", () => {
      const projection = buildHoyMonthEndProjection({
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 310_000, USD: 0 },
        cashPositionBlocks: [cashBlock("UYU", 100_000)],
        scheduledPayments: [
          scheduled({ currency: "UYU", amount: 400_000, dueDate: "2026-06-30" }),
        ],
        scenario: "optimistic",
      });
      const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;
      const threshold = 400_000 * MONTH_END_ATTENTION_MARGIN_RATE;

      expect(uyu.monthEndCash).toBeGreaterThan(0);
      expect(uyu.monthEndCash).toBeLessThan(threshold);
      expect(uyu.risk).toBe("attention");
      expect(
        projection!.drawer.riskFindings.some(
          (f) => f.currency === "UYU" && f.level === "attention" && f.dateLabel === "Cierre"
        )
      ).toBe(true);
    });

    it("sin pagos y caja positiva => estable", () => {
      const projection = buildHoyMonthEndProjection({
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 100_000, USD: 0 },
        cashPositionBlocks: [cashBlock("UYU", 50_000)],
        scheduledPayments: [],
        scenario: "expected",
      });
      const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;
      expect(uyu.scheduledOutflowsMonth).toBe(0);
      expect(uyu.monthEndCash).toBeGreaterThan(0);
      expect(uyu.risk).toBe("healthy");
      expect(projection!.drawer.riskFindings).toHaveLength(0);
    });

    it("UYU crítico y USD estable no se mezclan", () => {
      const projection = buildHoyMonthEndProjection({
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 0, USD: 200_000 },
        cashPositionBlocks: [cashBlock("UYU", 20_000), cashBlock("USD", 500_000)],
        scheduledPayments: [
          scheduled({ currency: "UYU", amount: 100_000, dueDate: "2026-06-30" }),
          scheduled({ currency: "USD", amount: 50_000, dueDate: "2026-06-30" }),
        ],
        scenario: "optimistic",
      });
      const uyu = projection!.currencyBlocks.find((b) => b.currency === "UYU")!;
      const usd = projection!.currencyBlocks.find((b) => b.currency === "USD")!;

      expect(uyu.risk).toBe("critical");
      expect(usd.risk).toBe("healthy");
      expect(projection!.drawer.riskFindings.every((f) => f.currency === "UYU")).toBe(true);
    });

    it("escenario conservador puede tener más riesgo que optimista", () => {
      const input = {
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 310_000, USD: 0 },
        cashPositionBlocks: [cashBlock("UYU", 100_000)],
        scheduledPayments: [
          scheduled({ currency: "UYU", amount: 400_000, dueDate: "2026-06-30" }),
        ],
      };
      const conservative = buildHoyMonthEndProjection({ ...input, scenario: "conservative" })!;
      const optimistic = buildHoyMonthEndProjection({ ...input, scenario: "optimistic" })!;
      const conservativeUyu = conservative.currencyBlocks.find((b) => b.currency === "UYU")!;
      const optimisticUyu = optimistic.currencyBlocks.find((b) => b.currency === "UYU")!;

      const riskRank = { healthy: 0, attention: 1, critical: 2 };
      expect(riskRank[conservativeUyu.risk]).toBeGreaterThanOrEqual(riskRank[optimisticUyu.risk]);
      expect(conservativeUyu.risk).toBe("critical");
      expect(optimisticUyu.risk).toBe("attention");
    });

    it("día con caja negativa en viernes marca riesgo crítico por moneda", () => {
      const fridayDate = "2026-06-19";
      const projection = buildHoyMonthEndProjection({
        asOfDate: "2026-06-10",
        pendingByCurrency: { UYU: 0, USD: 0 },
        cashPositionBlocks: [cashBlock("UYU", 50_000)],
        scheduledPayments: [
          scheduled({ currency: "UYU", amount: 200_000, dueDate: fridayDate }),
        ],
      });
      const friday = projection!.fridayStrip.find((c) => c.date === fridayDate);
      expect(friday?.riskByCurrency.UYU).toBe("critical");
      expect(friday?.closingCash.UYU).toBeLessThan(0);
    });
  });
});

function roundPct(amount: number, scenario: keyof typeof MONTH_END_SCENARIO_COLLECTION_RATE): number {
  return Math.round(amount * MONTH_END_SCENARIO_COLLECTION_RATE[scenario] * 100) / 100;
}
