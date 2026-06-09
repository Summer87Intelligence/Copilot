import { describe, expect, it } from "vitest";

import {
  CANONICAL_DEBT_TOLERANCE,
  canonicalActiveDebtFromReportCurrencies,
  canonicalActiveDebtFromStaleClients,
  canonicalDebtRoughlyEqual,
  resolveCanonicalActiveDebt,
  resolveCanonicalOverdueDebt,
  sumPortfolioRowActiveDebt,
} from "@/lib/financial/canonical-debt-metrics";

describe("canonical-debt-metrics", () => {
  const currencies = [
    { currencyCode: "UYU", pendingAtCutoff: 1_079_497 },
    { currencyCode: "USD", pendingAtCutoff: 11_792 },
  ];

  it("reads pendingAtCutoff from report currencies", () => {
    expect(canonicalActiveDebtFromReportCurrencies(currencies)).toEqual({
      UYU: 1_079_497,
      USD: 11_792,
    });
  });

  it("prefers outstanding report over portfolio row sum", () => {
    const portfolio = [{ debt_uyu: 473_587, debt_usd: 7_981 }];
    expect(
      resolveCanonicalActiveDebt({
        outstandingReportCurrencies: currencies,
        portfolioRows: portfolio,
      })
    ).toEqual({ UYU: 1_079_497, USD: 11_792 });
  });

  it("falls back to portfolio rows when no report", () => {
    const portfolio = [{ debt_uyu: 100, debt_usd: 50 }];
    expect(sumPortfolioRowActiveDebt(portfolio)).toEqual({ UYU: 100, USD: 50 });
    expect(resolveCanonicalActiveDebt({ portfolioRows: portfolio })).toEqual({
      UYU: 100,
      USD: 50,
    });
  });

  it("sums stale client pending by currency", () => {
    const report = {
      staleClients: [
        { pendingByCurrency: { UYU: 500_000, USD: 0 } },
        { pendingByCurrency: { UYU: 579_497, USD: 11_792 } },
      ],
    } as Parameters<typeof canonicalActiveDebtFromStaleClients>[0];
    expect(canonicalActiveDebtFromStaleClients(report)).toEqual({
      UYU: 1_079_497,
      USD: 11_792,
    });
  });

  it("roughly equal within tolerance", () => {
    expect(
      canonicalDebtRoughlyEqual(
        { UYU: 100, USD: 50 },
        { UYU: 100.005, USD: 49.995 },
        CANONICAL_DEBT_TOLERANCE
      )
    ).toBe(true);
    expect(
      canonicalDebtRoughlyEqual({ UYU: 100, USD: 50 }, { UYU: 100.02, USD: 50 })
    ).toBe(false);
  });

  it("resolveCanonicalOverdueDebt suma overdue_uyu/usd del portfolio", () => {
    const portfolio = [
      { overdue_uyu: 22_000, overdue_usd: 0 },
      { overdue_uyu: 18_928, overdue_usd: 2_168 },
    ];
    expect(resolveCanonicalOverdueDebt({ portfolioRows: portfolio })).toEqual({
      UYU: 40_928,
      USD: 2_168,
    });
  });
});
