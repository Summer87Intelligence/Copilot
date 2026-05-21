import { describe, expect, it } from "vitest";

import {
  calculateCashPosition,
  expectedCashBalance30d,
  manualMovementAffectsCurrentCash,
  mergeCollectedIntoCashPositions,
  projectedCashBalance30d,
  safeCashBalance30d,
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

describe("calculateCashPosition — caja disponible estimada", () => {
  it("availableCash = collected + manualIncome - manualExpense sin saldo inicial", () => {
    const positions = calculateCashPosition({
      manualCashMovements: [
        manual({ id: "i1", movementType: "income", amount: 5_000 }),
        manual({ id: "e1", movementType: "expense", amount: 2_000 }),
      ],
      collectedFromClients: [{ currency: "UYU", amount: 100_000 }],
    });
    const uyu = positions.find((p) => p.currency === "UYU");
    expect(uyu?.collectedFromClients).toBe(100_000);
    expect(uyu?.availableCash).toBe(103_000);
    expect(uyu?.openingConfigured).toBe(false);
  });

  it("openingBalance opcional default 0", () => {
    const positions = calculateCashPosition({
      manualCashMovements: [manual({ movementType: "income", amount: 500 })],
    });
    expect(positions.find((p) => p.currency === "UYU")?.openingBalance).toBe(0);
    expect(positions.find((p) => p.currency === "UYU")?.availableCash).toBe(500);
  });

  it("UYU y USD separados", () => {
    const positions = calculateCashPosition({
      collectedFromClients: [
        { currency: "UYU", amount: 10_000 },
        { currency: "USD", amount: 500 },
      ],
      manualCashMovements: [
        manual({ currencyCode: "USD", movementType: "expense", amount: 60 }),
      ],
    });
    expect(positions.find((p) => p.currency === "UYU")?.availableCash).toBe(10_000);
    expect(positions.find((p) => p.currency === "USD")?.availableCash).toBe(440);
  });

  it("archived no afecta caja", () => {
    const positions = calculateCashPosition({
      manualCashMovements: [
        manual({ movementType: "income", amount: 9_000, status: "archived" }),
        manual({ movementType: "income", amount: 1_000, status: "active" }),
      ],
    });
    expect(positions.find((p) => p.currency === "UYU")?.availableCash).toBe(1_000);
  });
});

describe("mergeCollectedIntoCashPositions", () => {
  it("fusiona cobrado de Cartera post-cálculo manual", () => {
    const base = calculateCashPosition({
      manualCashMovements: [manual({ movementType: "expense", amount: 60, currencyCode: "USD" })],
    });
    const merged = mergeCollectedIntoCashPositions(base, { USD: 500 });
    expect(merged.find((p) => p.currency === "USD")?.availableCash).toBe(440);
  });
});

describe("safeCashBalance30d", () => {
  it("caja segura = available - pagos futuros", () => {
    expect(safeCashBalance30d(50_000, 40_000)).toBe(10_000);
  });
});

describe("expectedCashBalance30d / projectedCashBalance30d", () => {
  it("caja esperada = available + por cobrar - pagos futuros", () => {
    expect(expectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
    expect(projectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
  });
});

describe("manualMovementAffectsCurrentCash", () => {
  it("active income afecta", () => {
    expect(manualMovementAffectsCurrentCash(manual({ movementType: "income" }))).toBe(true);
  });
});
