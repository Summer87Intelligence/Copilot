import { describe, expect, it } from "vitest";

import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CobranzaHistoryRow } from "@/lib/copilot-cobranza-history";

import {
  aggregateMonthCobros,
  computeActivePromises,
  computeClientsContacted,
  computeEffectivenessKpis,
  computeOverduePromises,
  computePromiseFulfillmentRate,
} from "./copilot-cobranza-effectiveness";

const TODAY = "2026-06-23";
const TOMORROW = "2026-06-24";
const YESTERDAY = "2026-06-22";

function makeAction(overrides: Partial<CollectionAction> = {}): CollectionAction {
  return {
    id: "a1",
    workspaceCompanyId: "ws",
    companyId: "c1",
    status: "pending_review",
    actionType: "call",
    priority: "medium",
    assignedTo: null,
    createdBy: null,
    dueDate: null,
    contactDate: null,
    nextActionDate: null,
    promiseDate: null,
    promiseAmount: null,
    promiseCurrency: null,
    notes: null,
    metadata: null,
    isActive: true,
    archivedAt: null,
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

function makePortfolioRow(overrides: Partial<ClientPortfolioRow> = {}): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Cliente A",
    industry: "retail",
    total_billing: 1000,
    total_debt: 500,
    overdue_debt: 200,
    invoices_count: 3,
    receipts_count: 1,
    share_pct: 10,
    payment_behavior: "medio",
    risk: "Medio",
    source: "zeta_invoice",
    has_contact_data: true,
    derived_from_debt: false,
    debt_uyu: 500,
    debt_usd: 0,
    ...overrides,
  };
}

function makeHistoryRow(overrides: Partial<CobranzaHistoryRow> = {}): CobranzaHistoryRow {
  return {
    id: "h1",
    fecha: "2026-06-10",
    clienteNombre: "Cliente A",
    monto: 100,
    moneda: "UYU",
    origen: "Zeta",
    referencia: null,
    registradoPor: "Manual",
    createdAt: "2026-06-10T10:00:00Z",
    ...overrides,
  };
}

// ── computeActivePromises ────────────────────────────────────────────────────

describe("computeActivePromises", () => {
  it("counts active promise with future date", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: TOMORROW })];
    expect(computeActivePromises(actions, TODAY)).toBe(1);
  });

  it("counts active promise with null date (open-ended)", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: null })];
    expect(computeActivePromises(actions, TODAY)).toBe(1);
  });

  it("counts active promise with today as date", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: TODAY })];
    expect(computeActivePromises(actions, TODAY)).toBe(1);
  });

  it("excludes past promise date", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: YESTERDAY })];
    expect(computeActivePromises(actions, TODAY)).toBe(0);
  });

  it("excludes inactive actions", () => {
    const actions = [makeAction({ status: "promised_payment", isActive: false, promiseDate: TOMORROW })];
    expect(computeActivePromises(actions, TODAY)).toBe(0);
  });

  it("excludes non-promise statuses", () => {
    const actions = [makeAction({ status: "contacted", promiseDate: TOMORROW })];
    expect(computeActivePromises(actions, TODAY)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(computeActivePromises([], TODAY)).toBe(0);
  });
});

// ── computeOverduePromises ───────────────────────────────────────────────────

describe("computeOverduePromises", () => {
  it("counts promise with past date still in promised_payment status", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: YESTERDAY })];
    expect(computeOverduePromises(actions, TODAY)).toBe(1);
  });

  it("excludes null promise date (open-ended, not overdue)", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: null })];
    expect(computeOverduePromises(actions, TODAY)).toBe(0);
  });

  it("excludes today as not yet overdue", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: TODAY })];
    expect(computeOverduePromises(actions, TODAY)).toBe(0);
  });

  it("excludes future promise date", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: TOMORROW })];
    expect(computeOverduePromises(actions, TODAY)).toBe(0);
  });

  it("excludes inactive actions", () => {
    const actions = [makeAction({ status: "promised_payment", isActive: false, promiseDate: YESTERDAY })];
    expect(computeOverduePromises(actions, TODAY)).toBe(0);
  });

  it("excludes paid actions", () => {
    const actions = [makeAction({ status: "paid", promiseDate: YESTERDAY })];
    expect(computeOverduePromises(actions, TODAY)).toBe(0);
  });
});

