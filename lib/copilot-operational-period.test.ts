import { describe, expect, it } from "vitest";

import {
  assertOperationalDate,
  COPILOT_OPERATIONAL_START_DATE,
  filterByCopilotOperationalPeriod,
  getCopilotOperationalEndDate,
  getCopilotOperationalStartDate,
  isPreOperationalPeriod,
  isWithinCopilotOperationalPeriod,
} from "./copilot-operational-period";

describe("COPILOT_OPERATIONAL_START_DATE", () => {
  it("is 2026-01-01", () => {
    expect(COPILOT_OPERATIONAL_START_DATE).toBe("2026-01-01");
  });
});

describe("getCopilotOperationalStartDate", () => {
  it("returns COPILOT_OPERATIONAL_START_DATE", () => {
    expect(getCopilotOperationalStartDate()).toBe("2026-01-01");
  });
});

describe("getCopilotOperationalEndDate", () => {
  it("returns a valid YYYY-MM-DD date string", () => {
    const d = getCopilotOperationalEndDate();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(d)).toBe(true);
  });

  it("returns a date >= 2026-01-01 (test runs after start of 2026)", () => {
    const d = getCopilotOperationalEndDate();
    expect(d >= "2026-01-01").toBe(true);
  });
});

describe("isWithinCopilotOperationalPeriod", () => {
  it("returns true for 2026-01-01 (boundary)", () => {
    expect(isWithinCopilotOperationalPeriod("2026-01-01")).toBe(true);
  });

  it("returns true for dates in 2026+", () => {
    expect(isWithinCopilotOperationalPeriod("2026-05-09")).toBe(true);
    expect(isWithinCopilotOperationalPeriod("2027-12-31")).toBe(true);
  });

  it("returns false for 2025-12-31 (day before boundary)", () => {
    expect(isWithinCopilotOperationalPeriod("2025-12-31")).toBe(false);
  });

  it("returns false for pre-2025 dates", () => {
    expect(isWithinCopilotOperationalPeriod("2024-01-01")).toBe(false);
    expect(isWithinCopilotOperationalPeriod("2020-06-15")).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isWithinCopilotOperationalPeriod(null)).toBe(false);
    expect(isWithinCopilotOperationalPeriod(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isWithinCopilotOperationalPeriod("")).toBe(false);
  });

  it("returns false for invalid formats", () => {
    expect(isWithinCopilotOperationalPeriod("20260101")).toBe(false);
    expect(isWithinCopilotOperationalPeriod("2026/01/01")).toBe(false);
    expect(isWithinCopilotOperationalPeriod("not-a-date")).toBe(false);
  });

  it("uses only the first 10 chars (ISO datetime)", () => {
    expect(isWithinCopilotOperationalPeriod("2026-03-15T12:00:00.000Z")).toBe(true);
    expect(isWithinCopilotOperationalPeriod("2025-12-31T23:59:59.999Z")).toBe(false);
  });
});

describe("isPreOperationalPeriod", () => {
  it("returns true for dates before 2026-01-01", () => {
    expect(isPreOperationalPeriod("2025-12-31")).toBe(true);
    expect(isPreOperationalPeriod("2020-01-01")).toBe(true);
  });

  it("returns false for 2026-01-01 and later", () => {
    expect(isPreOperationalPeriod("2026-01-01")).toBe(false);
    expect(isPreOperationalPeriod("2026-05-09")).toBe(false);
  });

  it("returns false for null/invalid", () => {
    expect(isPreOperationalPeriod(null)).toBe(false);
    expect(isPreOperationalPeriod("bad")).toBe(false);
  });
});

describe("filterByCopilotOperationalPeriod", () => {
  const items = [
    { id: 1, issue_date: "2025-12-01" },
    { id: 2, issue_date: "2026-01-01" },
    { id: 3, issue_date: "2026-05-09" },
    { id: 4, issue_date: null },
    { id: 5, issue_date: undefined },
    { id: 6, issue_date: "bad" },
  ];

  it("keeps only items within operational period", () => {
    const result = filterByCopilotOperationalPeriod(items);
    expect(result.map((i) => i.id)).toEqual([2, 3]);
  });

  it("returns empty array if no items qualify", () => {
    const old = [{ issue_date: "2025-01-01" }, { issue_date: null }];
    expect(filterByCopilotOperationalPeriod(old)).toHaveLength(0);
  });

  it("does not mutate the original array", () => {
    const original = [{ issue_date: "2026-01-01" }];
    filterByCopilotOperationalPeriod(original);
    expect(original).toHaveLength(1);
  });
});

describe("assertOperationalDate", () => {
  it("no lanza para fecha 2026-01-01 (boundary)", () => {
    expect(() => assertOperationalDate("2026-01-01")).not.toThrow();
  });

  it("no lanza para fecha dentro del período operativo", () => {
    expect(() => assertOperationalDate("2026-05-09")).not.toThrow();
  });

  it("lanza para fecha 2025-12-31 (pre-operacional)", () => {
    expect(() => assertOperationalDate("2025-12-31")).toThrow(/pre-operacional/i);
  });

  it("lanza para fecha pre-2025", () => {
    expect(() => assertOperationalDate("2024-01-01")).toThrow(/pre-operacional/i);
  });

  it("lanza para null", () => {
    expect(() => assertOperationalDate(null)).toThrow(/pre-operacional/i);
  });

  it("lanza para fecha inválida", () => {
    expect(() => assertOperationalDate("bad-date")).toThrow(/pre-operacional/i);
  });

  it("incluye el label en el mensaje cuando se provee", () => {
    expect(() => assertOperationalDate("2025-01-01", "issue_date")).toThrow(/issue_date/);
  });

  it("incluye la fecha en el mensaje", () => {
    expect(() => assertOperationalDate("2025-06-15")).toThrow(/2025-06-15/);
  });
});
