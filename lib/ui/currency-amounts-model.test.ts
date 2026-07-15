import { describe, expect, it } from "vitest";
import {
  buildSeparatedCurrencyValues,
  hasAnyAmount,
} from "@/lib/ui/currency-amounts-model";

const fmt = (n: number, c: "UYU" | "USD") => (c === "USD" ? `U$S ${n}` : `$ ${n}`);

describe("buildSeparatedCurrencyValues", () => {
  it("UYU only → single UYU line", () => {
    expect(buildSeparatedCurrencyValues(100, 0, fmt)).toEqual([
      { currency: "UYU", formatted: "$ 100" },
    ]);
  });

  it("USD only → single USD line", () => {
    expect(buildSeparatedCurrencyValues(0, 50, fmt)).toEqual([
      { currency: "USD", formatted: "U$S 50" },
    ]);
  });

  it("UYU + USD → two lines, UYU first, never joined", () => {
    const v = buildSeparatedCurrencyValues(100, 50, fmt);
    expect(v.map((l) => l.currency)).toEqual(["UYU", "USD"]);
    expect(v.every((l) => !l.formatted.includes("·"))).toBe(true);
  });

  it("no amounts → empty array", () => {
    expect(buildSeparatedCurrencyValues(0, 0, fmt)).toEqual([]);
  });
});

describe("hasAnyAmount", () => {
  it("true when either currency is positive", () => {
    expect(hasAnyAmount(1, 0)).toBe(true);
    expect(hasAnyAmount(0, 1)).toBe(true);
    expect(hasAnyAmount(0, 0)).toBe(false);
  });
});
