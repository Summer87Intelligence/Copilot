import { describe, it, expect } from "vitest";
import {
  evaluateCurrencyThresholds,
  buildCurrencyRiskSummary,
  currencyRiskToClientRiskLabel,
  maxCurrencyRiskLevel,
  currencyRiskLevelLabel,
  THRESHOLDS_BY_CURRENCY,
  type CurrencyRiskLevel,
} from "./copilot-financial-thresholds";

describe("maxCurrencyRiskLevel", () => {
  it("returns the higher of two levels", () => {
    expect(maxCurrencyRiskLevel("low", "high")).toBe("high");
    expect(maxCurrencyRiskLevel("critical", "medium")).toBe("critical");
    expect(maxCurrencyRiskLevel("medium", "medium")).toBe("medium");
    expect(maxCurrencyRiskLevel("low", "low")).toBe("low");
  });
});

describe("evaluateCurrencyThresholds", () => {
  it("returns empty for empty input", () => {
    expect(Object.keys(evaluateCurrencyThresholds({}))).toHaveLength(0);
  });

  it("UYU overdue below high threshold → medium overdueRisk (any overdue > 0 is at least medium)", () => {
    const result = evaluateCurrencyThresholds({ UYU: { overdue: 10_000, pending: 20_000 } });
    expect(result.UYU?.overdueRisk).toBe("medium");
  });

  it("UYU overdue at high threshold → high overdueRisk", () => {
    const result = evaluateCurrencyThresholds({ UYU: { overdue: 50_000 } });
    expect(result.UYU?.overdueRisk).toBe("high");
  });

  it("UYU overdue at critical threshold → critical overdueRisk", () => {
    const result = evaluateCurrencyThresholds({ UYU: { overdue: 280_000 } });
    expect(result.UYU?.overdueRisk).toBe("critical");
  });

  it("USD overdue at high threshold → high overdueRisk", () => {
    const result = evaluateCurrencyThresholds({ USD: { overdue: 1_500 } });
    expect(result.USD?.overdueRisk).toBe("high");
  });

  it("USD overdue at critical threshold → critical overdueRisk", () => {
    const result = evaluateCurrencyThresholds({ USD: { overdue: 7_000 } });
    expect(result.USD?.overdueRisk).toBe("critical");
  });

  it("USD overdue below high threshold → medium overdueRisk (any overdue > 0 is medium)", () => {
    const result = evaluateCurrencyThresholds({ USD: { overdue: 500 } });
    expect(result.USD?.overdueRisk).toBe("medium");
  });

  it("USD overdue = 0 → low overdueRisk", () => {
    const result = evaluateCurrencyThresholds({ USD: { overdue: 0 } });
    expect(result.USD?.overdueRisk).toBe("low");
  });

  it("overallRisk is max of overdueRisk and debtRisk", () => {
    // high overdue + low debt = high overall
    const result = evaluateCurrencyThresholds({ UYU: { overdue: 50_000, pending: 10_000 } });
    expect(result.UYU?.overallRisk).toBe("high");
  });

  it("UYU zero overdue → low overdueRisk", () => {
    const result = evaluateCurrencyThresholds({ UYU: { overdue: 0, pending: 0 } });
    expect(result.UYU?.overdueRisk).toBe("low");
    expect(result.UYU?.debtRisk).toBe("low");
    expect(result.UYU?.overallRisk).toBe("low");
  });

  it("evaluates both currencies independently", () => {
    const result = evaluateCurrencyThresholds({
      UYU: { overdue: 1_000, pending: 5_000 },   // medium (>0, below UYU high=50K)
      USD: { overdue: 7_000, pending: 10_000 },   // critical (>= USD critical=7K)
    });
    expect(result.UYU?.overdueRisk).toBe("medium");
    expect(result.USD?.overdueRisk).toBe("critical");
  });
});

