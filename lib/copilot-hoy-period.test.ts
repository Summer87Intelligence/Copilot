import { describe, expect, it } from "vitest";

import {
  defaultHoyPeriodRange,
  firstDayOfMonthYmd,
  formatHoyPeriodLabel,
  last30DaysPeriodRange,
  lastDayOfMonthYmd,
} from "@/lib/copilot-hoy-period";

describe("copilot-hoy-period", () => {
  it("default = inicio del mes actual hasta hoy", () => {
    expect(defaultHoyPeriodRange("2026-05-21")).toEqual({
      from: "2026-05-01",
      to: "2026-05-21",
    });
  });

  it("firstDayOfMonthYmd", () => {
    expect(firstDayOfMonthYmd("2026-05-21")).toBe("2026-05-01");
  });

  it("formatHoyPeriodLabel", () => {
    expect(formatHoyPeriodLabel({ from: "2026-05-01", to: "2026-05-21" })).toBe(
      "01/05/2026 - 21/05/2026"
    );
  });

  it("last30DaysPeriodRange cubre 30 días", () => {
    const r = last30DaysPeriodRange("2026-05-21");
    expect(r.to).toBe("2026-05-21");
    expect(r.from).toBe("2026-04-22");
  });

  // HOY-END-OF-MONTH-AUDIT-001
  describe("lastDayOfMonthYmd", () => {
    it("junio tiene 30 días — horizonte fin de mes desde el 21/06", () => {
      expect(lastDayOfMonthYmd("2026-06-21")).toBe("2026-06-30");
    });

    it("pago 28/06 queda dentro del horizonte fin de mes", () => {
      const horizon = lastDayOfMonthYmd("2026-06-21");
      expect("2026-06-28" <= horizon).toBe(true);
    });

    it("pago 03/07 queda fuera del horizonte fin de mes de junio", () => {
      const horizon = lastDayOfMonthYmd("2026-06-21");
      expect("2026-07-03" <= horizon).toBe(false);
    });

    it("febrero año bisiesto", () => {
      expect(lastDayOfMonthYmd("2024-02-15")).toBe("2024-02-29");
    });

    it("febrero año no bisiesto", () => {
      expect(lastDayOfMonthYmd("2026-02-15")).toBe("2026-02-28");
    });

    it("diciembre = 31", () => {
      expect(lastDayOfMonthYmd("2026-12-01")).toBe("2026-12-31");
    });
  });
});
