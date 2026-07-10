import { describe, expect, it } from "vitest";

import {
  classifyOperatingDelay,
  formatOperatingDelayBucket,
  getDaysLate,
  getOperatingDelayBucket,
  getOperatingDelayLabel,
} from "@/lib/copilot/operating-aging";

const REF = "2026-07-10";

describe("operating-aging", () => {
  it("getDaysLate: fecha futura es negativa", () => {
    expect(getDaysLate("2026-07-15", REF)).toBe(-5);
    expect(getDaysLate("2026-07-10", REF)).toBe(0);
    expect(getDaysLate("2026-07-09", REF)).toBe(1);
  });

  it("buckets operativos por días de atraso", () => {
    expect(getOperatingDelayBucket(0)).toBe("on_time");
    expect(getOperatingDelayBucket(-3)).toBe("on_time");
    expect(getOperatingDelayBucket(1)).toBe("late_1_7");
    expect(getOperatingDelayBucket(7)).toBe("late_1_7");
    expect(getOperatingDelayBucket(8)).toBe("late_8_14");
    expect(getOperatingDelayBucket(14)).toBe("late_8_14");
    expect(getOperatingDelayBucket(15)).toBe("late_15_30");
    expect(getOperatingDelayBucket(30)).toBe("late_15_30");
    expect(getOperatingDelayBucket(31)).toBe("late_30_plus");
  });

  it("labels no usan vencido", () => {
    for (const days of [0, 1, 7, 8, 14, 15, 30, 31]) {
      const label = getOperatingDelayLabel(days);
      expect(label.toLowerCase()).not.toMatch(/vencid/);
      expect(label).toMatch(/d[ií]as de atraso|Al d[ií]a/);
    }
  });

  it("formatOperatingDelayBucket devuelve texto canónico", () => {
    expect(formatOperatingDelayBucket("on_time")).toBe("Al día");
    expect(formatOperatingDelayBucket("late_1_7")).toBe("1–7 días de atraso");
    expect(formatOperatingDelayBucket("late_30_plus")).toBe("+30 días de atraso");
  });

  it("classifyOperatingDelay desde due_date", () => {
    expect(classifyOperatingDelay("2026-07-10", REF).bucket).toBe("on_time");
    expect(classifyOperatingDelay("2026-07-03", REF).bucket).toBe("late_1_7");
    expect(classifyOperatingDelay("2026-06-26", REF).bucket).toBe("late_8_14");
    expect(classifyOperatingDelay("2026-06-10", REF).bucket).toBe("late_15_30");
    expect(classifyOperatingDelay("2026-05-01", REF).bucket).toBe("late_30_plus");
  });
});
