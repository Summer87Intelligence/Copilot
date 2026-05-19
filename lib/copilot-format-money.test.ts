import { describe, expect, it } from "vitest";
import {
  formatMoneyCurrency,
  getCurrencyLabel,
  normalizeCurrencyCode,
} from "./copilot-format-money";

describe("normalizeCurrencyCode", () => {
  it("null → UYU", () => expect(normalizeCurrencyCode(null)).toBe("UYU"));
  it("undefined → UYU", () => expect(normalizeCurrencyCode(undefined)).toBe("UYU"));
  it("empty string → UYU", () => expect(normalizeCurrencyCode("")).toBe("UYU"));
  it("whitespace → UYU", () => expect(normalizeCurrencyCode("  ")).toBe("UYU"));
  it("uppercases lowercase input", () => expect(normalizeCurrencyCode("usd")).toBe("USD"));
  it("trims and uppercases", () => expect(normalizeCurrencyCode(" uyu ")).toBe("UYU"));
  it("preserves unknown codes uppercased", () => expect(normalizeCurrencyCode("eur")).toBe("EUR"));
});

describe("getCurrencyLabel", () => {
  it("UYU → $", () => expect(getCurrencyLabel("UYU")).toBe("$"));
  it("USD → U$S", () => expect(getCurrencyLabel("USD")).toBe("U$S"));
  it("null → $ (UYU default)", () => expect(getCurrencyLabel(null)).toBe("$"));
  it("undefined → $ (UYU default)", () => expect(getCurrencyLabel(undefined)).toBe("$"));
  it("unknown code → raw code", () => expect(getCurrencyLabel("EUR")).toBe("EUR"));
});

describe("formatMoneyCurrency — UYU (pesos)", () => {
  it("integer → $ with dot thousands separator", () => {
    expect(formatMoneyCurrency(196731, "UYU")).toBe("$ 196.731");
  });

  it("UYU with fractional amount rounds to 0 decimals", () => {
    expect(formatMoneyCurrency(196731.75, "UYU")).toBe("$ 196.732");
  });

  it("zero → $ 0", () => {
    expect(formatMoneyCurrency(0, "UYU")).toBe("$ 0");
  });

  it("null currency defaults to UYU", () => {
    expect(formatMoneyCurrency(1000, null)).toBe("$ 1.000");
  });

  it("undefined currency defaults to UYU", () => {
    expect(formatMoneyCurrency(1000)).toBe("$ 1.000");
  });
});

describe("formatMoneyCurrency — USD", () => {
  it("USD with decimals → U$S with comma decimal", () => {
    expect(formatMoneyCurrency(7835.41, "USD")).toBe("U$S 7.835,41");
  });

  it("USD integer → U$S without trailing decimals", () => {
    expect(formatMoneyCurrency(1000, "USD")).toBe("U$S 1.000");
  });

  it("null amount with USD → U$S 0", () => {
    expect(formatMoneyCurrency(null, "USD")).toBe("U$S 0");
  });

  it("zero USD → U$S 0", () => {
    expect(formatMoneyCurrency(0, "USD")).toBe("U$S 0");
  });
});

describe("formatMoneyCurrency — null / undefined / NaN guards", () => {
  it("null amount → $ 0 (no NaN shown)", () => {
    expect(formatMoneyCurrency(null)).toBe("$ 0");
  });

  it("undefined amount → $ 0", () => {
    expect(formatMoneyCurrency(undefined)).toBe("$ 0");
  });

  it("NaN → $ 0 (no NaN rendered)", () => {
    expect(formatMoneyCurrency(NaN)).toBe("$ 0");
  });

  it("Infinity → $ 0 (no Infinity rendered)", () => {
    expect(formatMoneyCurrency(Infinity)).toBe("$ 0");
  });
});

describe("formatMoneyCurrency — options", () => {
  it("compact:true forces 0 decimals on USD", () => {
    expect(formatMoneyCurrency(7835.41, "USD", { compact: true })).toBe("U$S 7.835");
  });

  it("compact:true on UYU already has 0 decimals", () => {
    expect(formatMoneyCurrency(5000, "UYU", { compact: true })).toBe("$ 5.000");
  });

  it("fallbackCurrency:USD used when currency is null", () => {
    expect(formatMoneyCurrency(1000, null, { fallbackCurrency: "USD" })).toBe("U$S 1.000");
  });

  it("fallbackCurrency ignored when currency is provided", () => {
    expect(formatMoneyCurrency(1000, "UYU", { fallbackCurrency: "USD" })).toBe("$ 1.000");
  });

  it("showCurrencyCode appends (CODE)", () => {
    expect(formatMoneyCurrency(1000, "USD", { showCurrencyCode: true })).toBe("U$S 1.000 (USD)");
  });

  it("showCurrencyCode with UYU", () => {
    expect(formatMoneyCurrency(5000, "UYU", { showCurrencyCode: true })).toBe("$ 5.000 (UYU)");
  });
});
