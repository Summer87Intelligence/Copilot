import { describe, it, expect } from "vitest";
import {
  checkDrift,
  checkBalanceOverwrite,
  checkMixedCurrencyAmbiguity,
  checkOrphanCloseSpike,
  checkSyncTruncation,
  checkMissingCustomers,
  type DriftStats,
  type BalanceOverwriteStats,
  type CurrencyAmbiguityStats,
  type OrphanCloseStats,
  type TruncationStats,
  type MissingCustomerStats,
} from "./copilot-financial-health";

// ── A) checkDrift ─────────────────────────────────────────────────────────────

describe("checkDrift", () => {
  it("returns ok when no drift", () => {
    const stats: DriftStats = {
      recentCriticalAudits: 0,
      recentWarningAudits: 0,
      maxAbsoluteDrift: 0,
      affectedEntities: [],
    };
    const result = checkDrift(stats);
    expect(result.severity).toBe("ok");
    expect(result.code).toBe("drift_detected");
    expect(result.affectedCount).toBe(0);
  });

  it("returns warning on warning audits only", () => {
    const stats: DriftStats = {
      recentCriticalAudits: 0,
      recentWarningAudits: 2,
      maxAbsoluteDrift: 5,
      affectedEntities: ["invoices"],
    };
    const result = checkDrift(stats);
    expect(result.severity).toBe("warning");
    expect(result.affectedCount).toBe(2);
    expect(result.summary).toContain("2");
  });

  it("returns critical when critical audits present", () => {
    const stats: DriftStats = {
      recentCriticalAudits: 1,
      recentWarningAudits: 3,
      maxAbsoluteDrift: 47,
      affectedEntities: ["invoices", "receipts"],
    };
    const result = checkDrift(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(1);
    expect(result.details).toContain("47");
  });

  it("critical takes priority over warning when both present", () => {
    const stats: DriftStats = {
      recentCriticalAudits: 1,
      recentWarningAudits: 5,
      maxAbsoluteDrift: 100,
      affectedEntities: ["invoices"],
    };
    expect(checkDrift(stats).severity).toBe("critical");
  });
});

// ── B) checkBalanceOverwrite ──────────────────────────────────────────────────

describe("checkBalanceOverwrite", () => {
  it("returns ok when count is below tolerances", () => {
    const stats: BalanceOverwriteStats = {
      zeroBalanceUnpaidCount: 3,
      totalActiveInvoices: 500,
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("ok");
    expect(result.affectedCount).toBe(3);
  });

  it("returns ok for zero count", () => {
    const stats: BalanceOverwriteStats = {
      zeroBalanceUnpaidCount: 0,
      totalActiveInvoices: 200,
    };
    expect(checkBalanceOverwrite(stats).severity).toBe("ok");
  });

  it("returns warning when count > 5 but ≤ 20 and ratio ≤ 0.15", () => {
    const stats: BalanceOverwriteStats = {
      zeroBalanceUnpaidCount: 10,
      totalActiveInvoices: 500,
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("warning");
    expect(result.affectedCount).toBe(10);
  });

  it("returns critical when count > 20", () => {
    const stats: BalanceOverwriteStats = {
      zeroBalanceUnpaidCount: 25,
      totalActiveInvoices: 100,
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(25);
  });

  it("returns critical when ratio > 0.15 even with low absolute count", () => {
    const stats: BalanceOverwriteStats = {
      zeroBalanceUnpaidCount: 8,
      totalActiveInvoices: 40,
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("critical");
  });

  it("handles zero totalActiveInvoices without dividing by zero", () => {
    const stats: BalanceOverwriteStats = {
      zeroBalanceUnpaidCount: 0,
      totalActiveInvoices: 0,
    };
    expect(() => checkBalanceOverwrite(stats)).not.toThrow();
    expect(checkBalanceOverwrite(stats).severity).toBe("ok");
  });
});

// ── C) checkMixedCurrencyAmbiguity ────────────────────────────────────────────

describe("checkMixedCurrencyAmbiguity", () => {
  it("returns ok when no null currency invoices", () => {
    const stats: CurrencyAmbiguityStats = {
      invoicesWithNullCurrency: 0,
      totalInvoicesWithBalance: 300,
    };
    const result = checkMixedCurrencyAmbiguity(stats);
    expect(result.severity).toBe("ok");
    expect(result.affectedCount).toBe(0);
  });

  it("returns warning when any null currency but ratio ≤ 0.20", () => {
    const stats: CurrencyAmbiguityStats = {
      invoicesWithNullCurrency: 5,
      totalInvoicesWithBalance: 100,
    };
    const result = checkMixedCurrencyAmbiguity(stats);
    expect(result.severity).toBe("warning");
    expect(result.affectedCount).toBe(5);
  });

  it("returns critical when ratio > 0.20", () => {
    const stats: CurrencyAmbiguityStats = {
      invoicesWithNullCurrency: 30,
      totalInvoicesWithBalance: 100,
    };
    const result = checkMixedCurrencyAmbiguity(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(30);
  });

  it("handles zero totalInvoicesWithBalance without dividing by zero", () => {
    const stats: CurrencyAmbiguityStats = {
      invoicesWithNullCurrency: 0,
      totalInvoicesWithBalance: 0,
    };
    expect(() => checkMixedCurrencyAmbiguity(stats)).not.toThrow();
    expect(checkMixedCurrencyAmbiguity(stats).severity).toBe("ok");
  });
});

// ── D) checkOrphanCloseSpike ──────────────────────────────────────────────────

describe("checkOrphanCloseSpike", () => {
  it("returns ok when no yesterday data", () => {
    const stats: OrphanCloseStats = { yesterdayOpenCount: 0, currentOpenCount: 50 };
    const result = checkOrphanCloseSpike(stats);
    expect(result.severity).toBe("ok");
  });

  it("returns ok when drop is within normal range", () => {
    const stats: OrphanCloseStats = { yesterdayOpenCount: 100, currentOpenCount: 97 };
    const result = checkOrphanCloseSpike(stats);
    expect(result.severity).toBe("ok");
  });

  it("returns warning on moderate drop (>10% but ≤25% and >5 invoices)", () => {
    const stats: OrphanCloseStats = { yesterdayOpenCount: 100, currentOpenCount: 88 };
    const result = checkOrphanCloseSpike(stats);
    expect(result.severity).toBe("warning");
    expect(result.affectedCount).toBe(12);
  });

  it("returns critical on large drop (>25% and >10 invoices)", () => {
    const stats: OrphanCloseStats = { yesterdayOpenCount: 200, currentOpenCount: 140 };
    const result = checkOrphanCloseSpike(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(60);
  });

  it("respects custom thresholds", () => {
    const stats: OrphanCloseStats = { yesterdayOpenCount: 100, currentOpenCount: 88 };
    const result = checkOrphanCloseSpike(stats, {
      orphanDropPctWarning: 0.05,
      orphanDropPctCritical: 0.20,
    });
    expect(result.severity).toBe("warning");
  });

  it("does not trigger warning on small absolute drop even if pct is high", () => {
    // 3 out of 20 = 15% drop but absolute < 5 → should be ok
    const stats: OrphanCloseStats = { yesterdayOpenCount: 20, currentOpenCount: 17 };
    const result = checkOrphanCloseSpike(stats);
    expect(result.severity).toBe("ok");
  });
});

// ── E) checkSyncTruncation ────────────────────────────────────────────────────

describe("checkSyncTruncation", () => {
  it("returns ok when no pipelines at cap", () => {
    const stats: TruncationStats = { pipelinesAtCap: [], rowCap: 500 };
    const result = checkSyncTruncation(stats);
    expect(result.severity).toBe("ok");
    expect(result.affectedCount).toBe(0);
  });

  it("returns critical when a financial pipeline is at cap", () => {
    const stats: TruncationStats = {
      pipelinesAtCap: ["zeta-sync-vouchers"],
      rowCap: 500,
    };
    const result = checkSyncTruncation(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(1);
    expect(result.details).toContain("zeta-sync-vouchers");
  });

  it("returns critical for any financial pipeline (saldos, vouchers, receipts, audit)", () => {
    const financialPipelines = [
      "zeta-sync-vouchers",
      "zeta-sync-saldos",
      "zeta-sync-collection-receipts",
      "zeta-completeness-audit",
    ];
    for (const p of financialPipelines) {
      const result = checkSyncTruncation({ pipelinesAtCap: [p], rowCap: 500 });
      expect(result.severity).toBe("critical");
    }
  });

  it("returns warning when only non-financial pipeline is at cap", () => {
    const stats: TruncationStats = {
      pipelinesAtCap: ["some-other-pipeline"],
      rowCap: 500,
    };
    const result = checkSyncTruncation(stats);
    expect(result.severity).toBe("warning");
    expect(result.affectedCount).toBe(1);
  });

  it("returns critical when mixed financial + non-financial at cap", () => {
    const stats: TruncationStats = {
      pipelinesAtCap: ["some-other-pipeline", "zeta-sync-saldos"],
      rowCap: 500,
    };
    const result = checkSyncTruncation(stats);
    expect(result.severity).toBe("critical");
  });
});

// ── F) checkMissingCustomers ──────────────────────────────────────────────────

describe("checkMissingCustomers", () => {
  it("returns ok when no missing companies", () => {
    const stats: MissingCustomerStats = {
      invoicesWithMissingCompany: 0,
      affectedCompanyIds: [],
    };
    const result = checkMissingCustomers(stats);
    expect(result.severity).toBe("ok");
    expect(result.affectedCount).toBe(0);
  });

  it("returns warning for 1–10 missing companies", () => {
    const stats: MissingCustomerStats = {
      invoicesWithMissingCompany: 5,
      affectedCompanyIds: ["a", "b", "c", "d", "e"],
    };
    const result = checkMissingCustomers(stats);
    expect(result.severity).toBe("warning");
    expect(result.affectedCount).toBe(5);
  });

  it("returns critical when more than 10 companies missing", () => {
    const stats: MissingCustomerStats = {
      invoicesWithMissingCompany: 15,
      affectedCompanyIds: Array.from({ length: 15 }, (_, i) => `id-${i}`),
    };
    const result = checkMissingCustomers(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(15);
  });

  it("truncates affectedCompanyIds in summary to first 10", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `company-${i}`);
    const stats: MissingCustomerStats = {
      invoicesWithMissingCompany: 20,
      affectedCompanyIds: ids,
    };
    const result = checkMissingCustomers(stats);
    expect(result.severity).toBe("critical");
    expect(result.details).toContain("company-0");
    expect(result.details).toContain("company-9");
    expect(result.details).not.toContain("company-10");
  });
});
