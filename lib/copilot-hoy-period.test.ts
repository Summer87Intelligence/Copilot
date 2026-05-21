import { describe, expect, it } from "vitest";

import {
  defaultHoyPeriodRange,
  firstDayOfMonthYmd,
  formatHoyPeriodLabel,
  last30DaysPeriodRange,
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
});
