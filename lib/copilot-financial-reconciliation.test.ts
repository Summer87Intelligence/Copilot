import { describe, it, expect } from "vitest";
import {
  generateFinancialConsistencyReport,
  STALE_WARNING_HOURS,
  STALE_CRITICAL_HOURS,
  type InvoiceInput,
  type CompanyInput,
  type SyncStateInput,
} from "./copilot-financial-reconciliation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = "2026-01-15T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function hoursAgoIso(hours: number): string {
  return new Date(NOW_MS - hours * 60 * 60 * 1000).toISOString();
}

function inv(overrides: Partial<InvoiceInput> & { id: string }): InvoiceInput {
  return {
    company_id: "company-1",
    currency_code: "UYU",
    total_amount: 1000,
    balance_amount: 1000,
    status: null,
    updated_at: hoursAgoIso(1),
    ...overrides,
  };
}

function run(
  invoices: InvoiceInput[],
  companies: CompanyInput[] = [],
  syncStates: SyncStateInput[] = []
) {
  return generateFinancialConsistencyReport({
    workspaceId: "ws-1",
    invoices,
    companies,
    syncStates,
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// Currency accumulation
// ---------------------------------------------------------------------------

describe("currency accumulation", () => {
  it("sums UYU pending and invoiced amounts", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 600 }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500, balance_amount: 500 }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.totalInvoiced).toBe(1500);
    expect(uyu?.totalPending).toBe(1100);
    expect(uyu?.invoiceCount).toBe(2);
  });

  it("sums USD separately from UYU", () => {
    const report = run([
      inv({ id: "i1", currency_code: "USD", total_amount: 200, balance_amount: 200 }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 1000, balance_amount: 1000 }),
    ]);
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(usd?.totalPending).toBe(200);
    expect(uyu?.totalPending).toBe(1000);
  });

  it("treats null balance_amount as fully pending", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 800, balance_amount: null }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.totalPending).toBe(800);
    expect(uyu?.totalInvoiced).toBe(800);
  });

  it("currency order is always USD before UYU", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU" }),
      inv({ id: "i2", currency_code: "USD", total_amount: 100, balance_amount: 100 }),
    ]);
    expect(report.currencies[0]?.currencyCode).toBe("USD");
    expect(report.currencies[1]?.currencyCode).toBe("UYU");
  });

  it("excludes currencies with zero valid invoices from output", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU" }),
    ]);
    expect(report.currencies.every((c) => c.currencyCode !== "USD")).toBe(true);
  });

  it("ignores invoices with total_amount <= 0 in currency totals", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 0, balance_amount: 0 }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu).toBeUndefined();
  });

  it("counts pendingInvoiceCount only for invoices with pending balance > 0", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 0 }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 1000, balance_amount: 250 }),
      inv({ id: "i3", currency_code: "UYU", total_amount: 1000, balance_amount: 1000 }),
      inv({ id: "i4", currency_code: "USD", total_amount: 500, balance_amount: 0 }),
      inv({ id: "i5", currency_code: "USD", total_amount: 500, balance_amount: 500 }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(uyu?.invoiceCount).toBe(3);
    expect(uyu?.pendingInvoiceCount).toBe(2);
    expect(usd?.invoiceCount).toBe(2);
    expect(usd?.pendingInvoiceCount).toBe(1);
  });

  it("treats null balance_amount as fully pending in pendingInvoiceCount", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 800, balance_amount: null }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.pendingInvoiceCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Invoices without currency
// ---------------------------------------------------------------------------