// ── computePromiseFulfillmentRate ────────────────────────────────────────────

describe("computePromiseFulfillmentRate", () => {
  it("returns null when no closed promises", () => {
    expect(computePromiseFulfillmentRate([], TODAY)).toBeNull();
  });

  it("returns null when only active future promises exist", () => {
    const actions = [makeAction({ status: "promised_payment", promiseDate: TOMORROW })];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBeNull();
  });

  it("returns 100 when all promises were kept", () => {
    const actions = [
      makeAction({ id: "a1", status: "paid", promiseDate: YESTERDAY }),
      makeAction({ id: "a2", status: "paid", promiseDate: "2026-06-10" }),
    ];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBe(100);
  });

  it("returns 0 when all promises are broken", () => {
    const actions = [
      makeAction({ id: "a1", status: "promised_payment", promiseDate: YESTERDAY }),
      makeAction({ id: "a2", status: "promised_payment", promiseDate: "2026-06-10" }),
    ];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBe(0);
  });

  it("returns 50 for one kept and one broken", () => {
    const actions = [
      makeAction({ id: "a1", status: "paid", promiseDate: YESTERDAY }),
      makeAction({ id: "a2", status: "promised_payment", promiseDate: YESTERDAY }),
    ];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBe(50);
  });

  it("rounds to nearest integer", () => {
    const actions = [
      makeAction({ id: "a1", status: "paid", promiseDate: YESTERDAY }),
      makeAction({ id: "a2", status: "paid", promiseDate: "2026-06-10" }),
      makeAction({ id: "a3", status: "promised_payment", promiseDate: YESTERDAY }),
    ];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBe(67);
  });

  it("excludes paid actions without promiseDate", () => {
    const actions = [makeAction({ status: "paid", promiseDate: null })];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBeNull();
  });

  it("excludes inactive actions", () => {
    const actions = [
      makeAction({ status: "paid", promiseDate: YESTERDAY, isActive: false }),
      makeAction({ status: "promised_payment", promiseDate: YESTERDAY, isActive: false }),
    ];
    expect(computePromiseFulfillmentRate(actions, TODAY)).toBeNull();
  });
});

// ── aggregateMonthCobros ─────────────────────────────────────────────────────

describe("aggregateMonthCobros", () => {
  it("sums UYU and USD separately", () => {
    const rows = [
      makeHistoryRow({ moneda: "UYU", monto: 1000 }),
      makeHistoryRow({ id: "h2", moneda: "USD", monto: 200 }),
      makeHistoryRow({ id: "h3", moneda: "UYU", monto: 500 }),
    ];
    const result = aggregateMonthCobros(rows);
    expect(result.uyu).toBe(1500);
    expect(result.usd).toBe(200);
    expect(result.count).toBe(3);
  });

  it("returns zeros for empty array", () => {
    const result = aggregateMonthCobros([]);
    expect(result.uyu).toBe(0);
    expect(result.usd).toBe(0);
    expect(result.count).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    const rows = [makeHistoryRow({ moneda: "UYU", monto: 10.555 })];
    const result = aggregateMonthCobros(rows);
    expect(result.uyu).toBe(10.56);
  });

  it("counts all rows regardless of moneda", () => {
    const rows = [
      makeHistoryRow({ id: "h1", moneda: "UYU", monto: 100 }),
      makeHistoryRow({ id: "h2", moneda: "USD", monto: 50 }),
    ];
    expect(aggregateMonthCobros(rows).count).toBe(2);
  });
});

// ── computeClientsContacted ──────────────────────────────────────────────────