describe("buildCurrencyRiskSummary", () => {
  it("returns safe defaults for undefined input", () => {
    const s = buildCurrencyRiskSummary(undefined);
    expect(s.highestRisk).toBe("low");
    expect(s.mixedCurrency).toBe(false);
    expect(s.highestRiskCurrency).toBeNull();
  });

  it("returns safe defaults for empty input", () => {
    const s = buildCurrencyRiskSummary({});
    expect(s.highestRisk).toBe("low");
    expect(s.mixedCurrency).toBe(false);
  });

  it("UYU only: single currency, medium risk (10K overdue < high threshold but > 0)", () => {
    const s = buildCurrencyRiskSummary({ UYU: { overdue: 10_000 } });
    expect(s.mixedCurrency).toBe(false);
    expect(s.highestRiskCurrency).toBe("UYU");
    expect(s.highestRisk).toBe("medium");
  });

  it("UYU only: zero overdue → low risk", () => {
    const s = buildCurrencyRiskSummary({ UYU: { overdue: 0, pending: 0 } });
    expect(s.mixedCurrency).toBe(false);
    expect(s.highestRisk).toBe("low");
  });

  it("USD only: high risk USD", () => {
    const s = buildCurrencyRiskSummary({ USD: { overdue: 7_000 } });
    expect(s.highestRisk).toBe("critical");
    expect(s.highestRiskCurrency).toBe("USD");
    expect(s.mixedCurrency).toBe(false);
  });

  it("mixed: USD critical + UYU low → highestRiskCurrency = USD", () => {
    const s = buildCurrencyRiskSummary({
      UYU: { overdue: 5_000 },
      USD: { overdue: 7_000 },
    });
    expect(s.mixedCurrency).toBe(true);
    expect(s.highestRiskCurrency).toBe("USD");
    expect(s.highestRisk).toBe("critical");
  });

  it("mixed: UYU critical + USD low → highestRiskCurrency = UYU", () => {
    const s = buildCurrencyRiskSummary({
      UYU: { overdue: 280_000 },
      USD: { overdue: 100 },
    });
    expect(s.mixedCurrency).toBe(true);
    expect(s.highestRiskCurrency).toBe("UYU");
    expect(s.highestRisk).toBe("critical");
  });

  it("both currencies high → highestRisk = high", () => {
    const s = buildCurrencyRiskSummary({
      UYU: { overdue: 55_000 },  // 55K >= UYU high (50K) → high
      USD: { overdue: 2_000 },   // 2K >= USD high (1.5K) → high
    });
    expect(s.highestRisk).toBe("high");
    expect(s.mixedCurrency).toBe(true);
  });
});

describe("currencyRiskToClientRiskLabel", () => {
  const cases: [CurrencyRiskLevel, "Alto" | "Medio" | "Bajo"][] = [
    ["critical", "Alto"],
    ["high", "Alto"],
    ["medium", "Medio"],
    ["low", "Bajo"],
  ];
  for (const [level, expected] of cases) {
    it(`${level} → ${expected}`, () => {
      expect(currencyRiskToClientRiskLabel(level)).toBe(expected);
    });
  }
});

describe("THRESHOLDS_BY_CURRENCY sanity", () => {
  it("USD thresholds are smaller than UYU thresholds", () => {
    expect(THRESHOLDS_BY_CURRENCY.USD.overdue.critical).toBeLessThan(
      THRESHOLDS_BY_CURRENCY.UYU.overdue.critical
    );
    expect(THRESHOLDS_BY_CURRENCY.USD.debt.critical).toBeLessThan(
      THRESHOLDS_BY_CURRENCY.UYU.debt.critical
    );
  });

  it("high < critical for both currencies", () => {
    expect(THRESHOLDS_BY_CURRENCY.UYU.overdue.high).toBeLessThan(
      THRESHOLDS_BY_CURRENCY.UYU.overdue.critical
    );
    expect(THRESHOLDS_BY_CURRENCY.USD.overdue.high).toBeLessThan(
      THRESHOLDS_BY_CURRENCY.USD.overdue.critical
    );
  });
});

describe("currencyRiskLevelLabel", () => {
  it("returns Spanish labels", () => {
    expect(currencyRiskLevelLabel("low")).toBe("bajo");
    expect(currencyRiskLevelLabel("medium")).toBe("medio");
    expect(currencyRiskLevelLabel("high")).toBe("alto");
    expect(currencyRiskLevelLabel("critical")).toBe("crítico");
  });
});