describe("invoices without currency", () => {
  it("counts invoices with null currency_code", () => {
    const report = run([
      inv({ id: "i1", currency_code: null }),
      inv({ id: "i2", currency_code: "UYU" }),
    ]);
    expect(report.totalInvoicesWithoutCurrency).toBe(1);
    expect(report.totalInvoices).toBe(2);
  });

  it("counts invoices with empty string currency_code", () => {
    const report = run([
      inv({ id: "i1", currency_code: "" }),
    ]);
    expect(report.totalInvoicesWithoutCurrency).toBe(1);
  });

  it("counts invoices with unrecognized currency (ARS, EUR)", () => {
    const report = run([
      inv({ id: "i1", currency_code: "ARS" }),
      inv({ id: "i2", currency_code: "EUR" }),
    ]);
    expect(report.totalInvoicesWithoutCurrency).toBe(2);
  });

  it("does not count voided invoices in totalInvoicesWithoutCurrency", () => {
    const report = run([
      inv({ id: "i1", currency_code: null, status: "voided" }),
    ]);
    expect(report.totalInvoicesWithoutCurrency).toBe(0);
    expect(report.voidedInvoices).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Voided invoices
// ---------------------------------------------------------------------------

describe("voided invoices", () => {
  it("excludes voided invoices from totals", () => {
    const report = run([
      inv({ id: "i1", status: "voided", total_amount: 5000 }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 1000, balance_amount: 1000 }),
    ]);
    expect(report.voidedInvoices).toBe(1);
    expect(report.totalInvoices).toBe(1);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.totalInvoiced).toBe(1000);
  });

  it.each(["void", "voided", "canceled", "cancelled", "anulada", "anulado", "annulled"])(
    "recognizes '%s' as voided",
    (status) => {
      const report = run([inv({ id: "i1", status })]);
      expect(report.voidedInvoices).toBe(1);
      expect(report.totalInvoices).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Per-client staleness
// ---------------------------------------------------------------------------

describe("per-client staleness", () => {
  it("status ok when last update is within 24h", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(1) }),
    ]);
    const client = report.staleClients.find((c) => c.companyId === "c1");
    expect(client?.status).toBe("ok");
    expect(client?.ageHours).toBeCloseTo(1, 0);
  });

  it(`status warning when last update > ${STALE_WARNING_HOURS}h`, () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(25) }),
    ]);
    const client = report.staleClients.find((c) => c.companyId === "c1");
    expect(client?.status).toBe("warning");
  });

  it(`status critical when last update > ${STALE_CRITICAL_HOURS}h`, () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(73) }),
    ]);
    const client = report.staleClients.find((c) => c.companyId === "c1");
    expect(client?.status).toBe("critical");
  });

  it("status never_synced when all invoices have null updated_at", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: null }),
    ]);
    const client = report.staleClients.find((c) => c.companyId === "c1");
    expect(client?.status).toBe("never_synced");
    expect(client?.lastInvoiceUpdatedAt).toBeNull();
    expect(client?.ageHours).toBeNull();
  });

  it("uses MAX(updated_at) across multiple invoices for same client", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(80) }),
      inv({ id: "i2", company_id: "c1", updated_at: hoursAgoIso(10) }),
      inv({ id: "i3", company_id: "c1", updated_at: hoursAgoIso(50) }),
    ]);
    const client = report.staleClients.find((c) => c.companyId === "c1");
    // MAX is 10h ago → ok
    expect(client?.status).toBe("ok");
    expect(client?.ageHours).toBeCloseTo(10, 0);
  });

  it("resolves company name from companies input", () => {
    const report = run(
      [inv({ id: "i1", company_id: "c1" })],
      [{ id: "c1", name: "Acme S.A." }]
    );
    const client = report.staleClients.find((c) => c.companyId === "c1");
    expect(client?.companyName).toBe("Acme S.A.");
  });

  it("sets companyName null when company not in companies list", () => {
    const report = run([inv({ id: "i1", company_id: "c99" })]);
    const client = report.staleClients.find((c) => c.companyId === "c99");
    expect(client?.companyName).toBeNull();
  });

  it("sorts stale clients worst-first (never_synced > critical > warning > ok)", () => {
    const report = run([
      inv({ id: "i1", company_id: "ok", updated_at: hoursAgoIso(1) }),
      inv({ id: "i2", company_id: "warn", updated_at: hoursAgoIso(30) }),
      inv({ id: "i3", company_id: "crit", updated_at: hoursAgoIso(80) }),
      inv({ id: "i4", company_id: "ns", updated_at: null }),
    ]);
    const statuses = report.staleClients.map((c) => c.status);
    expect(statuses[0]).toBe("never_synced");
    expect(statuses[1]).toBe("critical");
    expect(statuses[2]).toBe("warning");
    expect(statuses[3]).toBe("ok");
  });

  it("counts invoiceCount per client correctly", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1" }),
      inv({ id: "i2", company_id: "c1" }),
      inv({ id: "i3", company_id: "c2" }),
    ]);
    const c1 = report.staleClients.find((c) => c.companyId === "c1");
    const c2 = report.staleClients.find((c) => c.companyId === "c2");
    expect(c1?.invoiceCount).toBe(2);
    expect(c2?.invoiceCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stale summary
// ---------------------------------------------------------------------------

describe("staleSummary", () => {
  it("aggregates staleness counts correctly", () => {
    const report = run([
      inv({ id: "i1", company_id: "ok1", updated_at: hoursAgoIso(1) }),
      inv({ id: "i2", company_id: "ok2", updated_at: hoursAgoIso(10) }),
      inv({ id: "i3", company_id: "warn", updated_at: hoursAgoIso(30) }),
      inv({ id: "i4", company_id: "crit", updated_at: hoursAgoIso(80) }),
      inv({ id: "i5", company_id: "ns", updated_at: null }),
    ]);
    expect(report.staleSummary.ok).toBe(2);
    expect(report.staleSummary.warning).toBe(1);
    expect(report.staleSummary.critical).toBe(1);
    expect(report.staleSummary.never_synced).toBe(1);
  });

  it("returns all-zero summary for empty invoices", () => {
    const report = run([]);
    expect(report.staleSummary).toEqual({ ok: 0, warning: 0, critical: 0, never_synced: 0 });
  });
});

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

describe("sync state", () => {
  it("reflects ok status when synced recently", () => {
    const report = run(
      [],
      [],
      [{ resource_flow: "saldos_pendientes", last_success_at: hoursAgoIso(2), bootstrap_completed: true }]
    );
    const state = report.syncStates.find((s) => s.resource_flow === "saldos_pendientes");
    expect(state?.status).toBe("ok");
    expect(state?.ageHours).toBeCloseTo(2, 0);
  });

  it("reflects critical status when sync is > 72h old", () => {
    const report = run(
      [],
      [],
      [{ resource_flow: "saldos_pendientes", last_success_at: hoursAgoIso(100), bootstrap_completed: true }]
    );
    const state = report.syncStates.find((s) => s.resource_flow === "saldos_pendientes");
    expect(state?.status).toBe("critical");
  });

  it("reflects never_synced when last_success_at is null", () => {
    const report = run(
      [],
      [],
      [{ resource_flow: "saldos_pendientes", last_success_at: null, bootstrap_completed: false }]
    );
    const state = report.syncStates.find((s) => s.resource_flow === "saldos_pendientes");
    expect(state?.status).toBe("never_synced");
    expect(state?.ageHours).toBeNull();
  });

  it("returns empty syncStates array when none provided", () => {
    const report = run([]);
    expect(report.syncStates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dashboard totals validation (Fase 2J — manual reference check)
// ---------------------------------------------------------------------------

describe("dashboard totals validation", () => {
  it("produces non-zero pending when invoices exist with known currency", () => {
    // Reference period 2026-01-01 → 2026-05-07 for one workspace:
    // UYU ≈ 723,650 / USD ≈ 13,197.85
    // This test verifies the function accumulates correctly without hardcoding those values.
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 500000, balance_amount: 500000 }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 223650, balance_amount: 223650 }),
      inv({ id: "i3", currency_code: "USD", total_amount: 10000, balance_amount: 10000 }),
      inv({ id: "i4", currency_code: "USD", total_amount: 3197.85, balance_amount: 3197.85 }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(uyu?.totalPending).toBe(723650);
    expect(usd?.totalPending).toBe(13197.85);
  });

  it("does not include invoices with unknown currency in currency totals", () => {
    const report = run([
      inv({ id: "i1", currency_code: null, total_amount: 100000 }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 50000, balance_amount: 50000 }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.totalPending).toBe(50000);
    expect(report.totalInvoicesWithoutCurrency).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty invoices, companies, and syncStates", () => {
    const report = run([], [], []);
    expect(report.currencies).toEqual([]);
    expect(report.totalInvoices).toBe(0);
    expect(report.totalInvoicesWithoutCurrency).toBe(0);
    expect(report.voidedInvoices).toBe(0);
    expect(report.staleClients).toEqual([]);
    expect(report.syncStates).toEqual([]);
  });

  it("sets workspaceId correctly", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "test-workspace-xyz",
      invoices: [],
      companies: [],
      syncStates: [],
      now: NOW,
    });
    expect(report.workspaceId).toBe("test-workspace-xyz");
  });

  it("uses injected now for deterministic generatedAt", () => {
    const report = run([]);
    expect(report.generatedAt).toBe(NOW);
  });

  it("defaults mode to all_outstanding", () => {
    const report = run([]);
    expect(report.mode).toBe("all_outstanding");
  });

  it("periodStart and periodEnd are null when mode is all_outstanding", () => {
    const report = run([]);
    expect(report.periodStart).toBeNull();
    expect(report.periodEnd).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fase 3C — period filter
// ---------------------------------------------------------------------------

describe("period filter (mode: period_only)", () => {
  function runPeriod(invoices: InvoiceInput[], periodStart: string, periodEnd: string) {
    return generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      companies: [],
      syncStates: [],
      now: NOW,
      mode: "period_only",
      periodStart,
      periodEnd,
    });
  }

  it("includes invoices within period and excludes those outside", () => {
    const report = runPeriod(
      [
        inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-01-10" }),
        inv({ id: "i2", currency_code: "UYU", total_amount: 500, balance_amount: 500, issue_date: "2025-12-31" }),
        inv({ id: "i3", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2026-02-01" }),
      ],
      "2026-01-01",
      "2026-01-31"
    );
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.totalPending).toBe(1000);
    expect(uyu?.invoiceCount).toBe(1);
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(2);
  });

  it("includes invoices on period boundary dates", () => {
    const report = runPeriod(
      [
        inv({ id: "i1", currency_code: "UYU", total_amount: 100, balance_amount: 100, issue_date: "2026-01-01" }),
        inv({ id: "i2", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2026-01-31" }),
      ],
      "2026-01-01",
      "2026-01-31"
    );
    expect(report.totalInvoices).toBe(2);
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(0);
  });

  it("excludes all invoices when none are in period", () => {
    const report = runPeriod(
      [inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2025-01-01" })],
      "2026-01-01",
      "2026-12-31"
    );
    expect(report.totalInvoices).toBe(0);
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(1);
    expect(report.currencies).toEqual([]);
  });

  it("treats missing issue_date as excluded in period_only mode", () => {
    const report = runPeriod(
      [inv({ id: "i1", currency_code: "UYU", total_amount: 500, balance_amount: 500 })],
      "2026-01-01",
      "2026-12-31"
    );
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(1);
    expect(report.totalInvoices).toBe(0);
  });

  it("stores mode, periodStart and periodEnd in report", () => {
    const report = runPeriod([], "2026-01-01", "2026-05-07");
    expect(report.mode).toBe("period_only");
    expect(report.periodStart).toBe("2026-01-01");
    expect(report.periodEnd).toBe("2026-05-07");
  });

  it("period_exclusion_ratio is null for all_outstanding mode", () => {
    const report = run([inv({ id: "i1", currency_code: "UYU" })]);
    expect(report.metrics.period_exclusion_ratio).toBeNull();
  });

  it("period_exclusion_ratio is correct in period_only mode", () => {
    const report = runPeriod(
      [
        inv({ id: "i1", currency_code: "UYU", total_amount: 100, balance_amount: 100, issue_date: "2026-01-15" }),
        inv({ id: "i2", currency_code: "UYU", total_amount: 100, balance_amount: 100, issue_date: "2025-06-01" }),
        inv({ id: "i3", currency_code: "UYU", total_amount: 100, balance_amount: 100, issue_date: "2027-01-01" }),
      ],
      "2026-01-01",
      "2026-12-31"
    );
    // 1 included, 2 excluded out of 3 total non-voided
    expect(report.metrics.period_exclusion_ratio).toBeCloseTo(2 / 3, 2);
  });
});

// ---------------------------------------------------------------------------
// Fase 3D — gaps explainability
// ---------------------------------------------------------------------------

describe("gaps explainability", () => {
  it("gaps.invoicesWithoutCurrency counts null/empty/unrecognized currency invoices", () => {
    const report = run([
      inv({ id: "i1", currency_code: null }),
      inv({ id: "i2", currency_code: "" }),
      inv({ id: "i3", currency_code: "ARS" }),
      inv({ id: "i4", currency_code: "UYU", total_amount: 100, balance_amount: 100 }),
    ]);
    expect(report.gaps.invoicesWithoutCurrency).toBe(3);
  });

  it("gaps.invoicesExcludedByPeriodFilter is 0 in all_outstanding mode", () => {
    const report = run([inv({ id: "i1", currency_code: "UYU" })]);
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(0);
  });

  it("gaps.clientsWithStaleData counts non-ok clients", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(1) }),
      inv({ id: "i2", company_id: "c2", updated_at: hoursAgoIso(30) }),
      inv({ id: "i3", company_id: "c3", updated_at: hoursAgoIso(80) }),
      inv({ id: "i4", company_id: "c4", updated_at: null }),
    ]);
    expect(report.gaps.clientsWithStaleData).toBe(3);
  });

  it("gaps.stalePendingByCurrency sums pending for non-ok clients", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, updated_at: hoursAgoIso(80) }),
      inv({ id: "i2", company_id: "c2", currency_code: "UYU", total_amount: 500, balance_amount: 500, updated_at: hoursAgoIso(1) }),
      inv({ id: "i3", company_id: "c3", currency_code: "USD", total_amount: 200, balance_amount: 200, updated_at: null }),
    ]);
    // c1 critical (1000 UYU), c2 ok (not included), c3 never_synced (200 USD)
    expect(report.gaps.stalePendingByCurrency.UYU).toBe(1000);
    expect(report.gaps.stalePendingByCurrency.USD).toBe(200);
  });

  it("gaps.stalePendingByCurrency is empty when all clients are ok", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 500, balance_amount: 500, updated_at: hoursAgoIso(1) }),
    ]);
    expect(Object.keys(report.gaps.stalePendingByCurrency).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Aging by currency
// ---------------------------------------------------------------------------

describe("agingByCurrency", () => {
  // NOW = "2026-01-15T12:00:00.000Z"
  // Days from issue_date to NOW:
  //   "2026-01-15" → 0 days  → 0_30
  //   "2026-01-10" → 5 days  → 0_30
  //   "2025-12-15" → 31 days → 31_60
  //   "2025-11-15" → 61 days → 61_90
  //   "2025-10-15" → 92 days → 90_plus

  it("assigns invoices to correct aging buckets", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-01-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2025-12-15" }),
      inv({ id: "i3", currency_code: "UYU", total_amount: 200,  balance_amount: 200,  issue_date: "2025-11-15" }),
      inv({ id: "i4", currency_code: "UYU", total_amount: 100,  balance_amount: 100,  issue_date: "2025-10-15" }),
    ]);
    const uyu = report.agingByCurrency.UYU;
    expect(uyu).toBeDefined();
    const b0_30   = uyu!.find(b => b.range === "0_30");
    const b31_60  = uyu!.find(b => b.range === "31_60");
    const b61_90  = uyu!.find(b => b.range === "61_90");
    const b90plus = uyu!.find(b => b.range === "90_plus");
    expect(b0_30?.amount).toBe(1000);
    expect(b31_60?.amount).toBe(500);
    expect(b61_90?.amount).toBe(200);
    expect(b90plus?.amount).toBe(100);
  });

  it("computes percentages relative to total pending in that currency", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 800, balance_amount: 800, issue_date: "2026-01-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2025-12-15" }),
    ]);
    const uyu = report.agingByCurrency.UYU!;
    const b0_30  = uyu.find(b => b.range === "0_30")!;
    const b31_60 = uyu.find(b => b.range === "31_60")!;
    expect(b0_30.percentage).toBeCloseTo(0.8, 2);
    expect(b31_60.percentage).toBeCloseTo(0.2, 2);
  });

  it("excludes zero-balance invoices from aging", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 0,    issue_date: "2026-01-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2025-12-15" }),
    ]);
    const uyu = report.agingByCurrency.UYU!;
    const b0_30 = uyu.find(b => b.range === "0_30")!;
    expect(b0_30.invoiceCount).toBe(0);
    expect(b0_30.amount).toBe(0);
  });

  it("counts unique clients per bucket", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 500, balance_amount: 500, issue_date: "2026-01-10" }),
      inv({ id: "i2", company_id: "c1", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2026-01-08" }),
      inv({ id: "i3", company_id: "c2", currency_code: "UYU", total_amount: 300, balance_amount: 300, issue_date: "2026-01-05" }),
    ]);
    const uyu = report.agingByCurrency.UYU!;
    const b0_30 = uyu.find(b => b.range === "0_30")!;
    expect(b0_30.invoiceCount).toBe(3);
    expect(b0_30.clientCount).toBe(2);
  });

  it("USD and UYU aged independently", () => {
    const report = run([
      inv({ id: "i1", currency_code: "USD", total_amount: 100, balance_amount: 100, issue_date: "2025-12-15" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2026-01-10" }),
    ]);
    expect(report.agingByCurrency.USD).toBeDefined();
    expect(report.agingByCurrency.UYU).toBeDefined();
    const usdBucket = report.agingByCurrency.USD!.find(b => b.range === "31_60")!;
    const uyuBucket = report.agingByCurrency.UYU!.find(b => b.range === "0_30")!;
    expect(usdBucket.amount).toBe(100);
    expect(uyuBucket.amount).toBe(200);
  });

  it("excludes invoices with no parseable issue_date from aging", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: null }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2026-01-10" }),
    ]);
    const uyu = report.agingByCurrency.UYU!;
    const total = uyu.reduce((s, b) => s + b.invoiceCount, 0);
    expect(total).toBe(1);
  });

  it("returns empty agingByCurrency when no invoices", () => {
    const report = run([]);
    expect(Object.keys(report.agingByCurrency).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dominantAgingRange on ClientStaleness
// ---------------------------------------------------------------------------

describe("dominantAgingRange", () => {
  it("sets dominantAgingRange to bucket with highest pending amount", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2025-12-15" }), // 31_60
      inv({ id: "i2", company_id: "c1", currency_code: "UYU", total_amount: 200,  balance_amount: 200,  issue_date: "2026-01-10" }), // 0_30
    ]);
    const client = report.staleClients.find(c => c.companyId === "c1");
    expect(client?.dominantAgingRange).toBe("31_60");
  });

  it("is null when client has no pending invoices", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 1000, balance_amount: 0, issue_date: "2026-01-10" }),
    ]);
    const client = report.staleClients.find(c => c.companyId === "c1");
    expect(client?.dominantAgingRange).toBeNull();
  });

  it("is null when invoices have no parseable issue_date", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: null }),
    ]);
    const client = report.staleClients.find(c => c.companyId === "c1");
    expect(client?.dominantAgingRange).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pre2026InvoiceCount
