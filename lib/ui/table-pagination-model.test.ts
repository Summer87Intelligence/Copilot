import { describe, expect, it } from "vitest";
import {
  clampPage,
  pageAfterFilterChange,
  paginate,
} from "@/lib/ui/table-pagination-model";

const rows = Array.from({ length: 23 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the requested page slice with 1-based from/to", () => {
    const r = paginate(rows, 1, 10);
    expect(r.pageRows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r).toMatchObject({ safePage: 1, totalPages: 3, total: 23, from: 1, to: 10 });
  });

  it("last partial page", () => {
    const r = paginate(rows, 3, 10);
    expect(r.pageRows).toEqual([21, 22, 23]);
    expect(r).toMatchObject({ safePage: 3, from: 21, to: 23 });
  });

  it("clamps an out-of-range page instead of returning empty", () => {
    const r = paginate(rows, 99, 10);
    expect(r.safePage).toBe(3);
    expect(r.pageRows).toEqual([21, 22, 23]);
  });

  it("empty rows → page 1, no items, from/to 0", () => {
    const r = paginate([], 1, 10);
    expect(r).toMatchObject({ pageRows: [], safePage: 1, totalPages: 1, total: 0, from: 0, to: 0 });
  });

  it("guards invalid pageSize", () => {
    const r = paginate(rows, 1, 0);
    expect(r.pageRows).toEqual([1]);
    expect(r.totalPages).toBe(23);
  });
});

describe("pageAfterFilterChange", () => {
  it("always resets to page 1", () => {
    expect(pageAfterFilterChange()).toBe(1);
  });
});

describe("clampPage", () => {
  it("keeps page within [1, totalPages]", () => {
    expect(clampPage(5, 3)).toBe(3);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
  });
});
