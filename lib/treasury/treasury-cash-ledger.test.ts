import { describe, expect, it } from "vitest";

import { calculateCashPosition } from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

function mov(partial: Partial<ManualCashMovement>): ManualCashMovement {
  return {
    id: partial.id ?? "m1",
    workspaceId: "ws",
    companyId: null,
    accountId: null,
    ledgerType: "cash",
    movementType: partial.movementType ?? "income",
    source: "manual",
    concept: partial.concept ?? "Movimiento",
    category: null,
    amount: partial.amount ?? 1000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: "2026-05-15",
    paymentMethod: null,
    counterparty: null,
    reference: null,
    notes: null,
    affectsCashflow: partial.affectsCashflow ?? true,
    reconciled: false,
    bankReconciliationId: null,
    status: partial.status ?? "active",
    createdBy: null,
    createdAt: "2026-05-15T10:00:00Z",
    updatedAt: "2026-05-15T10:00:00Z",
    rawPayload: null,
    metadata: partial.metadata ?? null,
  };
}

function uyu(positions: ReturnType<typeof calculateCashPosition>) {
  return positions.find((p) => p.currency === "UYU")!;
}
function usd(positions: ReturnType<typeof calculateCashPosition>) {
  return positions.find((p) => p.currency === "USD")!;
}

describe("Caja operativa — 12 escenarios", () => {
  it("1. saldo inicial sin movimientos: availableCash === openingBalance", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [],
      openingBalances: [{ currency: "UYU", amount: 50_000 }],
    });
    expect(uyu(pos).availableCash).toBe(50_000);
    expect(uyu(pos).openingBalance).toBe(50_000);
    expect(uyu(pos).openingConfigured).toBe(true);
    expect(uyu(pos).movementsCount).toBe(0);
  });

  it("2. ingreso confirmado suma a la caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [mov({ movementType: "income", amount: 10_000 })],
      openingBalances: [{ currency: "UYU", amount: 5_000 }],
    });
    expect(uyu(pos).availableCash).toBe(15_000);
    expect(uyu(pos).manualIncome).toBe(10_000);
  });

  it("3. egreso confirmado resta de la caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [mov({ movementType: "expense", amount: 3_000 })],
      openingBalances: [{ currency: "UYU", amount: 10_000 }],
    });
    expect(uyu(pos).availableCash).toBe(7_000);
    expect(uyu(pos).manualExpense).toBe(3_000);
  });

  it("4. movimiento con affectsCashflow=false no afecta caja (programado pendiente)", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 999_999, affectsCashflow: false }),
      ],
      openingBalances: [{ currency: "UYU", amount: 1_000 }],
    });
    expect(uyu(pos).availableCash).toBe(1_000);
    expect(uyu(pos).manualIncome).toBe(0);
  });

  it("5. movimiento active+affectsCashflow=true afecta caja (confirmado)", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 2_500, status: "active", affectsCashflow: true }),
      ],
      openingBalances: [{ currency: "UYU", amount: 10_000 }],
    });
    expect(uyu(pos).availableCash).toBe(7_500);
  });

  it("6. movimiento anulado (status=archived) no afecta caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 5_000, status: "archived" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 2_000 }],
    });
    expect(uyu(pos).availableCash).toBe(2_000);
    expect(uyu(pos).manualIncome).toBe(0);
    expect(uyu(pos).movementsCount).toBe(0);
  });

  it("7. editar un movimiento recalcula la caja correctamente", () => {
    const v1 = calculateCashPosition({
      manualCashMovements: [mov({ id: "x", movementType: "income", amount: 1_000 })],
      openingBalances: [{ currency: "UYU", amount: 0 }],
    });
    expect(uyu(v1).availableCash).toBe(1_000);

    const v2 = calculateCashPosition({
      manualCashMovements: [mov({ id: "x", movementType: "income", amount: 4_500 })],
      openingBalances: [{ currency: "UYU", amount: 0 }],
    });
    expect(uyu(v2).availableCash).toBe(4_500);
  });

  it("8. UYU y USD no se mezclan", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ currencyCode: "UYU", movementType: "income", amount: 10_000 }),
        mov({ id: "u1", currencyCode: "USD", movementType: "expense", amount: 200 }),
      ],
      openingBalances: [
        { currency: "UYU", amount: 5_000 },
        { currency: "USD", amount: 1_000 },
      ],
    });
    expect(uyu(pos).availableCash).toBe(15_000);
    expect(usd(pos).availableCash).toBe(800);
    expect(uyu(pos).manualExpense).toBe(0);
    expect(usd(pos).manualIncome).toBe(0);
  });

  it("9. pago programado marcado como pagado (crea egreso manual activo) afecta caja", () => {
    // markScheduledPaymentAsPaid creates a ManualCashMovement with movementType=expense,
    // affectsCashflow=true, status=active — it must reduce availableCash.
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          movementType: "expense",
          amount: 15_000,
          affectsCashflow: true,
          status: "active",
          concept: "Pago sueldos mayo",
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 50_000 }],
    });
    expect(uyu(pos).availableCash).toBe(35_000);
  });

  it("10. pago programado pendiente (affectsCashflow=false) no afecta caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 15_000, affectsCashflow: false, status: "active" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 50_000 }],
    });
    expect(uyu(pos).availableCash).toBe(50_000);
  });

  it("11. saldo puede ser negativo cuando egresos > saldo inicial", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 20_000 }),
      ],
      openingBalances: [{ currency: "UYU", amount: 5_000 }],
    });
    expect(uyu(pos).availableCash).toBe(-15_000);
  });

  it("12. ajuste positivo o negativo modifica caja correctamente", () => {
    const posPositive = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "adjustment", amount: 500, metadata: { adjustment_direction: "increase" } }),
      ],
      openingBalances: [{ currency: "UYU", amount: 10_000 }],
    });

    const posNegative = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "adjustment", amount: 500, metadata: { adjustment_direction: "decrease" } }),
      ],
      openingBalances: [{ currency: "UYU", amount: 10_000 }],
    });

    expect(uyu(posPositive).adjustments).toBeGreaterThan(0);
    expect(uyu(posNegative).adjustments).toBeLessThan(0);
    expect(uyu(posPositive).availableCash).toBeGreaterThan(10_000);
    expect(uyu(posNegative).availableCash).toBeLessThan(10_000);
  });
});