describe("computeClientsContacted", () => {
  it("counts debtor with contacted status", () => {
    const actions = [makeAction({ companyId: "c1", status: "contacted" })];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(1);
  });

  it("counts debtor with promised_payment status", () => {
    const actions = [makeAction({ companyId: "c1", status: "promised_payment" })];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(1);
  });

  it("counts debtor with paid status", () => {
    const actions = [makeAction({ companyId: "c1", status: "paid" })];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(1);
  });

  it("does NOT count pending_review as contacted", () => {
    const actions = [makeAction({ companyId: "c1", status: "pending_review" })];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(0);
  });

  it("does NOT count paused as contacted", () => {
    const actions = [makeAction({ companyId: "c1", status: "paused" })];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(0);
  });

  it("does NOT count non-debtor companies", () => {
    const actions = [makeAction({ companyId: "c2", status: "contacted" })];
    const rows = [
      makePortfolioRow({ company_id: "c1", debt_uyu: 500 }),
      makePortfolioRow({ company_id: "c2", debt_uyu: 0, debt_usd: 0 }),
    ];
    expect(computeClientsContacted(actions, rows)).toBe(0);
  });

  it("excludes inactive actions", () => {
    const actions = [makeAction({ companyId: "c1", status: "contacted", isActive: false })];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(0);
  });

  it("counts each debtor only once even with multiple actions", () => {
    const actions = [
      makeAction({ id: "a1", companyId: "c1", status: "contacted" }),
      makeAction({ id: "a2", companyId: "c1", status: "promised_payment" }),
    ];
    const rows = [makePortfolioRow({ company_id: "c1", debt_uyu: 500 })];
    expect(computeClientsContacted(actions, rows)).toBe(1);
  });

  it("returns 0 for empty inputs", () => {
    expect(computeClientsContacted([], [])).toBe(0);
  });
});

// ── computeEffectivenessKpis (integration) ───────────────────────────────────

describe("computeEffectivenessKpis", () => {
  it("aggregates all sub-KPIs correctly", () => {
    const actions = [
      makeAction({ id: "a1", companyId: "c1", status: "promised_payment", promiseDate: TOMORROW }),
      makeAction({ id: "a2", companyId: "c2", status: "paid", promiseDate: YESTERDAY }),
      makeAction({ id: "a3", companyId: "c3", status: "promised_payment", promiseDate: YESTERDAY }),
    ];
    const portfolioRows = [
      makePortfolioRow({ company_id: "c1", debt_uyu: 500 }),
      makePortfolioRow({ company_id: "c2", debt_uyu: 200 }),
      makePortfolioRow({ company_id: "c3", debt_uyu: 300 }),
      makePortfolioRow({ company_id: "c4", debt_uyu: 0, debt_usd: 0 }),
    ];
    const historyRows = [
      makeHistoryRow({ id: "h1", moneda: "UYU", monto: 1000 }),
      makeHistoryRow({ id: "h2", moneda: "USD", monto: 250 }),
    ];

    const result = computeEffectivenessKpis(actions, portfolioRows, historyRows, TODAY);

    expect(result.activePromisesCount).toBe(1);       // c1 future
    expect(result.overduePromisesCount).toBe(1);      // c3 past
    expect(result.promiseFulfillmentRate).toBe(50);   // 1 paid / (1 paid + 1 broken)
    expect(result.cobrosUyu).toBe(1000);
    expect(result.cobrosUsd).toBe(250);
    expect(result.cobrosCount).toBe(2);
    expect(result.clientsWithDebtCount).toBe(3);       // c1, c2, c3 have debt
    expect(result.clientsContactedCount).toBe(3);      // c1 (promised_payment), c2 (paid), c3 (promised_payment)
  });

  it("handles all-empty inputs gracefully", () => {
    const result = computeEffectivenessKpis([], [], [], TODAY);
    expect(result.activePromisesCount).toBe(0);
    expect(result.promiseFulfillmentRate).toBeNull();
    expect(result.cobrosCount).toBe(0);
    expect(result.clientsWithDebtCount).toBe(0);
    expect(result.clientsContactedCount).toBe(0);
  });
});
