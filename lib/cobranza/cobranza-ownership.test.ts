import { describe, expect, it } from "vitest";

import type { CobranzaClientRow } from "@/lib/copilot-cobranza-summary";
import { applyResponsableFilter, filterByResponsableMe } from "./cobranza-ownership";

function makeClientRow(overrides: Partial<CobranzaClientRow> = {}): CobranzaClientRow {
  return {
    companyId: "c1",
    name: "Cliente A",
    debtUyu: 500,
    debtUsd: 0,
    overdueUyu: 0,
    overdueUsd: 0,
    overdueDaysUyu: null,
    overdueDaysUsd: null,
    collectionOverdueUyu: 0,
    collectionOverdueUsd: 0,
    collectionBucket: "on_time",
    oldestOpenInvoiceIssueDate: null,
    hasDebt: true,
    isOverdue: false,
    isCollectionOverdue: false,
    hasActiveAction: false,
    latestActionStatus: null,
    latestActionType: null,
    nextActionDate: null,
    activePromise: null,
    assignedUserId: null,
    assignedUserName: null,
    assignedUserEmail: null,
    contactEmail: null,
    contactPhone: null,
    ...overrides,
  };
}

// ── tests 15-22: applyResponsableFilter ──────────────────────────────────────

describe("applyResponsableFilter", () => {
  it("returns all rows when filter is 'all'", () => {
    const rows = [
      makeClientRow({ companyId: "c1", assignedUserId: "u-1" }),
      makeClientRow({ companyId: "c2", assignedUserId: null }),
    ];
    expect(applyResponsableFilter(rows, "all", "u-1")).toHaveLength(2);
  });

  it("returns only rows assigned to currentUserId when filter is 'me'", () => {
    const rows = [
      makeClientRow({ companyId: "c1", assignedUserId: "u-1" }),
      makeClientRow({ companyId: "c2", assignedUserId: "u-2" }),
      makeClientRow({ companyId: "c3", assignedUserId: "u-1" }),
    ];
    const result = applyResponsableFilter(rows, "me", "u-1");
    expect(result.map((r) => r.companyId)).toEqual(["c1", "c3"]);
  });

  it("returns all rows unchanged when filter is 'me' and currentUserId is null", () => {
    const rows = [
      makeClientRow({ companyId: "c1", assignedUserId: "u-1" }),
      makeClientRow({ companyId: "c2", assignedUserId: null }),
    ];
    expect(applyResponsableFilter(rows, "me", null)).toHaveLength(2);
  });

  it("returns only unassigned rows when filter is 'unassigned'", () => {
    const rows = [
      makeClientRow({ companyId: "c1", assignedUserId: "u-1" }),
      makeClientRow({ companyId: "c2", assignedUserId: null }),
      makeClientRow({ companyId: "c3", assignedUserId: null }),
    ];
    const result = applyResponsableFilter(rows, "unassigned", "u-1");
    expect(result.map((r) => r.companyId)).toEqual(["c2", "c3"]);
  });

  it("returns empty when filter is 'unassigned' and all rows have owners", () => {
    const rows = [makeClientRow({ companyId: "c1", assignedUserId: "u-1" })];
    expect(applyResponsableFilter(rows, "unassigned", null)).toHaveLength(0);
  });

  it("returns empty array for empty input regardless of filter", () => {
    expect(applyResponsableFilter([], "all", "u-1")).toHaveLength(0);
    expect(applyResponsableFilter([], "me", "u-1")).toHaveLength(0);
    expect(applyResponsableFilter([], "unassigned", null)).toHaveLength(0);
  });
});

// ── test 14: responsable=me filter ───────────────────────────────────────────

describe("filterByResponsableMe", () => {
  it("returns only rows assigned to the given userId", () => {
    const rows = [
      makeClientRow({ companyId: "c1", assignedUserId: "u-1" }),
      makeClientRow({ companyId: "c2", assignedUserId: "u-2" }),
      makeClientRow({ companyId: "c3", assignedUserId: "u-1" }),
    ];
    const result = filterByResponsableMe(rows, "u-1");
    expect(result.map((r) => r.companyId)).toEqual(["c1", "c3"]);
  });

  it("returns empty when no rows match", () => {
    const rows = [makeClientRow({ companyId: "c1", assignedUserId: "u-2" })];
    expect(filterByResponsableMe(rows, "u-1")).toHaveLength(0);
  });

  it("excludes rows with null assignedUserId", () => {
    const rows = [
      makeClientRow({ companyId: "c1", assignedUserId: null }),
      makeClientRow({ companyId: "c2", assignedUserId: "u-1" }),
    ];
    const result = filterByResponsableMe(rows, "u-1");
    expect(result.map((r) => r.companyId)).toEqual(["c2"]);
  });

  it("returns empty array for empty input", () => {
    expect(filterByResponsableMe([], "u-1")).toHaveLength(0);
  });
});
