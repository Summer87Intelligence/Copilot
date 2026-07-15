import { describe, expect, it } from "vitest";
import {
  nextSortState,
  sortRows,
  type SortState,
} from "@/lib/ui/table-sort-model";

type Row = { name: string; amount: number };
const rows: Row[] = [
  { name: "Beta", amount: 30 },
  { name: "alpha", amount: 10 },
  { name: "Gamma", amount: 20 },
];

describe("nextSortState", () => {
  it("starts ascending on a new column", () => {
    const s: SortState = { key: "name", direction: "desc" };
    expect(nextSortState(s, "amount")).toEqual({ key: "amount", direction: "asc" });
  });

  it("toggles direction on the active column", () => {
    const s: SortState = { key: "amount", direction: "asc" };
    expect(nextSortState(s, "amount")).toEqual({ key: "amount", direction: "desc" });
  });
});

describe("sortRows", () => {
  it("sorts numbers ascending / descending", () => {
    expect(sortRows(rows, (r) => r.amount, "asc").map((r) => r.amount)).toEqual([10, 20, 30]);
    expect(sortRows(rows, (r) => r.amount, "desc").map((r) => r.amount)).toEqual([30, 20, 10]);
  });

  it("sorts strings case-insensitively", () => {
    expect(sortRows(rows, (r) => r.name, "asc").map((r) => r.name)).toEqual([
      "alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("null accessor leaves order unchanged (copy)", () => {
    const out = sortRows(rows, null, "asc");
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it("nulls sort to the end regardless of direction", () => {
    const withNull: Row[] = [{ name: "x", amount: 5 }, { name: "y", amount: null as unknown as number }];
    expect(sortRows(withNull, (r) => r.amount, "asc").map((r) => r.name)).toEqual(["x", "y"]);
    expect(sortRows(withNull, (r) => r.amount, "desc").map((r) => r.name)).toEqual(["x", "y"]);
  });
});
