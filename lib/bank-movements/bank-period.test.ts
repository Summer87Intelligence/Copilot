import { describe, expect, it } from "vitest";

import {
  bankPeriodSelectValue,
  defaultBankPeriodState,
  listBankMonthOptions,
  movementDateInInclusiveRange,
  parseBankPeriodSelectValue,
  resolveBankPeriodRange,
  type BankPeriodState,
} from "@/lib/bank-movements/bank-period";

const TODAY = "2026-07-23";

describe("bank-period", () => {
  it("defaultBankPeriodState es este mes", () => {
    expect(defaultBankPeriodState()).toEqual({ kind: "preset", preset: "this_month" });
  });

  it("resolveBankPeriodRange para preset last_7_days", () => {
    const range = resolveBankPeriodRange({ kind: "preset", preset: "last_7_days" }, TODAY);
    expect(range.from).toBe("2026-07-17");
    expect(range.to).toBe(TODAY);
    expect(range.label).toBe("Últimos 7 días");
  });

  it("resolveBankPeriodRange para mes calendario", () => {
    const range = resolveBankPeriodRange({ kind: "month", year: 2026, month: 6 }, TODAY);
    expect(range.from).toBe("2026-06-01");
    expect(range.to).toBe("2026-06-30");
    expect(range.label).toBe("Junio 2026");
  });

  it("resolveBankPeriodRange custom ordena from/to", () => {
    const range = resolveBankPeriodRange(
      { kind: "custom", from: "2026-07-20", to: "2026-07-01" },
      TODAY
    );
    expect(range.from).toBe("2026-07-01");
    expect(range.to).toBe("2026-07-20");
  });

  it("movementDateInInclusiveRange es inclusivo en YMD", () => {
    expect(movementDateInInclusiveRange("2026-07-01T00:00:00Z", "2026-07-01", "2026-07-15")).toBe(true);
    expect(movementDateInInclusiveRange("2026-07-15", "2026-07-01", "2026-07-15")).toBe(true);
    expect(movementDateInInclusiveRange("2026-06-30", "2026-07-01", "2026-07-15")).toBe(false);
    expect(movementDateInInclusiveRange("invalid", "2026-07-01", "2026-07-15")).toBe(false);
  });

  it("bankPeriodSelectValue y parseBankPeriodSelectValue round-trip", () => {
    const cases: BankPeriodState[] = [
      { kind: "preset", preset: "last_month" },
      { kind: "month", year: 2026, month: 3 },
    ];
    for (const state of cases) {
      const value = bankPeriodSelectValue(state);
      expect(parseBankPeriodSelectValue(value)).toEqual(state);
    }
    expect(parseBankPeriodSelectValue("custom")).toBeNull();
  });

  it("listBankMonthOptions incluye mes actual y anteriores", () => {
    const options = listBankMonthOptions(TODAY);
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toMatchObject({ year: 2026, month: 7, label: "Julio 2026" });
    expect(options.some((o) => o.month === 1 && o.year === 2026)).toBe(true);
  });
});
