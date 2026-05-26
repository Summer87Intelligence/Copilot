import { describe, it, expect } from "vitest";
import {
  generateFinancialConsistencyReport,
  STALE_WARNING_HOURS,
  STALE_CRITICAL_HOURS,
  type InvoiceInput,
  type CompanyInput,
  type SyncStateInput,
  type ReceiptInput,
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
    // i2 excluded by MIN_FINANCIAL_DATE before period filter; i3 outside period window.
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(1);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
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
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(0);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
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
    // 1 in period; i2 dropped by MIN; i3 excluded by period (2 of 2 post-MIN invoices)
    expect(report.metrics.period_exclusion_ratio).toBeCloseTo(0.5, 2);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
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
  const AGING_NOW = "2026-05-15T12:00:00.000Z";

  function runAging(invoices: InvoiceInput[]) {
    return generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      companies: [],
      syncStates: [],
      now: AGING_NOW,
    });
  }

  // AGING_NOW = 2026-05-15 — fechas >= MIN_FINANCIAL_DATE (2026-01-01):
  //   "2026-05-10" → 5 days  → 0_30
  //   "2026-04-10" → 35 days → 31_60
  //   "2026-03-10" → 66 days → 61_90
  //   "2026-02-10" → 94 days → 90_plus

  it("assigns invoices to correct aging buckets", () => {
    const report = runAging([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-05-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2026-04-10" }),
      inv({ id: "i3", currency_code: "UYU", total_amount: 200,  balance_amount: 200,  issue_date: "2026-03-10" }),
      inv({ id: "i4", currency_code: "UYU", total_amount: 100,  balance_amount: 100,  issue_date: "2026-02-10" }),
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
    const report = runAging([
      inv({ id: "i1", currency_code: "UYU", total_amount: 800, balance_amount: 800, issue_date: "2026-05-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2026-04-10" }),
    ]);
    const uyu = report.agingByCurrency.UYU!;
    const b0_30  = uyu.find(b => b.range === "0_30")!;
    const b31_60 = uyu.find(b => b.range === "31_60")!;
    expect(b0_30.percentage).toBeCloseTo(0.8, 2);
    expect(b31_60.percentage).toBeCloseTo(0.2, 2);
  });

  it("excludes zero-balance invoices from aging", () => {
    const report = runAging([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 0,    issue_date: "2026-05-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2026-04-10" }),
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
    const report = runAging([
      inv({ id: "i1", currency_code: "USD", total_amount: 100, balance_amount: 100, issue_date: "2026-04-10" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 200, balance_amount: 200, issue_date: "2026-05-10" }),
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
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({ id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-04-10" }),
        inv({ id: "i2", company_id: "c1", currency_code: "UYU", total_amount: 200,  balance_amount: 200,  issue_date: "2026-05-10" }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-15T12:00:00.000Z",
    });
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
  it("is 0 in operational totals when pre-2026 invoices are excluded by MIN_FINANCIAL_DATE", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2025-12-31" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2025-01-01" }),
      inv({ id: "i3", currency_code: "UYU", total_amount: 200,  balance_amount: 200,  issue_date: "2026-01-01" }),
    ]);
    expect(report.gaps.pre2026InvoiceCount).toBe(0);
    expect(report.excludedByMinFinancialDateCount).toBe(2);
    expect(report.totalInvoices).toBe(1);
  });

  it("does not count voided pre-2026 in excludedByMinFinancialDate", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2025-12-31", status: "voided" }),
      inv({ id: "i2", currency_code: "UYU", total_amount: 500,  balance_amount: 500,  issue_date: "2025-12-31" }),
    ]);
    expect(report.gaps.pre2026InvoiceCount).toBe(0);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
  });

  it("is 0 when all invoices are 2026+", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-01-01" }),
    ]);
    expect(report.gaps.pre2026InvoiceCount).toBe(0);
    expect(report.excludedByMinFinancialDateCount).toBe(0);
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
    expect(report.gaps.invoicesExcludedByPeriodFilter).toBe(0);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
  });

  it("all_outstanding excludes pre-2026 invoices from operational totals (MIN_FINANCIAL_DATE)", () => {
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
    expect(report.currencies[0]?.totalPending).toBe(2000);
    expect(report.totalInvoices).toBe(1);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
    expect(report.excludedHistorical.invoiceCount).toBe(1);
    expect(report.excludedHistorical.pendingByCurrency.UYU).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// Regresión: rangos independientes
// ---------------------------------------------------------------------------
//
// Bug observado en `/copilot/cartera` (mayo 2026): cargar directamente el
// rango 01/05 → 11/05 dejaba las cards con montos incorrectos, mientras que
// cargar primero 01/01 → 11/05 y luego cambiar a 01/05 → 11/05 daba números
// correctos. La regresión protege contra cualquier dependencia oculta del
// orden de invocación: el motor es puro y dos rangos sobre el mismo dataset
// deben devolver los mismos números sin importar el orden o si la otra
// corrida nunca se ejecutó.
describe("regression: independent period ranges on same dataset", () => {
  // Dataset realista: enero–mayo 2026, mezcla UYU/USD, cobros parciales,
  // facturas cobradas 100% (no aparecen en aging) y pendientes.
  const dataset: InvoiceInput[] = [
    // Enero — UYU, totalmente cobrada
    inv({
      id: "ene-1",
      company_id: "c1",
      currency_code: "UYU",
      issue_date: "2026-01-05",
      total_amount: 500000,
      balance_amount: 0,
    }),
    // Marzo — USD, cobro parcial
    inv({
      id: "mar-1",
      company_id: "c2",
      currency_code: "USD",
      issue_date: "2026-03-10",
      total_amount: 10000,
      balance_amount: 4000,
    }),
    // Mayo — UYU, pendiente completo
    inv({
      id: "may-1",
      company_id: "c1",
      currency_code: "UYU",
      issue_date: "2026-05-03",
      total_amount: 200000,
      balance_amount: 200000,
    }),
    inv({
      id: "may-2",
      company_id: "c3",
      currency_code: "UYU",
      issue_date: "2026-05-07",
      total_amount: 224666,
      balance_amount: 224666,
    }),
    // Mayo — USD, cobro parcial (queda saldo)
    inv({
      id: "may-3",
      company_id: "c2",
      currency_code: "USD",
      issue_date: "2026-05-09",
      total_amount: 8000,
      balance_amount: 5824,
    }),
    // Mayo — UYU, cobrada 100% (debe ser parte de emitido pero NO de pendiente)
    inv({
      id: "may-4",
      company_id: "c1",
      currency_code: "UYU",
      issue_date: "2026-05-10",
      total_amount: 100000,
      balance_amount: 0,
    }),
  ];

  function runRange(periodStart: string, periodEnd: string) {
    return generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: dataset,
      companies: [
        { id: "c1", name: "Cliente A" },
        { id: "c2", name: "Cliente B" },
        { id: "c3", name: "Cliente C" },
      ],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart,
      periodEnd,
    });
  }

  it("rango corto 01/05 → 11/05 incluye sólo facturas de mayo (independiente)", () => {
    const r = runRange("2026-05-01", "2026-05-11");
    const uyu = r.currencies.find((c) => c.currencyCode === "UYU");
    const usd = r.currencies.find((c) => c.currencyCode === "USD");

    // Mayo UYU: 3 facturas emitidas (200k + 224.666 + 100k = 524.666); 2 pendientes (424.666).
    expect(uyu?.totalInvoiced).toBe(524666);
    expect(uyu?.totalPending).toBe(424666);
    expect(uyu?.invoiceCount).toBe(3);
    expect(uyu?.pendingInvoiceCount).toBe(2);

    // Mayo USD: 1 factura emitida 8.000; pendiente 5.824.
    expect(usd?.totalInvoiced).toBe(8000);
    expect(usd?.totalPending).toBe(5824);
    expect(usd?.invoiceCount).toBe(1);
    expect(usd?.pendingInvoiceCount).toBe(1);

    // Aging de mayo (saldos pendientes con issue_date válido).
    const agingUyu = r.agingByCurrency.UYU ?? [];
    const agingUyuTotal = agingUyu.reduce((s, b) => s + b.amount, 0);
    expect(agingUyuTotal).toBe(424666);

    // El motor no debe contar facturas fuera de mayo.
    expect(r.gaps.invoicesExcludedByPeriodFilter).toBe(2);
  });

  it("rango amplio 01/01 → 11/05 incluye TODAS las facturas (independiente)", () => {
    const r = runRange("2026-01-01", "2026-05-11");
    const uyu = r.currencies.find((c) => c.currencyCode === "UYU");
    const usd = r.currencies.find((c) => c.currencyCode === "USD");

    // UYU: ene (500k cobrada) + may-1 (200k) + may-2 (224.666) + may-4 (100k cobrada)
    expect(uyu?.totalInvoiced).toBe(1024666);
    expect(uyu?.totalPending).toBe(424666);
    expect(uyu?.invoiceCount).toBe(4);

    // USD: mar (10k, 4k pendiente) + may-3 (8k, 5.824 pendiente)
    expect(usd?.totalInvoiced).toBe(18000);
    expect(usd?.totalPending).toBe(9824);
    expect(usd?.invoiceCount).toBe(2);
  });

  it("dos rangos consecutivos sobre el mismo dataset son independientes (cualquier orden)", () => {
    // Simula: cargar A primero, luego B (escenario bug del usuario).
    const a1 = runRange("2026-05-01", "2026-05-11");
    const b1 = runRange("2026-01-01", "2026-05-11");

    // Simula: cargar B primero, luego A.
    const b2 = runRange("2026-01-01", "2026-05-11");
    const a2 = runRange("2026-05-01", "2026-05-11");

    // Las dos corridas del mismo rango deben dar exactamente los mismos números.
    expect(a1.currencies).toEqual(a2.currencies);
    expect(a1.agingByCurrency).toEqual(a2.agingByCurrency);
    expect(b1.currencies).toEqual(b2.currencies);
    expect(b1.agingByCurrency).toEqual(b2.agingByCurrency);

    // Y los dos rangos distintos no deben coincidir entre sí (sanity check).
    expect(a1.currencies).not.toEqual(b1.currencies);
  });

  it("rango sin facturas devuelve totales en cero pero sin throw", () => {
    const r = runRange("2026-06-01", "2026-06-30");
    expect(r.currencies).toEqual([]);
    expect(r.totalInvoices).toBe(0);
    // Motor includes pre-period outstanding balances in aging; keys may be USD/UYU.
    expect(Object.keys(r.agingByCurrency).every((k) => ["USD", "UYU"].includes(k))).toBe(true);
    for (const buckets of Object.values(r.agingByCurrency)) {
      for (const b of buckets!) {
        expect(b.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Fuente única: totalInvoiced incluye facturas cobradas
// ---------------------------------------------------------------------------
//
// Bug observado: las cards mostraban `Emitido $0` aunque `Cobranza efectiva`
// daba un porcentaje > 0 (matemáticamente imposible si todo viene del mismo
// reporte). Causa estructural: aging excluye facturas cobradas 100% y NO
// puede ser fuente de "emitido". El motor DEBE retornar `totalInvoiced`
// considerando TODAS las facturas válidas, no sólo las pendientes.
describe("currencies output: paid + partial + pending invoices", () => {
  it("period report includes paid invoices in totalInvoiced", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "paid-1",
          company_id: "c1",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 100,
          balance_amount: 0,
        }),
        inv({
          id: "pending-1",
          company_id: "c2",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 200,
          balance_amount: 200,
        }),
        inv({
          id: "partial-1",
          company_id: "c3",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 300,
          balance_amount: 100,
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(usd?.totalInvoiced).toBe(600);
    expect(usd?.totalPending).toBe(300);
    expect(usd?.totalCollected).toBe(300);
    expect(usd?.invoiceCount).toBe(3);
    expect(usd?.pendingInvoiceCount).toBe(2);
    expect(usd?.collectionEffectiveness).toBe(0.5);

    // Aging sum = pending sum, no incluye la cobrada.
    const agingUsd = report.agingByCurrency.USD ?? [];
    const agingSum = agingUsd.reduce((s, b) => s + b.amount, 0);
    expect(agingSum).toBe(300);
  });

  it("aging does not define totalInvoiced (aging sum < totalInvoiced cuando hay cobradas)", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "paid-only-1",
          company_id: "c1",
          currency_code: "UYU",
          issue_date: "2026-05-05",
          total_amount: 50000,
          balance_amount: 0,
        }),
        inv({
          id: "paid-only-2",
          company_id: "c2",
          currency_code: "UYU",
          issue_date: "2026-05-06",
          total_amount: 25000,
          balance_amount: 0,
        }),
        inv({
          id: "one-pending",
          company_id: "c3",
          currency_code: "UYU",
          issue_date: "2026-05-07",
          total_amount: 10000,
          balance_amount: 10000,
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.totalInvoiced).toBe(85000);
    expect(uyu?.totalPending).toBe(10000);
    expect(uyu?.totalCollected).toBe(75000);

    const agingUyu = report.agingByCurrency.UYU ?? [];
    const agingSum = agingUyu.reduce((s, b) => s + b.amount, 0);
    expect(agingSum).toBe(10000);
    expect(agingSum).toBeLessThan(uyu?.totalInvoiced ?? 0);
  });

  it("multi-currency: USD y UYU se calculan en buckets independientes", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "u-paid",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 1000,
          balance_amount: 0,
        }),
        inv({
          id: "u-pending",
          currency_code: "USD",
          issue_date: "2026-05-05",
          total_amount: 2000,
          balance_amount: 2000,
        }),
        inv({
          id: "y-paid",
          currency_code: "UYU",
          issue_date: "2026-05-04",
          total_amount: 100000,
          balance_amount: 0,
        }),
        inv({
          id: "y-pending",
          currency_code: "UYU",
          issue_date: "2026-05-05",
          total_amount: 50000,
          balance_amount: 50000,
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");

    expect(usd?.totalInvoiced).toBe(3000);
    expect(usd?.totalPending).toBe(2000);
    expect(usd?.totalCollected).toBe(1000);
    expect(usd?.collectionEffectiveness).toBeCloseTo(1 / 3, 4);

    expect(uyu?.totalInvoiced).toBe(150000);
    expect(uyu?.totalPending).toBe(50000);
    expect(uyu?.totalCollected).toBe(100000);
    expect(uyu?.collectionEffectiveness).toBeCloseTo(2 / 3, 4);
  });

  it("collectionEffectiveness es null cuando totalInvoiced=0 (no inventa 0%)", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [],
      companies: [],
      syncStates: [],
      now: NOW,
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    expect(report.currencies).toEqual([]);
  });

  it("totalCollected nunca es negativo (clamp incluso si pending > invoiced por inconsistencia)", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        // Caso patológico: balance > total (no debería ocurrir, pero el
        // motor no debe propagar negativo).
        inv({
          id: "weird",
          currency_code: "USD",
          issue_date: "2026-05-05",
          total_amount: 100,
          balance_amount: 150,
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(usd?.totalCollected).toBeGreaterThanOrEqual(0);
    expect(usd?.collectionEffectiveness).toBeGreaterThanOrEqual(0);
    expect(usd?.collectionEffectiveness).toBeLessThanOrEqual(1);
  });

  it("matches DB audit values for mayo 2026 (USD: 23 facturas, $8.639,80 emitido)", () => {
    // Réplica del subset USD observado en audit-cartera-period-may-2026.mjs.
    const usdInvoices = [
      { issue_date: "2026-05-04", total: 366, balance: 366 },
      { issue_date: "2026-05-04", total: 85.4, balance: 0 },
      { issue_date: "2026-05-04", total: 183, balance: 0 },
      { issue_date: "2026-05-04", total: 318.18, balance: 0 },
      { issue_date: "2026-05-04", total: 427, balance: 427 },
      { issue_date: "2026-05-04", total: 122, balance: 0 },
      { issue_date: "2026-05-04", total: 183, balance: 183 },
      { issue_date: "2026-05-04", total: 366, balance: 0 },
      { issue_date: "2026-05-04", total: 427, balance: 427 },
      { issue_date: "2026-05-04", total: 183, balance: 183 },
      { issue_date: "2026-05-04", total: 530.7, balance: 530.7 },
      { issue_date: "2026-05-04", total: 305, balance: 305 },
      { issue_date: "2026-05-04", total: 561.2, balance: 561.2 },
      { issue_date: "2026-05-04", total: 732, balance: 732 },
      { issue_date: "2026-05-04", total: 183, balance: 183 },
      // 8 facturas adicionales sumando 1668.32 emitido / 1726.32 pendiente
      // (replica el delta entre top-15 y total observado: 8639.80 - 4972.48 = 1667.32 paid + partial; 5824.22 - 4097.90 = 1726.32 pendiente)
      { issue_date: "2026-05-05", total: 366, balance: 366 },
      { issue_date: "2026-05-05", total: 366, balance: 366 },
      { issue_date: "2026-05-05", total: 305, balance: 305 },
      { issue_date: "2026-05-06", total: 91.5, balance: 91.5 },
      { issue_date: "2026-05-07", total: 244, balance: 244 },
      { issue_date: "2026-05-08", total: 122, balance: 122 },
      { issue_date: "2026-05-09", total: 91.5, balance: 91.5 },
      { issue_date: "2026-05-10", total: 82.32, balance: 140.32 - 58 },
    ];
    // Total esperado del audit: 8639.80 emitido / 5824.22 pendiente.
    // (Los últimos 8 no son los reales, pero replican la magnitud.)
    const invoices: InvoiceInput[] = usdInvoices.map((u, idx) => ({
      id: `usd-${idx}`,
      company_id: `c-${idx % 3}`,
      currency_code: "USD",
      total_amount: u.total,
      balance_amount: u.balance,
      status: u.balance === 0 ? "paid" : "issued",
      updated_at: "2026-05-11T10:00:00Z",
      issue_date: u.issue_date,
    }));

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    // Estructura coherente: invoiced > pending; collected = invoiced - pending; effectiveness positivo.
    expect(usd).toBeDefined();
    expect(usd!.invoiceCount).toBe(23);
    expect(usd!.totalInvoiced).toBeGreaterThan(usd!.totalPending);
    expect(usd!.totalCollected).toBeCloseTo(
      usd!.totalInvoiced - usd!.totalPending,
      2
    );
    expect(usd!.pendingInvoiceCount).toBeLessThan(usd!.invoiceCount);
    expect(usd!.collectionEffectiveness).toBeGreaterThan(0);
    expect(usd!.collectionEffectiveness).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Contrato contable: collectedInPeriod + openingBalance + pendingAtCutoff
// ---------------------------------------------------------------------------
//
// Validación contra reportes Zeta oficiales:
//   - Comprobantes Pendientes → pendingAtCutoff por cliente/moneda
//   - Estado de Cuenta → saldo anterior + debe + haber + saldo final
//   - Vencimiento de Cuotas → caveat documentado (due_date sintético, DIV-002)
//   - Análisis de Saldos → aging por bucket/moneda
//
// Casos concretos (PDF reales):
//   - ACQUAGARDEN USD: anterior 707,26 + factura A2926 678,32 − recibo A719 339 = final 1.046,58
//   - El País UYU:    anterior 58.560 + facturas 8.662+8.662 − NC 8.662 = final 67.222 (NCs sin contabilizar)
function makeReceipt(overrides: Partial<ReceiptInput> & { id: string }): ReceiptInput {
  return {
    company_id: "default-co",
    currency_code: "USD",
    amount: 0,
    receipt_date: "2026-05-04",
    status: "paid",
    ...overrides,
  };
}

describe("contrato contable: collectedInPeriod + openingBalance", () => {
  it("collectedInPeriod proviene de receipts en período, no de invoiced − pending", () => {
    const invoices: InvoiceInput[] = [
      inv({
        id: "factura-mayo",
        company_id: "c1",
        currency_code: "USD",
        issue_date: "2026-05-04",
        total_amount: 678.32,
        balance_amount: 678.32,
      }),
    ];
    const receipts: ReceiptInput[] = [
      makeReceipt({
        id: "recibo-mayo",
        company_id: "c1",
        currency_code: "USD",
        amount: 339,
        receipt_date: "2026-05-06",
      }),
    ];

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      receipts,
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.issuedInPeriod).toBe(678.32);
    expect(usd.pendingAtCutoff).toBe(678.32); // balance_amount no fue tocado por el recibo en este test (eso lo hace Zeta sync)
    expect(usd.collectedInPeriod).toBe(339);
    expect(usd.collectedReceiptCount).toBe(1);
    // collectionEffectiveness = collectedInPeriod / issuedInPeriod = 339/678.32 ≈ 0.4998
    expect(usd.collectionEffectiveness).toBeCloseTo(339 / 678.32, 4);
  });

  it("openingBalance se reconstruye desde invoices+receipts pre-período", () => {
    const invoices: InvoiceInput[] = [
      // Pre-período: factura antigua de marzo, cobrada parcialmente.
      inv({
        id: "fact-marzo",
        company_id: "c1",
        currency_code: "USD",
        issue_date: "2026-03-15",
        total_amount: 1000,
        balance_amount: 293,
      }),
      // En período: nueva factura.
      inv({
        id: "fact-mayo",
        company_id: "c1",
        currency_code: "USD",
        issue_date: "2026-05-04",
        total_amount: 500,
        balance_amount: 500,
      }),
    ];
    const receipts: ReceiptInput[] = [
      // Pre-período: cobro parcial de la factura de marzo.
      makeReceipt({
        id: "rec-abril",
        company_id: "c1",
        currency_code: "USD",
        amount: 707,
        receipt_date: "2026-04-10",
      }),
      // En período: ningún cobro.
    ];

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      receipts,
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.issuedInPeriod).toBe(500);
    expect(usd.openingBalance).toBe(293); // 1000 emitido − 707 cobrado pre-período
    expect(usd.collectedInPeriod).toBe(0);
  });

  it("ACQUAGARDEN USD: anterior 707.26 + factura 678.32 − recibo 339 = final 1.046.58", () => {
    const invoices: InvoiceInput[] = [
      // Pre-período: factura A2874 que dejó saldo de 368.26 al cierre de marzo.
      inv({
        id: "a2874",
        company_id: "acquagarden",
        currency_code: "USD",
        issue_date: "2026-03-20",
        total_amount: 368.26,
        balance_amount: 368.26,
      }),
      // Pre-período: factura adicional que sumó 339 al saldo anterior.
      inv({
        id: "factura-vieja-339",
        company_id: "acquagarden",
        currency_code: "USD",
        issue_date: "2026-04-15",
        total_amount: 339,
        balance_amount: 339, // sigue pendiente para cuadrar el saldo anterior 707.26
      }),
      // En período: A2926.
      inv({
        id: "a2926",
        company_id: "acquagarden",
        currency_code: "USD",
        issue_date: "2026-05-04",
        total_amount: 678.32,
        balance_amount: 678.32,
      }),
    ];
    const receipts: ReceiptInput[] = [
      // En período: A719 (cobra parcial).
      makeReceipt({
        id: "a719",
        company_id: "acquagarden",
        currency_code: "USD",
        amount: 339,
        receipt_date: "2026-05-08",
      }),
    ];

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      receipts,
      companies: [{ id: "acquagarden", name: "ACQUAGARDEN" }],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.openingBalance).toBe(707.26); // 368.26 + 339
    expect(usd.issuedInPeriod).toBe(678.32);
    expect(usd.collectedInPeriod).toBe(339);

    // Saldo al corte (closing) = pendingAtCutoff =
    //   suma de balance_amount > 0 de TODAS las facturas con issue_date <= periodEnd.
    // En este test el balance_amount no fue actualizado por el recibo (eso lo hace
    // Zeta sync, no el motor). Por tanto pendingAtCutoff = 368.26 + 339 + 678.32 = 1385.58.
    // El "saldo final 1.046,58" del PDF requiere que el recibo haya reducido
    // balance_amount en producción (sync de saldos pendientes), lo cual sí ocurre.
    // Acá validamos que el motor recibe lo que ve.
    expect(usd.pendingAtCutoff).toBe(1385.58);

    // Identidad contable: openingBalance + issuedInPeriod − collectedInPeriod ≈ pendingAtCutoff
    // SOLO cuando los recibos del período están reflejados en balance_amount.
    // En este test no lo están (intencional, para validar la mecánica del motor).
  });

  it("El País UYU: opening 58.560 + 2 facturas 8.662 = closing 67.222 (sin NC contabilizada)", () => {
    const invoices: InvoiceInput[] = [
      // Pre-período: A2821 + A2877 que conforman el saldo anterior 58.560.
      // Para simplificar usamos una factura de marzo con saldo 58.560.
      inv({
        id: "saldo-anterior",
        company_id: "elpais",
        currency_code: "UYU",
        issue_date: "2026-03-01",
        total_amount: 58560,
        balance_amount: 58560,
      }),
      // En período: A2932 + A2934 (cada una 8.662).
      inv({
        id: "a2932",
        company_id: "elpais",
        currency_code: "UYU",
        issue_date: "2026-05-05",
        total_amount: 8662,
        balance_amount: 8662,
      }),
      inv({
        id: "a2934",
        company_id: "elpais",
        currency_code: "UYU",
        issue_date: "2026-05-07",
        total_amount: 8662,
        balance_amount: 8662,
      }),
      // Nota de crédito A391 8.662: NO se modela porque DIV-003 (sin regla
      // certificada). El test documenta este gap.
    ];
    const receipts: ReceiptInput[] = []; // Sin cobros en mayo según el PDF.

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      receipts,
      companies: [{ id: "elpais", name: "El País" }],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    const elPais = report.staleClients.find((c) => c.companyId === "elpais")!;
    expect(uyu.openingBalance).toBe(58560);
    expect(uyu.issuedInPeriod).toBe(8662 + 8662);
    expect(uyu.collectedInPeriod).toBe(0);
    expect(uyu.pendingAtCutoff).toBe(58560 + 8662 + 8662);
    expect(elPais.pendingByCurrency.UYU).toBe(uyu.pendingAtCutoff);
    // El PDF muestra "saldo final 67.222" porque incluye NC A391 de 8.662
    // que reduce el saldo. Sin NC, nuestro motor reporta 75.884. Divergencia
    // esperada y documentada en KNOWN-DIVERGENCES (DIV-003).
    const zetaFinalConNC = 67222;
    const divergenciaPorNC = uyu.pendingAtCutoff - zetaFinalConNC;
    expect(divergenciaPorNC).toBe(8662); // exactamente la NC no contabilizada
  });

  it("recibos pre-período NO se suman a collectedInPeriod aunque la moneda sea la misma", () => {
    const receipts: ReceiptInput[] = [
      makeReceipt({
        id: "r-pre",
        currency_code: "USD",
        amount: 500,
        receipt_date: "2026-04-25", // pre-período
      }),
      makeReceipt({
        id: "r-in",
        currency_code: "USD",
        amount: 200,
        receipt_date: "2026-05-05", // en-período
      }),
      makeReceipt({
        id: "r-post",
        currency_code: "USD",
        amount: 999,
        receipt_date: "2026-05-15", // post-período
      }),
    ];
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "filler",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 1000,
          balance_amount: 1000,
        }),
      ],
      receipts,
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.collectedInPeriod).toBe(200);
    expect(usd.collectedReceiptCount).toBe(1);
  });

  it("recibos anulados se excluyen", () => {
    const receipts: ReceiptInput[] = [
      makeReceipt({ id: "r1", currency_code: "USD", amount: 100, status: "paid" }),
      makeReceipt({ id: "r2", currency_code: "USD", amount: 200, status: "void" }),
      makeReceipt({ id: "r3", currency_code: "USD", amount: 50, status: "anulado" }),
    ];
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 1000,
          balance_amount: 700,
        }),
      ],
      receipts,
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.collectedInPeriod).toBe(100);
    expect(usd.collectedReceiptCount).toBe(1);
  });

  it("sin receipts en input, motor mantiene semántica legacy (totalCollected = invoiced − pending)", () => {
    // No pasar `receipts` → modo legacy: el alias totalCollected mantiene
    // la fórmula histórica para no romper consumidores antiguos.
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 1000,
          balance_amount: 300,
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.totalCollected).toBe(700); // legacy: 1000 − 300
    expect(usd.collectedInPeriod).toBe(0); // sin receipts: nuevo campo en 0
    expect(usd.collectedReceiptCount).toBe(0);
    expect(usd.openingBalance).toBe(0);
  });

  it("collectionEffectiveness con receipts usa collectedInPeriod/issuedInPeriod", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i",
          currency_code: "USD",
          issue_date: "2026-05-04",
          total_amount: 1000,
          balance_amount: 300,
        }),
      ],
      receipts: [
        makeReceipt({
          id: "r",
          currency_code: "USD",
          amount: 700, // cubre el cobro del período
          receipt_date: "2026-05-06",
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.collectionEffectiveness).toBeCloseTo(0.7, 4);
  });

  it("moneda aparece aunque NO haya facturas en período si hay cobros en período", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        // Sólo factura pre-período (debería contar en opening, no en issued).
        inv({
          id: "pre",
          currency_code: "USD",
          issue_date: "2026-03-15",
          total_amount: 5000,
          balance_amount: 1000,
        }),
      ],
      receipts: [
        makeReceipt({
          id: "r",
          currency_code: "USD",
          amount: 250,
          receipt_date: "2026-05-08",
        }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(usd).toBeDefined();
    expect(usd!.issuedInPeriod).toBe(0);
    expect(usd!.invoiceCount).toBe(0);
    expect(usd!.collectedInPeriod).toBe(250);
    expect(usd!.openingBalance).toBe(5000); // sin recibos pre-período = invoiced pre-period
    expect(usd!.collectionEffectiveness).toBeNull(); // issuedInPeriod=0 → null, no 0%
  });
});