// ---------------------------------------------------------------------------

describe("pre2026InvoiceCount", () => {
  it("counts non-voided invoices with issue_date before 2026", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2025-12-31" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2025-01-01" }),
      inv({ id: "i3", currency_code: "UYU", total_amount: 200,  balance_amount: 200,  issue_date: "2026-01-01" }),
    ]);
    expect(report.gaps.pre2026InvoiceCount).toBe(2);
  });

  it("excludes voided pre-2026 invoices", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2025-12-31", status: "voided" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2025-12-31" }),
    ]);
    expect(report.gaps.pre2026InvoiceCount).toBe(1);
  });

  it("is 0 when all invoices are 2026+", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-01-01" }),
    ]);
    expect(report.gaps.pre2026InvoiceCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 3E — observability metrics
// ---------------------------------------------------------------------------

describe("observability metrics", () => {
  it("stale_ratio is null when no clients", () => {
    const report = run([]);
    expect(report.metrics.stale_ratio).toBeNull();
  });

  it("stale_ratio is 0 when all clients are ok", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(1) }),
      inv({ id: "i2", company_id: "c2", updated_at: hoursAgoIso(2) }),
    ]);
    expect(report.metrics.stale_ratio).toBe(0);
  });

  it("stale_ratio is 1 when all clients are stale", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(80) }),
      inv({ id: "i2", company_id: "c2", updated_at: null }),
    ]);
    expect(report.metrics.stale_ratio).toBe(1);
  });

  it("stale_ratio is 0.5 when half are stale", () => {
    const report = run([
      inv({ id: "i1", company_id: "c1", updated_at: hoursAgoIso(1) }),
      inv({ id: "i2", company_id: "c2", updated_at: hoursAgoIso(80) }),
    ]);
    expect(report.metrics.stale_ratio).toBe(0.5);
  });

  it("unknown_currency_ratio is null when no invoices", () => {
    const report = run([]);
    expect(report.metrics.unknown_currency_ratio).toBeNull();
  });

  it("unknown_currency_ratio is 0 when all have known currency", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 100, balance_amount: 100 }),
    ]);
    expect(report.metrics.unknown_currency_ratio).toBe(0);
  });

  it("unknown_currency_ratio is 1 when all have null currency", () => {
    const report = run([
      inv({ id: "i1", currency_code: null }),
      inv({ id: "i2", currency_code: null }),
    ]);
    expect(report.metrics.unknown_currency_ratio).toBe(1);
  });

  it("unknown_currency_ratio is 0.5 when half have unknown currency", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 100, balance_amount: 100 }),
      inv({ id: "i2", currency_code: null }),
    ]);
    expect(report.metrics.unknown_currency_ratio).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// operationalPeriod
