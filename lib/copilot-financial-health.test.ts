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
  // Escenario del falso positivo real: 90 facturas cobradas, status="issued",
  // balance=0 — pero proto_invoice_installments no tiene cuota_saldo > 0.
  // → debe ser warning (no critical) porque no hay overwrite confirmado.
  it("falso positivo real: 90 suspicious via installments, 0 confirmados → warning no critical", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 0,
      unconfirmedSuspicious: 90,
      totalActiveInvoices: 500,
      crossReferenceSource: "installments",
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("warning");
    expect(result.severity).not.toBe("critical");
    expect(result.affectedCount).toBe(90);
  });

  // Sin fuente externa Y volumen alto → warning informativo
  it("sin cross-reference y volumen alto (> 20) → warning informativo", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 0,
      unconfirmedSuspicious: 90,
      totalActiveInvoices: 300,
      crossReferenceSource: "none",
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("warning");
    expect(result.summary).toContain("sin fuente externa");
  });

  // Sin fuente externa Y volumen bajo → ok
  it("sin cross-reference y volumen bajo (≤ 20) → ok", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 0,
      unconfirmedSuspicious: 5,
      totalActiveInvoices: 200,
      crossReferenceSource: "none",
    };
    expect(checkBalanceOverwrite(stats).severity).toBe("ok");
  });

  // Overwrite confirmado por installments → critical
  it("overwrite confirmado por installments → critical", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 3,
      unconfirmedSuspicious: 10,
      totalActiveInvoices: 200,
      crossReferenceSource: "installments",
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(3);
    expect(result.details).toContain("installments");
  });

  // Overwrite confirmado por invoice_financials → critical
  it("overwrite confirmado por invoice_financials → critical", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 1,
      unconfirmedSuspicious: 0,
      totalActiveInvoices: 100,
      crossReferenceSource: "invoice_financials",
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("critical");
    expect(result.details).toContain("invoice_financials");
  });

  // Vouchers recientes: installments confirma saldo pendiente → critical
  it("expectedPending > 0 vía installments con unconfirmed también → critical (confirmed es el trigger)", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 5,
      unconfirmedSuspicious: 85,
      totalActiveInvoices: 500,
      crossReferenceSource: "installments",
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("critical");
    expect(result.affectedCount).toBe(5);
  });

  // Zero en todo → ok limpio
  it("zero en todo → ok", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 0,
      unconfirmedSuspicious: 0,
      totalActiveInvoices: 300,
      crossReferenceSource: "installments",
    };
    const result = checkBalanceOverwrite(stats);
    expect(result.severity).toBe("ok");
    expect(result.affectedCount).toBe(0);
  });

  // Facturas pagadas normalmente: balance=0, sin suspicious → ok
  it("facturas pagadas normales (balance=0 coincide con paid) → ok", () => {
    const stats: BalanceOverwriteStats = {
      confirmedOverwrites: 0,
      unconfirmedSuspicious: 0,
      totalActiveInvoices: 150,
      crossReferenceSource: "none",
    };
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
