import { describe, expect, it } from "vitest";

import {
  DEFAULT_CURRENCY_DISPLAY_MODE,
  DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD,
  convertToUsdEquivalent,
  formatDisplayAmounts,
  formatUsdEquivalent,
  normalizeFxRate,
  readDisplayFxRateFromStorage,
  readDisplayModeFromStorage,
  writeDisplayFxRateToStorage,
  writeDisplayModeToStorage,
} from "@/lib/currency-display-mode";

describe("DEFAULT values", () => {
  it("default mode is native", () => {
    expect(DEFAULT_CURRENCY_DISPLAY_MODE).toBe("native");
  });

  it("default fx rate is 40", () => {
    expect(DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD).toBe(40);
  });
});

describe("normalizeFxRate", () => {
  it("returns the value for a valid rate", () => {
    expect(normalizeFxRate(43.5)).toBe(43.5);
  });

  it("falls back to default for 0", () => {
    expect(normalizeFxRate(0)).toBe(DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD);
  });

  it("falls back to default for negative", () => {
    expect(normalizeFxRate(-10)).toBe(DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD);
  });

  it("falls back to default for >= 1000", () => {
    expect(normalizeFxRate(1000)).toBe(DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD);
  });

  it("falls back to default for NaN string", () => {
    expect(normalizeFxRate("abc")).toBe(DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD);
  });

  it("parses a numeric string with comma", () => {
    expect(normalizeFxRate("43,5")).toBe(43.5);
  });
});

describe("convertToUsdEquivalent", () => {
  it("UYU 4000 + USD 100 at TC 40 = USD 200", () => {
    const result = convertToUsdEquivalent({ uyu: 4_000, usd: 100 }, 40);
    expect(result).toBe(200);
  });

  it("USD only — UYU 0", () => {
    expect(convertToUsdEquivalent({ uyu: 0, usd: 500 }, 40)).toBe(500);
  });

  it("UYU only — USD 0", () => {
    expect(convertToUsdEquivalent({ uyu: 8_000, usd: 0 }, 40)).toBe(200);
  });

  it("invalid fxRate falls back to 40", () => {
    const withDefault = convertToUsdEquivalent({ uyu: 4_000, usd: 100 }, 40);
    const withInvalid = convertToUsdEquivalent({ uyu: 4_000, usd: 100 }, -1);
    expect(withInvalid).toBe(withDefault);
  });
});

describe("formatUsdEquivalent", () => {
  it("prefixes with ~USD", () => {
    expect(formatUsdEquivalent(200)).toContain("~USD");
    expect(formatUsdEquivalent(200)).toContain("200");
  });
});

describe("formatDisplayAmounts", () => {
  it("native mode returns kind=native — no conversion", () => {
    const result = formatDisplayAmounts({ uyu: 4_000, usd: 100, mode: "native", fxRate: 40 });
    expect(result.kind).toBe("native");
  });

  it("usd_equivalent mode — UYU 4000 + USD 100 at TC 40 = USD 200", () => {
    const result = formatDisplayAmounts({ uyu: 4_000, usd: 100, mode: "usd_equivalent", fxRate: 40 });
    expect(result.kind).toBe("usd_equivalent");
    if (result.kind === "usd_equivalent") {
      expect(result.total).toBe(200);
      expect(result.fxRate).toBe(40);
      expect(result.label).toContain("~USD");
    }
  });

  it("usd_equivalent mode — USD only, UYU 0", () => {
    const result = formatDisplayAmounts({ uyu: 0, usd: 500, mode: "usd_equivalent", fxRate: 40 });
    expect(result.kind).toBe("usd_equivalent");
    if (result.kind === "usd_equivalent") expect(result.total).toBe(500);
  });

  it("usd_equivalent mode — invalid fxRate falls back to 40", () => {
    const withDefault = formatDisplayAmounts({ uyu: 4_000, usd: 100, mode: "usd_equivalent", fxRate: 40 });
    const withInvalid = formatDisplayAmounts({ uyu: 4_000, usd: 100, mode: "usd_equivalent", fxRate: 0 });
    expect(withInvalid.kind).toBe("usd_equivalent");
    if (withDefault.kind === "usd_equivalent" && withInvalid.kind === "usd_equivalent") {
      expect(withInvalid.total).toBe(withDefault.total);
    }
  });
});

describe("storage helpers — SSR-safe (no window)", () => {
  it("readDisplayModeFromStorage returns default when window is undefined", () => {
    expect(readDisplayModeFromStorage()).toBe(DEFAULT_CURRENCY_DISPLAY_MODE);
  });

  it("readDisplayFxRateFromStorage returns 40 when window is undefined", () => {
    expect(readDisplayFxRateFromStorage()).toBe(DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD);
  });

  it("writeDisplayModeToStorage returns false when window is undefined", () => {
    expect(writeDisplayModeToStorage("usd_equivalent")).toBe(false);
  });

  it("writeDisplayFxRateToStorage returns false when window is undefined", () => {
    expect(writeDisplayFxRateToStorage(43)).toBe(false);
  });
});
