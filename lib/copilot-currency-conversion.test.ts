import { describe, expect, it } from "vitest";

import {
  consolidateToUsdEquivalent,
  DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD,
  parseDashboardFxRate,
} from "@/lib/copilot-currency-conversion";

describe("parseDashboardFxRate", () => {
  it("acepta enteros", () => {
    expect(parseDashboardFxRate(40)).toBe(40);
    expect(parseDashboardFxRate("40")).toBe(40);
  });

  it("acepta decimales", () => {
    expect(parseDashboardFxRate(40.5)).toBe(40.5);
    expect(parseDashboardFxRate("39.75")).toBe(39.75);
    expect(parseDashboardFxRate("39,75")).toBe(39.75);
  });

  it("rechaza TC inválido", () => {
    expect(parseDashboardFxRate(0)).toBeNull();
    expect(parseDashboardFxRate(-1)).toBeNull();
    expect(parseDashboardFxRate("")).toBeNull();
    expect(parseDashboardFxRate("abc")).toBeNull();
    expect(parseDashboardFxRate(1000)).toBeNull();
  });
});

describe("consolidateToUsdEquivalent", () => {
  it("solo UYU", () => {
    expect(consolidateToUsdEquivalent(0, 400_000, 40)).toBe(10_000);
  });

  it("solo USD", () => {
    expect(consolidateToUsdEquivalent(1_000, 0, 40)).toBe(1_000);
  });

  it("UYU + USD (ejemplo sprint)", () => {
    expect(consolidateToUsdEquivalent(1_000, 400_000, 40)).toBe(11_000);
  });

  it("rate decimal", () => {
    expect(consolidateToUsdEquivalent(0, 100, 39.75)).toBe(2.52);
  });

  it("negativos (NC / ajustes)", () => {
    expect(consolidateToUsdEquivalent(-50, -200, 40)).toBe(-55);
    expect(consolidateToUsdEquivalent(100, -400, 40)).toBe(90);
  });

  it("default rate constant", () => {
    expect(DEFAULT_DASHBOARD_FX_RATE_UYU_PER_USD).toBe(40);
  });
});
