import { describe, expect, it } from "vitest";

import {
  buildFinancialPeriodContext,
  isCurrentMonthPartialAt,
  monthLabelFromYm,
  prevYm,
} from "@/lib/copilot-financial-period-context";

describe("copilot-financial-period-context", () => {
  it("01/06/2026 => current month partial true", () => {
    expect(isCurrentMonthPartialAt("2026-06-01")).toBe(true);
    const ctx = buildFinancialPeriodContext("2026-06-01");
    expect(ctx.isCurrentMonthPartial).toBe(true);
  });

  it("lastClosedMonth = Mayo 2026", () => {
    const ctx = buildFinancialPeriodContext("2026-06-01");
    expect(ctx.lastClosedMonthYm).toBe("2026-05");
    expect(ctx.lastClosedMonthLabel).toBe("Mayo 2026");
  });

  it("previousClosedMonth = Abril 2026", () => {
    const ctx = buildFinancialPeriodContext("2026-06-01");
    expect(ctx.previousClosedMonthYm).toBe("2026-04");
    expect(ctx.previousClosedMonthLabel).toBe("Abril 2026");
  });

  it("current period = 01/06/2026–01/06/2026", () => {
    const ctx = buildFinancialPeriodContext("2026-06-01");
    expect(ctx.currentPeriod.from).toBe("2026-06-01");
    expect(ctx.currentPeriod.to).toBe("2026-06-01");
    expect(ctx.currentPeriod.label).toBe("01/06/2026 - 01/06/2026");
  });

  it("no usa 2025 en etiquetas de tendencia", () => {
    const ctx = buildFinancialPeriodContext("2026-06-01");
    expect(ctx.trendsDataRangeLabel).not.toMatch(/2025/);
    expect(ctx.trendsDataRangeLabel).toMatch(/2026/);
  });

  it("labels en español", () => {
    expect(monthLabelFromYm("2026-05")).toBe("Mayo 2026");
    expect(prevYm("2026-06")).toBe("2026-05");
  });

  it("mes completo al último día del mes", () => {
    const ctx = buildFinancialPeriodContext("2026-05-31");
    expect(ctx.isCurrentMonthPartial).toBe(false);
    expect(ctx.lastClosedMonthYm).toBe("2026-05");
  });

  it("partialMonthCallout cuando el mes está en curso", () => {
    const ctx = buildFinancialPeriodContext("2026-06-01");
    expect(ctx.partialMonthCallout).toMatch(/en curso/i);
    expect(ctx.partialMonthCallout).toMatch(/Mayo 2026/);
  });
});