describe("Caja operativa — opening balance proxy exclusions", () => {
  it("metadata.kind=opening_balance excluye el movimiento del ledger", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          movementType: "income",
          amount: 100_000,
          metadata: { kind: "opening_balance" },
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 50_000 }],
    });
    // The "opening_balance" marker makes the movement invisible to the ledger
    expect(uyu(pos).availableCash).toBe(50_000);
    expect(uyu(pos).manualIncome).toBe(0);
    expect(uyu(pos).movementsCount).toBe(0);
  });

  it("concepto 'Caja inicial' con planned_obligation_id excluye el movimiento del ledger", () => {
    // Scenario: user marked a planned obligation named "Caja inicial" as paid,
    // which created a linked expense movement. That movement must not affect cash.
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          concept: "Caja inicial",
          movementType: "expense",
          amount: 3_247_720,
          metadata: { planned_obligation_id: "b2944bae-b1c4-4954-9c3f-f94a079371c6" },
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 263_033 }],
    });
    // The proxy is excluded; cash = just opening balance
    expect(uyu(pos).availableCash).toBe(263_033);
    expect(uyu(pos).manualExpense).toBe(0);
  });

  it("concepto 'Caja inicial' SIN planned_obligation_id sí afecta caja (movimiento real)", () => {
    // A user manually entered a movement called "Caja inicial" without linking it
    // to any obligation — treat it as a real movement.
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          concept: "Caja inicial",
          movementType: "expense",
          amount: 5_000,
          metadata: null,
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 10_000 }],
    });
    expect(uyu(pos).availableCash).toBe(5_000);
    expect(uyu(pos).manualExpense).toBe(5_000);
  });

  it("el opening balance de la tabla no se duplica con el movimiento proxy", () => {
    // Regression: opening balance 263,033 + proxy expense 3.2M + real expense 10,000
    // availableCash must be 263,033 - 10,000 = 253,033 (proxy excluded)
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          id: "proxy",
          concept: "Caja inicial",
          movementType: "expense",
          amount: 3_247_720,
          metadata: { planned_obligation_id: "some-obligation-id" },
        }),
        mov({
          id: "real",
          concept: "Pago proveedor",
          movementType: "expense",
          amount: 10_000,
          metadata: null,
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 263_033 }],
    });
    expect(uyu(pos).availableCash).toBe(253_033);
    expect(uyu(pos).manualExpense).toBe(10_000);
  });
});