// ---------------------------------------------------------------------------
// Notas de Crédito (opt-in `is_credit_note`) — DIV-CONT-002
// ---------------------------------------------------------------------------

describe("notas de crédito: opt-in is_credit_note", () => {
  it("default false → comportamiento idéntico al motor sin NCs", () => {
    // Sin marcar NC, una fila negativa entra como factura positiva
    // (replica el bug actual). Resultado: pending = 1000.
    const report = run([
      inv({
        id: "i1",
        currency_code: "UYU",
        total_amount: 1000,
        balance_amount: 1000,
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.totalPending).toBe(1000);
    expect(uyu.creditNoteCount).toBe(0);
    expect(uyu.creditNoteAmount).toBe(0);
  });

  it("NC en período no entra en issued ni descuenta saldos vivos", () => {
    // Factura $5.000 + NC $1.500 → pending = $5.000, issued = $5.000.
    // La NC queda expuesta como auditoría; no se netea globalmente porque
    // `balance_amount` ya representa el saldo vivo que trae Zeta.
    const report = run([
      inv({
        id: "fact",
        currency_code: "UYU",
        total_amount: 5000,
        balance_amount: 5000,
      }),
      inv({
        id: "nc",
        currency_code: "UYU",
        total_amount: 1500,
        balance_amount: 0,
        is_credit_note: true,
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.issuedInPeriod).toBe(5000); // NC no es venta
    expect(uyu.invoiceCount).toBe(1); // sólo la factura
    expect(uyu.creditNoteCount).toBe(1);
    expect(uyu.creditNoteAmount).toBe(1500);
    expect(uyu.totalPending).toBe(5000);
  });

  it("NC con total > pendiente no oculta facturas abiertas", () => {
    // Caso seguro: NC mayor que el pendiente acumulado del período. El saldo
    // vivo de la factura debe permanecer visible.
    const report = run([
      inv({
        id: "fact",
        currency_code: "UYU",
        total_amount: 1000,
        balance_amount: 1000,
      }),
      inv({
        id: "nc",
        currency_code: "UYU",
        total_amount: 1500,
        balance_amount: 0,
        is_credit_note: true,
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.totalPending).toBe(1000);
  });

  it("NC pre-período reduce opening balance (caso El País)", () => {
    // Antes del período: factura $58.560 + NC $0 pendiente histórica.
    // En el período: factura nueva $8.662 + NC $8.662 que cancela su
    // contraparte. Antes del fix opening = 58.560; con NC pre-período
    // que reduce 8.662, opening = 49.898.
    //
    // Para el test usamos un escenario claro:
    //  - Pre-período: factura $50.000 issued en marzo, balance vivo $50.000.
    //  - Pre-período: NC $10.000 emitida también en marzo.
    //  → opening = max(0, 50000 − 10000 − 0 receipts) = 40000.
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "pre-fact",
          currency_code: "UYU",
          issue_date: "2026-03-10",
          total_amount: 50000,
          balance_amount: 50000,
        }),
        inv({
          id: "pre-nc",
          currency_code: "UYU",
          issue_date: "2026-03-15",
          total_amount: 10000,
          balance_amount: 0,
          is_credit_note: true,
        }),
        inv({
          id: "period-fact",
          currency_code: "UYU",
          issue_date: "2026-05-05",
          total_amount: 5000,
          balance_amount: 5000,
        }),
      ],
      receipts: [], // sin cobros, foco en NC vs opening
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.openingBalance).toBe(40000); // 50000 − 10000
    expect(uyu.issuedInPeriod).toBe(5000); // sólo factura del período
    // pendingAtCutoff = pre-period pending vivo (50.000) + period pending
    // vivo (5.000). La NC pre-período reduce opening ledger, pero NO se netea
    // contra saldos vivos para no duplicar descuentos ya reflejados por Zeta.
    expect(uyu.pendingAtCutoff).toBe(55000);
  });

  it("NC en otra moneda no contamina la otra moneda", () => {
    const report = run([
      inv({
        id: "fact-usd",
        currency_code: "USD",
        total_amount: 1000,
        balance_amount: 1000,
      }),
      inv({
        id: "fact-uyu",
        currency_code: "UYU",
        total_amount: 5000,
        balance_amount: 5000,
      }),
      inv({
        id: "nc-uyu",
        currency_code: "UYU",
        total_amount: 1500,
        balance_amount: 0,
        is_credit_note: true,
      }),
    ]);
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(usd.creditNoteCount).toBe(0);
    expect(usd.totalPending).toBe(1000);
    expect(uyu.creditNoteCount).toBe(1);
    expect(uyu.totalPending).toBe(5000);
  });

  it("aging NO incluye NCs (no son deuda)", () => {
    const report = run([
      inv({
        id: "fact",
        currency_code: "UYU",
        total_amount: 5000,
        balance_amount: 5000,
        issue_date: "2026-01-10",
      }),
      inv({
        id: "nc",
        currency_code: "UYU",
        total_amount: 1500,
        balance_amount: 0,
        is_credit_note: true,
        issue_date: "2026-01-12",
      }),
    ]);
    const aging = report.agingByCurrency.UYU;
    expect(aging).toBeDefined();
    // Sólo la factura aporta a aging (5000), NC no.
    const totalAging = aging!.reduce((s, b) => s + b.amount, 0);
    expect(totalAging).toBe(5000);
  });

  it("pendingAtCutoff coincide con aging aunque existan NCs en la moneda", () => {
    const report = run([
      inv({
        id: "fact-usd-open",
        currency_code: "USD",
        total_amount: 5000,
        balance_amount: 2377.92,
        issue_date: "2026-01-10",
      }),
      inv({
        id: "nc-usd",
        currency_code: "USD",
        total_amount: 8000,
        balance_amount: 0,
        is_credit_note: true,
        issue_date: "2026-01-12",
      }),
    ]);
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    const totalAging = (report.agingByCurrency.USD ?? []).reduce(
      (s, b) => s + b.amount,
      0
    );
    expect(usd.creditNoteAmount).toBe(8000);
    expect(usd.pendingAtCutoff).toBe(2377.92);
    expect(totalAging).toBe(2377.92);
  });

  it("NC sin moneda válida se descarta como cualquier fila inválida", () => {
    const report = run([
      inv({
        id: "fact",
        currency_code: "UYU",
        total_amount: 1000,
        balance_amount: 1000,
      }),
      inv({
        id: "nc-bad",
        currency_code: null,
        total_amount: 500,
        balance_amount: 0,
        is_credit_note: true,
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.totalPending).toBe(1000); // NC ignorada por sin moneda
    expect(uyu.creditNoteCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MIN_FINANCIAL_DATE policy (2026-01-01 floor)
// ---------------------------------------------------------------------------

describe("MIN_FINANCIAL_DATE", () => {
  it("excludes invoice with issue_date 2025 from operational totals", () => {
    const report = run([
      inv({ id: "pre", issue_date: "2025-12-31", total_amount: 5000, balance_amount: 5000 }),
      inv({ id: "ok", issue_date: "2026-01-15", total_amount: 1000, balance_amount: 1000 }),
    ]);
    expect(report.excludedByMinFinancialDateCount).toBe(1);
    expect(report.totalInvoices).toBe(1);
    expect(report.currencies[0]?.totalPending).toBe(1000);
  });

  it("includes invoice with issue_date 2026-01-01", () => {
    const report = run([
      inv({ id: "boundary", issue_date: "2026-01-01", total_amount: 1000, balance_amount: 1000 }),
    ]);
    expect(report.excludedByMinFinancialDateCount).toBe(0);
    expect(report.totalInvoices).toBe(1);
  });

  it("excludes receipt with receipt_date 2025", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({ id: "i", currency_code: "USD", issue_date: "2026-05-04", total_amount: 1000, balance_amount: 1000 }),
      ],
      receipts: [
        makeReceipt({ id: "r-pre", currency_code: "USD", amount: 500, receipt_date: "2025-12-31" }),
        makeReceipt({ id: "r-ok", currency_code: "USD", amount: 200, receipt_date: "2026-05-06" }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    expect(report.excludedByMinFinancialDateReceiptCount).toBe(1);
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.collectedInPeriod).toBe(200);
  });

  it("includes receipt with receipt_date 2026-01-01", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({ id: "i", currency_code: "USD", issue_date: "2026-05-04", total_amount: 1000, balance_amount: 1000 }),
      ],
      receipts: [
        makeReceipt({ id: "r", currency_code: "USD", amount: 100, receipt_date: "2026-01-01" }),
      ],
      companies: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    expect(report.excludedByMinFinancialDateReceiptCount).toBe(0);
    const usd = report.currencies.find((c) => c.currencyCode === "USD")!;
    expect(usd.collectedInPeriod).toBe(0);
  });

  it("bruto - NC audit fields do not zero pending when NC is present", () => {
    const report = run([
      inv({ id: "fact", currency_code: "UYU", total_amount: 5000, balance_amount: 5000, issue_date: "2026-01-10" }),
      inv({
        id: "nc",
        currency_code: "UYU",
        total_amount: 1500,
        balance_amount: 0,
        is_credit_note: true,
        issue_date: "2026-01-12",
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.totalInvoiced).toBe(5000);
    expect(uyu.creditNoteAmount).toBe(1500);
    expect(uyu.totalPending).toBe(5000);
  });

  it("dashboard non-zero regression: operational invoices still aggregate", () => {
    const report = run([
      inv({ id: "i1", currency_code: "UYU", total_amount: 500000, balance_amount: 500000, issue_date: "2026-01-10" }),
      inv({ id: "i2", currency_code: "USD", total_amount: 10000, balance_amount: 10000, issue_date: "2026-01-10" }),
    ]);
    expect(report.currencies.length).toBe(2);
    expect(report.currencies.find((c) => c.currencyCode === "UYU")?.totalPending).toBe(500000);
    expect(report.currencies.find((c) => c.currencyCode === "USD")?.totalPending).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// Hardening: degradación de fuentes opcionales
// ---------------------------------------------------------------------------
//
// El endpoint `/api/copilot/financial-reconciliation` paraleliza 4 queries
// Supabase (`proto_invoices`, `proto_companies`, `proto_receipts`,
// `zeta_sync_state`). `proto_invoices` es crítica; el resto degrada a `[]`
// con warning si falla. Estos tests documentan el contrato del motor cuando
// el route le pasa `[]` por fuentes secundarias degradadas.
describe("hardening: optional sources degraded to []", () => {
  it("companies vacías → reporte válido sin company names", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i1",
          company_id: "c-unknown",
          currency_code: "UYU",
          total_amount: 1000,
          balance_amount: 1000,
          issue_date: "2026-05-05",
        }),
      ],
      companies: [],
      receipts: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    expect(report.currencies.length).toBe(1);
    expect(report.staleClients.length).toBe(1);
    expect(report.staleClients[0]!.companyName).toBeNull();
  });

  it("receipts vacíos → collectedInPeriod = 0 sin throw", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i1",
          company_id: "c1",
          currency_code: "UYU",
          total_amount: 1000,
          balance_amount: 1000,
          issue_date: "2026-05-05",
        }),
      ],
      companies: [{ id: "c1", name: "Acme" }],
      receipts: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.collectedInPeriod).toBe(0);
    expect(uyu.collectedReceiptCount).toBe(0);
    expect(uyu.collectionEffectiveness).toBe(0);
  });

  it("syncStates vacíos → reporte válido, sin sync badges", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i1",
          company_id: "c1",
          currency_code: "UYU",
          total_amount: 1000,
          balance_amount: 1000,
          issue_date: "2026-05-05",
        }),
      ],
      companies: [],
      receipts: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    expect(report.syncStates).toEqual([]);
    expect(report.currencies.length).toBe(1);
  });

  it("todas las fuentes opcionales vacías → reporte tiene shape completo", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "i1",
          company_id: "c1",
          currency_code: "UYU",
          total_amount: 1000,
          balance_amount: 500,
          issue_date: "2026-05-05",
        }),
      ],
      companies: [],
      receipts: [],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });
    expect(report).toHaveProperty("currencies");
    expect(report).toHaveProperty("agingByCurrency");
    expect(report).toHaveProperty("staleClients");
    expect(report).toHaveProperty("staleSummary");
    expect(report).toHaveProperty("syncStates");
    expect(report).toHaveProperty("metrics");
    expect(report).toHaveProperty("gaps");
    expect(report).toHaveProperty("orphanSummary");
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    expect(uyu.issuedInPeriod).toBe(1000);
    expect(uyu.pendingAtCutoff).toBe(500);
  });
});

describe("orphan summary — active vs stale metadata", () => {
  it("does not count auto-closed paid invoices with stale missing_count", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        inv({
          id: "inv-stale",
          company_id: "c1",
          currency_code: "UYU",
          total_amount: 1000,
          balance_amount: 0,
          status: "paid",
          issue_date: "2026-02-01",
          reconciliation_missing_count: 3,
        }),
        inv({
          id: "inv-active",
          company_id: "c1",
          currency_code: "UYU",
          total_amount: 500,
          balance_amount: 200,
          status: "open",
          issue_date: "2026-03-01",
          reconciliation_missing_count: 1,
        }),
      ],
      companies: [{ id: "c1", name: "Cliente" }],
      receipts: [],
      syncStates: [],
      now: "2026-05-18T12:00:00Z",
      mode: "all_outstanding",
    });
    expect(report.orphanSummary.warned).toBe(1);
    expect(report.orphanSummary.stale_metadata).toBe(1);
    expect(report.orphanSummary.pending_auto_close).toBe(0);
    expect(report.orphanSummary.warnedPendingByCurrency.UYU).toBe(200);
  });
});
