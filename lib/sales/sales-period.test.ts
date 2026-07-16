import { describe, it, expect } from "vitest";

import { resolvePeriodRange, resolveComparisonRange } from "@/lib/sales/sales-period";

describe("resolvePeriodRange", () => {
  it("this_month: day 1 to today", () => {
    expect(resolvePeriodRange("this_month", "2026-07-16")).toEqual({ from: "2026-07-01", to: "2026-07-16" });
  });
  it("last_month: full previous calendar month", () => {
    expect(resolvePeriodRange("last_month", "2026-07-16")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });
  it("last_month across year boundary", () => {
    expect(resolvePeriodRange("last_month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("last_3_months from first of month 2 back", () => {
    expect(resolvePeriodRange("last_3_months", "2026-07-16")).toEqual({ from: "2026-05-01", to: "2026-07-16" });
  });
  it("year: Jan 1 to today", () => {
    expect(resolvePeriodRange("year", "2026-07-16")).toEqual({ from: "2026-01-01", to: "2026-07-16" });
  });
  it("custom: clamps reversed ranges", () => {
    expect(resolvePeriodRange("custom", "2026-07-16", { from: "2026-05-10", to: "2026-03-01" })).toEqual({ from: "2026-03-01", to: "2026-05-10" });
  });
});

describe("resolveComparisonRange", () => {
  it("previous_period: equal-length window immediately before", () => {
    const cur = { from: "2026-07-01", to: "2026-07-16" };
    expect(resolveComparisonRange("previous_period", cur)).toEqual({ from: "2026-06-15", to: "2026-06-30" });
  });
  it("previous_month: full prior month", () => {
    const cur = { from: "2026-07-01", to: "2026-07-16" };
    expect(resolveComparisonRange("previous_month", cur)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });
  it("same_elapsed_days: prior month day 1 to same day-of-month", () => {
    const cur = { from: "2026-07-01", to: "2026-07-16" };
    expect(resolveComparisonRange("same_elapsed_days", cur)).toEqual({ from: "2026-06-01", to: "2026-06-16" });
  });
  it("same_elapsed_days clamps when prior month is shorter", () => {
    const cur = { from: "2026-03-01", to: "2026-03-31" };
    expect(resolveComparisonRange("same_elapsed_days", cur)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
