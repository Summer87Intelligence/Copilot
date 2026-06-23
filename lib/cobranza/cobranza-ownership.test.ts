import { describe, expect, it } from "vitest";

import type { CobranzaClientRow } from "@/lib/copilot-cobranza-summary";
import { filterByResponsableMe } from "./cobranza-ownership";

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
    hasDebt: true,
    isOverdue: false,
    hasActiveAction: false,
    latestActionStatus: null,
    latestActionType: null,
    nextActionDate: null,
    activePromise: null,
    assignedUserId: null,
    assignedUserName: null,
    assignedUserEmail: null,
    ...overrides,
  };
}

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
