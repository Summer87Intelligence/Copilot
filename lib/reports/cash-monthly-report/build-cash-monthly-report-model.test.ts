import { describe, expect, it } from "vitest";

import type { TreasuryCashOpeningBalanceRow } from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

import { buildCashMonthlyReportModel } from "./build-cash-monthly-report-model";

function mov(overrides: Partial<ManualCashMovement> = {}): ManualCashMovement {
  return {
    id: "m1",
    workspaceId: "w1",
    companyId: null,
    accountId: null,
    ledgerType: "cash",
    movementType: "income",
    source: "cash",
    concept: "Cobro cliente",
    category: null,
    amount: 1000,
    currencyCode: "UYU",
    movementDate: "2026-05-15",
    paymentMethod: null,
    counterparty: null,
    reference: null,
    notes: null,
    affectsCashflow: true,
    reconciled: false,
    bankReconciliationId: null,
    status: "active",
    createdBy: null,
    createdAt: "2026-05-15T10:00:00.000Z",
    updatedAt: "2026-05-15T10:00:00.000Z",
    rawPayload: null,
    metadata: null,
    ...overrides,
  };
}

function bal(
  currencyCode: "UYU" | "USD",
  amount: number,
  effectiveDate = "2026-01-01"
): TreasuryCashOpeningBalanceRow {
  return {
    id: "b1",
    workspaceId: "w1",
    currencyCode,
    amount,
    effectiveDate,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const BASE = {
  openingBalances: [] as TreasuryCashOpeningBalanceRow[],
  year: 2026,
  month: 5,
  currency: "UYU" as const,
  generatedAt: new Date("2026-06-01T10:00:00.000Z"),
};

describe("buildCashMonthlyReportModel", () => {
  it("filtra por mes correcto", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      movements: [
        mov({ id: "m1", movementDate: "2026-04-30", amount: 100 }),
        mov({ id: "m2", movementDate: "2026-05-01", amount: 200 }),
        mov({ id: "m3", movementDate: "2026-05-31", amount: 300 }),
        mov({ id: "m4", movementDate: "2026-06-01", amount: 400 }),
      ],
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.date).toBe("2026-05-01");
    expect(result.rows[1]?.date).toBe("2026-05-31");
  });

  it("filtra por moneda", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      currency: "UYU",
      movements: [
        mov({ id: "m1", currencyCode: "UYU", amount: 500 }),
        mov({ id: "m2", currencyCode: "USD", amount: 9999 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.income).toBe(500);
  });

  it("excluye movimientos inactivos", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      movements: [
        mov({ id: "m1", status: "active", amount: 100 }),
        mov({ id: "m2", status: "archived", amount: 9999 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.income).toBe(100);
  });

  it("excluye movimientos sin impacto en cashflow", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      movements: [
        mov({ id: "m1", affectsCashflow: true, amount: 200 }),
        mov({ id: "m2", affectsCashflow: false, amount: 9999 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.income).toBe(200);
  });

  it("excluye transferencias", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      movements: [
        mov({ id: "m1", movementType: "income", amount: 300 }),
        mov({ id: "m2", movementType: "transfer", amount: 9999 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.income).toBe(300);
  });

  it("ordena por fecha ASC", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      movements: [
        mov({ id: "m1", movementDate: "2026-05-20", amount: 20 }),
        mov({ id: "m2", movementDate: "2026-05-05", amount: 5 }),
        mov({ id: "m3", movementDate: "2026-05-15", amount: 15 }),
      ],
    });
    expect(result.rows[0]?.date).toBe("2026-05-05");
    expect(result.rows[1]?.date).toBe("2026-05-15");
    expect(result.rows[2]?.date).toBe("2026-05-20");
  });

  it("calcula saldo acumulado con ingresos y egresos", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      openingBalances: [bal("UYU", 5000)],
      movements: [
        mov({ id: "m1", movementDate: "2026-05-10", movementType: "income", amount: 3000 }),
        mov({ id: "m2", movementDate: "2026-05-15", movementType: "expense", amount: 1000 }),
        mov({ id: "m3", movementDate: "2026-05-20", movementType: "income", amount: 500 }),
      ],
    });
    expect(result.rows[0]?.income).toBe(3000);
    expect(result.rows[0]?.expense).toBe(0);
    expect(result.rows[0]?.runningBalance).toBe(8000);
    expect(result.rows[1]?.income).toBe(0);
    expect(result.rows[1]?.expense).toBe(1000);
    expect(result.rows[1]?.runningBalance).toBe(7000);
    expect(result.rows[2]?.runningBalance).toBe(7500);
    expect(result.totals.totalIncome).toBe(3500);
    expect(result.totals.totalExpense).toBe(1000);
    expect(result.totals.closingBalance).toBe(7500);
  });

  it("usa saldo inicial del opening balance", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      openingBalances: [bal("UYU", 10000), bal("USD", 500)],
      movements: [],
    });
    expect(result.openingBalance).toBe(10000);
    expect(result.totals.closingBalance).toBe(10000);
  });

  it("saldo inicial 0 sin opening balance registrado", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      openingBalances: [],
      movements: [],
    });
    expect(result.openingBalance).toBe(0);
    expect(result.totals.closingBalance).toBe(0);
  });

  it("empty state con totales en 0 y period correctos", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      year: 2026,
      month: 5,
      movements: [],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.count).toBe(0);
    expect(result.totals.totalIncome).toBe(0);
    expect(result.totals.totalExpense).toBe(0);
    expect(result.period.label).toBe("Mayo 2026");
    expect(result.period.from).toBe("2026-05-01");
    expect(result.period.to).toBe("2026-05-31");
  });

  it("typeLabel correcto para income y expense", () => {
    const result = buildCashMonthlyReportModel({
      ...BASE,
      movements: [
        mov({ id: "m1", movementType: "income" }),
        mov({ id: "m2", movementType: "expense" }),
      ],
    });
    expect(result.rows[0]?.typeLabel).toBe("Ingreso");
    expect(result.rows[1]?.typeLabel).toBe("Egreso");
  });
});
