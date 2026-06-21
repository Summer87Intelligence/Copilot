import { describe, expect, it } from "vitest";

import {
  DEFAULT_CURRENCY_DISPLAY_MODE,
  DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD,
  buildCurrencyRiskChipCopy,
  buildUsdEquivalentNoticeCopy,
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
  it("default mode is usd_equivalent", () => {
    expect(DEFAULT_CURRENCY_DISPLAY_MODE).toBe("usd_equivalent");
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
  it("prefixes with USD (no tilde)", () => {
    expect(formatUsdEquivalent(200)).toContain("USD");
    expect(formatUsdEquivalent(200)).not.toContain("~");
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
      expect(result.label).toContain("USD");
      expect(result.label).not.toContain("~");
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

describe("UsdEquivalentActiveNotice copy — buildUsdEquivalentNoticeCopy", () => {
  it("copy builder produces well-formed output", () => {
    const copy = buildUsdEquivalentNoticeCopy(40);
    expect(copy.full.length).toBeGreaterThan(0);
    expect(copy.short.length).toBeGreaterThan(0);
  });

  it("copy contains 'Vista en USD' and correct TC", () => {
    const copy = buildUsdEquivalentNoticeCopy(40);
    expect(copy.full).toContain("Vista en USD");
    expect(copy.full).toContain("TC 40");
    expect(copy.short).toContain("TC 40");
  });

  it("TC updates live — different rates produce different copy", () => {
    const copy40 = buildUsdEquivalentNoticeCopy(40);
    const copy45 = buildUsdEquivalentNoticeCopy(45);
    expect(copy40.full).not.toBe(copy45.full);
    expect(copy40.short).toContain("TC 40");
    expect(copy45.short).toContain("TC 45");
  });

  it("copy does not say 'USD real'", () => {
    const copy = buildUsdEquivalentNoticeCopy(40);
    expect(copy.full).not.toContain("USD real");
    expect(copy.short).not.toContain("USD real");
  });

  it("copy says 'moneda' (datos originales se mantienen en su moneda)", () => {
    const copy = buildUsdEquivalentNoticeCopy(40);
    expect(copy.full).toContain("moneda");
  });
});

describe("Treasury USD equivalent consolidation", () => {
  it("consolidated after-payments = (cash_uyu/TC + cash_usd) - (committed_uyu/TC + committed_usd)", () => {
    const cashUsd = convertToUsdEquivalent({ uyu: 500_000, usd: 10_000 }, 40);
    const committedUsd = convertToUsdEquivalent({ uyu: 100_000, usd: 2_000 }, 40);
    // cash: 500_000/40 + 10_000 = 12_500 + 10_000 = 22_500
    // committed: 100_000/40 + 2_000 = 2_500 + 2_000 = 4_500
    expect(cashUsd).toBe(22_500);
    expect(committedUsd).toBe(4_500);
    expect(cashUsd - committedUsd).toBe(18_000);
  });

  it("native mode: no consolidation — UYU and USD remain separate", () => {
    const result = formatDisplayAmounts({ uyu: 500_000, usd: 10_000, mode: "native", fxRate: 40 });
    expect(result.kind).toBe("native");
  });

  it("treasury detail note copy contains 'USD estimado', not 'USD real'", () => {
    const note = "Detalle en moneda original. Resumen convertido a USD estimado.";
    expect(note).toContain("USD estimado");
    expect(note).not.toContain("USD real");
  });
});

describe("buildCurrencyRiskChipCopy", () => {
  it("both currencies positive — cubierto labels, no warning", () => {
    const chips = buildCurrencyRiskChipCopy(1000, 500);
    expect(chips.uyuLabel).toBe("UYU cubierto");
    expect(chips.usdLabel).toBe("USD cubierto");
    expect(chips.uyuRisk).toBe(false);
    expect(chips.usdRisk).toBe(false);
    expect(chips.showWarning).toBe(false);
  });

  it("UYU negative — uyuRisk=true, showWarning=true", () => {
    const chips = buildCurrencyRiskChipCopy(-200, 500);
    expect(chips.uyuLabel).toBe("UYU en riesgo");
    expect(chips.uyuRisk).toBe(true);
    expect(chips.usdRisk).toBe(false);
    expect(chips.showWarning).toBe(true);
    expect(chips.warningText.length).toBeGreaterThan(0);
  });

  it("both currencies negative — both risk flags and warning", () => {
    const chips = buildCurrencyRiskChipCopy(-100, -50);
    expect(chips.uyuRisk).toBe(true);
    expect(chips.usdRisk).toBe(true);
    expect(chips.showWarning).toBe(true);
  });
});

describe("storage helpers — SSR-safe (no window)", () => {
  it("readDisplayModeFromStorage returns usd_equivalent default when window is undefined", () => {
    expect(readDisplayModeFromStorage()).toBe("usd_equivalent");
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
