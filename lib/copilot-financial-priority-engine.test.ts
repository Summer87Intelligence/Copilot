import { describe, expect, it } from "vitest";

import { buildFinancialPriorityModel } from "./copilot-financial-priority-engine";
import type { CurrencyMetrics } from "./copilot-financial-dashboard-metrics";

function currency(overrides: Partial<CurrencyMetrics> = {}): CurrencyMetrics {
  return {
    currencyCode: "USD",
    totalInvoiced: 10000,
    totalCollected: 7000,
    totalPending: 3000,
    invoiceCount: 10,
    paidInvoiceCount: 7,
    partialInvoiceCount: 1,
    pendingInvoiceCount: 2,
    debtorClientsCount: 2,
    collectionEffectiveness: 70,
    topDebtors: [
      {
        companyId: "c1",
        companyName: "Trexys",
        pendingAmount: 2000,
        invoiceCount: 2,
        dominantAgingLabel: "90+",
        oldestAgeDays: 104,
        totalInvoiced: 3000,
        totalCollected: 1000,
        collectionEffectiveness: 33.33,
      },
      {
        companyId: "c2",
        companyName: "Beta",
        pendingAmount: 1000,
        invoiceCount: 1,
        dominantAgingLabel: "31-60",
        oldestAgeDays: 45,
        totalInvoiced: 1000,
        totalCollected: 0,
        collectionEffectiveness: 0,
      },
    ],
    aging: [
      { label: "0-30", amount: 0, invoiceCount: 0 },
      { label: "31-60", amount: 1000, invoiceCount: 1 },
      { label: "61-90", amount: 0, invoiceCount: 0 },
      { label: "90+", amount: 2000, invoiceCount: 2 },
    ],
    ...overrides,
  };
}

describe("buildFinancialPriorityModel", () => {
  it("genera alertas high por >90 días, concentración, efectividad <80 y cliente >25%", () => {
    const model = buildFinancialPriorityModel({ currencies: [currency()] });
    expect(model.alerts.filter((a) => a.severity === "high").map((a) => a.id)).toEqual(
      expect.arrayContaining([
        "USD:aging-90",
        "USD:concentration",
        "USD:effectiveness-high",
        "USD:debtor-share:c1",
        "USD:debtor-share:c2",
      ])
    );
  });

  it("genera alerta medium cuando la efectividad está entre 80 y 90", () => {
    const model = buildFinancialPriorityModel({
      currencies: [currency({ collectionEffectiveness: 85, totalCollected: 8500 })],
    });
    expect(model.alerts.some((a) => a.id === "USD:effectiveness-medium")).toBe(true);
  });

  it("genera alerta medium por deuda 61-90 significativa", () => {
    const model = buildFinancialPriorityModel({
      currencies: [
        currency({
          collectionEffectiveness: 95,
          totalCollected: 9500,
          totalPending: 1000,
          topDebtors: [
            {
              companyId: "c1",
              companyName: "Cliente",
              pendingAmount: 1000,
              invoiceCount: 1,
              dominantAgingLabel: "61-90",
              oldestAgeDays: 70,
              totalInvoiced: 1000,
              totalCollected: 0,
              collectionEffectiveness: 0,
            },
          ],
          aging: [
            { label: "0-30", amount: 0, invoiceCount: 0 },
            { label: "31-60", amount: 0, invoiceCount: 0 },
            { label: "61-90", amount: 1000, invoiceCount: 1 },
            { label: "90+", amount: 0, invoiceCount: 0 },
          ],
        }),
      ],
    });
    expect(model.alerts.some((a) => a.id === "USD:aging-61-90")).toBe(true);
  });

  it("ordena prioridades por priorityScore descendente y clasifica riesgo", () => {
    const model = buildFinancialPriorityModel({ currencies: [currency()] });
    expect(model.actionPriorities.map((p) => p.companyName)).toEqual(["Trexys", "Beta"]);
    expect(model.actionPriorities[0]).toMatchObject({
      risk: "high",
      priority: "Alta",
      dominantAgingLabel: "90+",
      oldestAgeDays: 104,
    });
    expect(model.actionPriorities[0].priorityScore).toBeGreaterThan(
      model.actionPriorities[1].priorityScore
    );
  });

  it("crea semáforos de riesgo por cobranza, concentración, aging y clientes críticos", () => {
    const model = buildFinancialPriorityModel({ currencies: [currency()] });
    expect(model.risks.map((r) => [r.id, r.status])).toEqual([
      ["USD:risk-effectiveness", "critical"],
      ["USD:risk-concentration", "critical"],
      ["USD:risk-aging", "critical"],
      ["USD:risk-critical-clients", "critical"],
    ]);
  });

  it("devuelve low healthy cuando no hay señales fuertes", () => {
    const model = buildFinancialPriorityModel({
      currencies: [
        currency({
          totalInvoiced: 10000,
          totalCollected: 10000,
          totalPending: 0,
          collectionEffectiveness: 100,
          debtorClientsCount: 0,
          topDebtors: [],
          aging: [
            { label: "0-30", amount: 0, invoiceCount: 0 },
            { label: "31-60", amount: 0, invoiceCount: 0 },
            { label: "61-90", amount: 0, invoiceCount: 0 },
            { label: "90+", amount: 0, invoiceCount: 0 },
          ],
        }),
      ],
    });
    expect(model.alerts).toEqual([
      expect.objectContaining({
        id: "USD:healthy",
        severity: "low",
      }),
    ]);
    expect(model.actionPriorities).toEqual([]);
    expect(model.risks.every((r) => r.status === "healthy")).toBe(true);
  });
});
