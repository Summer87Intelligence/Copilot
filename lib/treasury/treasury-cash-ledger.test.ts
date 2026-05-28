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
    movementDate: partial.movementDate ?? "2026-05-15",
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

describe("Caja operativa — saldo actual cargado y baseline date", () => {
  it("13. saldo actual cargado sin movimientos: caja = saldo cargado", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [],
      openingBalances: [{ currency: "UYU", amount: 100_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(100_000);
    expect(uyu(pos).openingBalance).toBe(100_000);
    expect(uyu(pos).baselineDate).toBe("2026-05-01");
  });

  it("14. movimiento anterior al corte NO afecta caja (ya está reflejado en el saldo cargado)", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 5_000, movementDate: "2026-04-30" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 50_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(50_000);
    expect(uyu(pos).manualIncome).toBe(0);
    expect(uyu(pos).movementsCount).toBe(0);
  });

  it("15. movimiento posterior al corte de ingreso suma a la caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 8_000, movementDate: "2026-05-02" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 50_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(58_000);
    expect(uyu(pos).manualIncome).toBe(8_000);
  });

  it("16. movimiento posterior al corte de egreso resta de la caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 3_000, movementDate: "2026-05-15" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 50_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(47_000);
    expect(uyu(pos).manualExpense).toBe(3_000);
  });

  it("17. movimiento exactamente en la fecha del corte SÍ cuenta (>= baseline)", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 2_000, movementDate: "2026-05-01" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 10_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(12_000);
    expect(uyu(pos).manualIncome).toBe(2_000);
  });

  it("18. sin baseline configurado, todos los movimientos cuentan", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 1_000, movementDate: "2020-01-01" }),
        mov({ id: "m2", movementType: "expense", amount: 400, movementDate: "2024-12-31" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 5_000 }],
    });
    expect(uyu(pos).baselineDate).toBeNull();
    expect(uyu(pos).availableCash).toBe(5_600);
    expect(uyu(pos).movementsCount).toBe(2);
  });

  it("19. pago programado pendiente (affectsCashflow=false) no afecta caja aunque sea posterior al corte", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 10_000, affectsCashflow: false, movementDate: "2026-05-10" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 30_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(30_000);
    expect(uyu(pos).manualExpense).toBe(0);
  });

  it("20. pago programado marcado como pagado (affectsCashflow=true) posterior al corte afecta caja", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          movementType: "expense",
          amount: 10_000,
          affectsCashflow: true,
          status: "active",
          movementDate: "2026-05-10",
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 30_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(20_000);
    expect(uyu(pos).manualExpense).toBe(10_000);
  });

  it("21. UYU y USD tienen baselines independientes", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ id: "u1", currencyCode: "UYU", movementType: "income", amount: 5_000, movementDate: "2026-04-20" }),
        mov({ id: "u2", currencyCode: "UYU", movementType: "income", amount: 2_000, movementDate: "2026-05-05" }),
        mov({ id: "d1", currencyCode: "USD", movementType: "income", amount: 300, movementDate: "2026-04-30" }),
        mov({ id: "d2", currencyCode: "USD", movementType: "expense", amount: 100, movementDate: "2026-05-10" }),
      ],
      openingBalances: [
        { currency: "UYU", amount: 20_000, effectiveDate: "2026-05-01" },
        { currency: "USD", amount: 1_000, effectiveDate: "2026-05-01" },
      ],
    });
    expect(uyu(pos).availableCash).toBe(22_000);
    expect(usd(pos).availableCash).toBe(900);
  });

  it("22. opening_balance proxy (metadata.kind) no cuenta en ningún escenario de baseline", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({
          movementType: "income",
          amount: 50_000,
          metadata: { kind: "opening_balance" },
          movementDate: "2026-05-10",
        }),
      ],
      openingBalances: [{ currency: "UYU", amount: 30_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(30_000);
    expect(uyu(pos).manualIncome).toBe(0);
  });

  it("23. movimiento archivado (status=archived) no afecta caja aunque sea posterior al corte", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 7_000, status: "archived", movementDate: "2026-05-15" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 10_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(10_000);
    expect(uyu(pos).movementsCount).toBe(0);
  });

  it("24. mix: anterior excluido + posterior contado → caja correcta", () => {
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ id: "pre", movementType: "income", amount: 99_000, movementDate: "2026-04-15" }),
        mov({ id: "post1", movementType: "income", amount: 5_000, movementDate: "2026-05-10" }),
        mov({ id: "post2", movementType: "expense", amount: 2_000, movementDate: "2026-05-20" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 100_000, effectiveDate: "2026-05-01" }],
    });
    expect(uyu(pos).availableCash).toBe(103_000);
    expect(uyu(pos).manualIncome).toBe(5_000);
    expect(uyu(pos).manualExpense).toBe(2_000);
    expect(uyu(pos).movementsCount).toBe(2);
  });
});
