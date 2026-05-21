import { describe, expect, it } from "vitest";

import {
  calculateCashPosition,
  manualMovementAffectsCurrentCash,
  projectedCashBalance30d,
} from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

function manual(partial: Partial<ManualCashMovement>): ManualCashMovement {
  return {
    id: partial.id ?? "m1",
    workspaceId: partial.workspaceId ?? "ws",
    companyId: partial.companyId ?? null,
    accountId: partial.accountId ?? null,
    ledgerType: partial.ledgerType ?? "cash",
    movementType: partial.movementType ?? "income",
    source: partial.source ?? "manual",
    concept: partial.concept ?? "Mov",
    category: partial.category ?? null,
    amount: partial.amount ?? 100,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-01",
    paymentMethod: partial.paymentMethod ?? null,
    counterparty: partial.counterparty ?? null,
    reference: partial.reference ?? null,
    notes: partial.notes ?? null,
    affectsCashflow: partial.affectsCashflow ?? true,
    reconciled: partial.reconciled ?? false,
    bankReconciliationId: partial.bankReconciliationId ?? null,
    status: partial.status ?? "active",
    createdBy: partial.createdBy ?? null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
    rawPayload: partial.rawPayload ?? null,
    metadata: partial.metadata ?? null,
  };
}

describe("calculateCashPosition", () => {
  it("income suma y expense resta en UYU", () => {
    const positions = calculateCashPosition({
      openingBalances: [{ currency: "UYU", amount: 10_000 }],
      manualCashMovements: [
        manual({ id: "i1", movementType: "income", amount: 5_000 }),
        manual({ id: "e1", movementType: "expense", amount: 2_000 }),
      ],
    });
    const uyu = positions.find((p) => p.currency === "UYU");
    expect(uyu?.manualIncome).toBe(5_000);
    expect(uyu?.manualExpense).toBe(2_000);
    expect(uyu?.currentCash).toBe(13_000);
    expect(uyu?.openingConfigured).toBe(true);
  });

  it("adjustment increase suma y decrease resta", () => {
    const positions = calculateCashPosition({
      openingBalances: [{ currency: "USD", amount: 100 }],
      manualCashMovements: [
        manual({
          id: "a1",
          currencyCode: "USD",
          movementType: "adjustment",
          amount: 50,
          metadata: { adjustment_direction: "increase" },
        }),
        manual({
          id: "a2",
          currencyCode: "USD",
          movementType: "adjustment",
          amount: 20,
          metadata: { adjustment_direction: "decrease" },
        }),
      ],
    });
    const usd = positions.find((p) => p.currency === "USD");
    expect(usd?.adjustments).toBe(30);
    expect(usd?.currentCash).toBe(130);
  });

  it("UYU y USD separados", () => {
    const positions = calculateCashPosition({
      openingBalances: [
        { currency: "UYU", amount: 1_000 },
        { currency: "USD", amount: 200 },
      ],
      manualCashMovements: [
        manual({ id: "u1", currencyCode: "UYU", movementType: "income", amount: 500 }),
        manual({ id: "d1", currencyCode: "USD", movementType: "expense", amount: 50 }),
      ],
    });
    expect(positions.find((p) => p.currency === "UYU")?.currentCash).toBe(1_500);
    expect(positions.find((p) => p.currency === "USD")?.currentCash).toBe(150);
  });

  it("archived no afecta caja actual", () => {
    const positions = calculateCashPosition({
      openingBalances: [{ currency: "UYU", amount: 0 }],
      manualCashMovements: [
        manual({ movementType: "income", amount: 9_000, status: "archived" }),
        manual({ movementType: "income", amount: 1_000, status: "active" }),
      ],
    });
    expect(positions.find((p) => p.currency === "UYU")?.currentCash).toBe(1_000);
    expect(positions.find((p) => p.currency === "UYU")?.movementsCount).toBe(1);
  });

  it("sin saldo inicial → openingConfigured false", () => {
    const positions = calculateCashPosition({
      manualCashMovements: [manual({ movementType: "income", amount: 500 })],
    });
    const uyu = positions.find((p) => p.currency === "UYU");
    expect(uyu?.openingConfigured).toBe(false);
    expect(uyu?.currentCash).toBe(500);
  });
});

describe("manualMovementAffectsCurrentCash", () => {
  it("active income afecta", () => {
    expect(manualMovementAffectsCurrentCash(manual({ movementType: "income" }))).toBe(true);
  });
  it("archived no afecta", () => {
    expect(
      manualMovementAffectsCurrentCash(manual({ movementType: "income", status: "archived" }))
    ).toBe(false);
  });
});

describe("projectedCashBalance30d", () => {
  it("caja actual + por cobrar - pagos futuros", () => {
    expect(projectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
  });
});
