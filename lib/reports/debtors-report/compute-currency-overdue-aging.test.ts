import { describe, it, expect } from "vitest";

import {
  computeCurrencyOverdueAging,
  type OverdueAgingInvoiceInput,
} from "@/lib/reports/debtors-report/compute-currency-overdue-aging";

const AT = new Date("2026-07-16T00:00:00.000Z");

function inv(overrides: Partial<OverdueAgingInvoiceInput> = {}): OverdueAgingInvoiceInput {
  return {
    balance_amount: 1000,
    due_date: "2026-06-01",
    status: "open",
    currency_code: "UYU",
    zeta_metadata: null,
    ...overrides,
  };
}

describe("computeCurrencyOverdueAging void set (FASE D)", () => {
  it("cuenta una factura abierta atrasada", () => {
    const r = computeCurrencyOverdueAging([inv()], "UYU", AT);
    expect(r.oldestDueDate).toBe("2026-06-01");
    expect(r.overdueDays).toBe(45);
  });

  it("excluye anulados con todas las variantes canónicas (no solo cancelled/void)", () => {
    for (const status of ["anulado", "anulada", "voided", "canceled", "cancelled", "void", "annulled"]) {
      const r = computeCurrencyOverdueAging([inv({ status })], "UYU", AT);
      expect(r.oldestDueDate, `status=${status}`).toBeNull();
      expect(r.overdueDays, `status=${status}`).toBeNull();
    }
  });

  it("excluye pagados y saldo <= 0", () => {
    expect(computeCurrencyOverdueAging([inv({ status: "paid" })], "UYU", AT).oldestDueDate).toBeNull();
    expect(computeCurrencyOverdueAging([inv({ balance_amount: 0 })], "UYU", AT).oldestDueDate).toBeNull();
  });
});