// ---------------------------------------------------------------------------

describe("operationalPeriod", () => {
  it("start is always COPILOT_OPERATIONAL_START_DATE (2026-01-01)", () => {
    const report = run([]);
    expect(report.operationalPeriod.start).toBe("2026-01-01");
  });

  it("end is derived from the report generatedAt (NOW slice)", () => {
    const report = run([]);
    // NOW = "2026-01-15T12:00:00.000Z" → end should be "2026-01-15"
    expect(report.operationalPeriod.end).toBe("2026-01-15");
  });

  it("operationalPeriod fields are present even with no invoices", () => {
    const report = run([]);
    expect(report.operationalPeriod).toHaveProperty("start");
    expect(report.operationalPeriod).toHaveProperty("end");
  });
});

// ---------------------------------------------------------------------------
// excludedHistorical
// ---------------------------------------------------------------------------

describe("excludedHistorical", () => {
  it("is empty when all invoices are 2026+", () => {
    const report = run([
      inv({ id: "i1", issue_date: "2026-01-15", total_amount: 1000, balance_amount: 500 }),
      inv({ id: "i2", issue_date: "2026-03-01", total_amount: 2000, balance_amount: 1000 }),
    ]);
    expect(report.excludedHistorical.invoiceCount).toBe(0);
    expect(report.excludedHistorical.pendingByCurrency).toEqual({});
  });

  it("counts pre-2026 invoices with pending balance", () => {
    const report = run([
      inv({ id: "i1", issue_date: "2025-12-31", total_amount: 1000, balance_amount: 800 }),
      inv({ id: "i2", issue_date: "2025-06-01", total_amount: 500, balance_amount: 300, currency_code: "USD" }),
      inv({ id: "i3", issue_date: "2026-01-01", total_amount: 2000, balance_amount: 2000 }),
    ]);
    expect(report.excludedHistorical.invoiceCount).toBe(2);
    expect(report.excludedHistorical.pendingByCurrency.UYU).toBe(800);
    expect(report.excludedHistorical.pendingByCurrency.USD).toBe(300);
  });

  it("excludes voided pre-2026 invoices from excludedHistorical", () => {
    const report = run([
      inv({ id: "i1", issue_date: "2025-12-31", total_amount: 1000, balance_amount: 500, status: "void" }),
      inv({ id: "i2", issue_date: "2025-11-01", total_amount: 2000, balance_amount: 1000 }),
    ]);
    // void excluded, only i2 counts
    expect(report.excludedHistorical.invoiceCount).toBe(1);
    expect(report.excludedHistorical.pendingByCurrency.UYU).toBe(1000);
  });

  it("excludes pre-2026 invoices with zero balance from excludedHistorical", () => {
    const report = run([
      inv({ id: "i1", issue_date: "2025-12-31", total_amount: 1000, balance_amount: 0 }),
    ]);
    expect(report.excludedHistorical.invoiceCount).toBe(0);
  });

  it("excludes pre-2026 invoices with unknown currency from excludedHistorical", () => {
    const report = run([
      inv({ id: "i1", issue_date: "2025-12-31", total_amount: 1000, balance_amount: 500, currency_code: null }),
    ]);
    expect(report.excludedHistorical.invoiceCount).toBe(0);
  });

  it("excludedHistorical is computed regardless of report mode", () => {
    const invoices = [
      inv({ id: "i1", issue_date: "2025-12-31", total_amount: 1000, balance_amount: 500 }),
      inv({ id: "i2", issue_date: "2026-01-10", total_amount: 2000, balance_amount: 2000 }),
    ];
    // all_outstanding
    const rAll = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      companies: [],
      syncStates: [],
      now: NOW,
      mode: "all_outstanding",
    });
    // period_only 2026+
    const rPeriod = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      companies: [],
      syncStates: [],
      now: NOW,
      mode: "period_only",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    // Same excludedHistorical regardless of mode
    expect(rAll.excludedHistorical.invoiceCount).toBe(1);
    expect(rPeriod.excludedHistorical.invoiceCount).toBe(1);
    expect(rAll.excludedHistorical.pendingByCurrency.UYU).toBe(500);
    expect(rPeriod.excludedHistorical.pendingByCurrency.UYU).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Default mode and period_only operational defaults
// ---------------------------------------------------------------------------

describe("period_only mode with operational start date", () => {
  it("excludes pre-2026 invoices in period_only mode from currencies totals", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({ id: "i1", issue_date: "2025-12-31", total_amount: 5000, balance_amount: 5000 }),
        inv({ id: "i2", issue_date: "2026-01-10", total_amount: 2000, balance_amount: 2000 }),
      ],
      companies: [],
      syncStates: [],
      now: NOW,
      mode: "period_only",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    // Only i2 should be in totals
    expect(report.currencies[0]?.totalPending).toBe(2000);
    expect(report.totalInvoices).toBe(1);
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(1);
  });

  it("all_outstanding includes pre-2026 invoices in totals", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({ id: "i1", issue_date: "2025-12-31", total_amount: 5000, balance_amount: 5000 }),
        inv({ id: "i2", issue_date: "2026-01-10", total_amount: 2000, balance_amount: 2000 }),
      ],
      companies: [],
      syncStates: [],
      now: NOW,
      mode: "all_outstanding",
    });
    expect(report.currencies[0]?.totalPending).toBe(7000);
    expect(report.totalInvoices).toBe(2);
  });
});
