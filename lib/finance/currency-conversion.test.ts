import { describe, expect, it } from "vitest";

import {
  consolidateToUsd,
  convertMoneyToUsd,
  convertUyuToUsd,
  formatExchangeRateLabel,
  roundUsd,
} from "./currency-conversion";

describe("convertUyuToUsd", () => {
  it("UYU 4300 con TC 43 = USD 100", () => {
    expect(convertUyuToUsd(4300, 43)).toBe(100);
  });

  it("UYU 0 = USD 0", () => {
    expect(convertUyuToUsd(0, 43)).toBe(0);
  });

  it("redondeo correcto con TC decimal", () => {
    expect(roundUsd(convertUyuToUsd(100, 43.5))).toBe(2.3);
  });

  it("lanza error si uyuPerUsd es 0", () => {
    expect(() => convertUyuToUsd(100, 0)).toThrow("uyuPerUsd must be positive");
  });

  it("lanza error si uyuPerUsd es negativo", () => {
    expect(() => convertUyuToUsd(100, -5)).toThrow("uyuPerUsd must be positive");
  });
});

describe("convertMoneyToUsd", () => {
  it("USD 100 queda USD 100 (sin conversión)", () => {
    expect(convertMoneyToUsd(100, "USD", 43)).toBe(100);
  });

  it("UYU 4300 con TC 43 = USD 100", () => {
    expect(convertMoneyToUsd(4300, "UYU", 43)).toBe(100);
  });

  it("USD 0 queda 0 independiente del TC", () => {
    expect(convertMoneyToUsd(0, "USD", 1)).toBe(0);
  });
});

describe("consolidateToUsd", () => {
  it("all consolidated = USD + UYU/TC", () => {
    expect(consolidateToUsd(4300, 50, 43)).toBe(150);
  });

  it("sin UYU devuelve solo USD", () => {
    expect(consolidateToUsd(0, 100, 43)).toBe(100);
  });

  it("sin USD devuelve solo UYU convertido", () => {
    expect(consolidateToUsd(4300, 0, 43)).toBe(100);
  });

  it("lanza error si TC es 0", () => {
    expect(() => consolidateToUsd(100, 0, 0)).toThrow("uyuPerUsd must be positive");
  });
});

describe("formatExchangeRateLabel", () => {
  it("formatea el TC correctamente", () => {
    expect(formatExchangeRateLabel(43)).toBe("1 USD = 43,00 UYU");
  });
});

describe("sin TC no permite consolidar", () => {
  it("consolidateToUsd con TC undefined lanza error", () => {
    expect(() => consolidateToUsd(100, 0, undefined as unknown as number)).toThrow();
  });

  it("convertUyuToUsd con TC null lanza error", () => {
    expect(() => convertUyuToUsd(100, null as unknown as number)).toThrow();
  });
});
