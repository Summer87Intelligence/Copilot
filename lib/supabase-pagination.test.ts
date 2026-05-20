import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MAX_ROWS,
  DEFAULT_PAGE_SIZE,
  fetchAllRows,
  fetchAllRowsSafe,
  fetchAllSupabaseRows,
} from "@/lib/supabase-pagination";

type Row = { id: string };

function mockPages(total: number) {
  return vi.fn(async (from: number, to: number) => {
    const page: Row[] = [];
    for (let i = from; i <= to && i < total; i++) {
      page.push({ id: `row-${i}` });
    }
    return { data: page, error: null };
  });
}

describe("fetchAllRows / fetchAllSupabaseRows", () => {
  it("fetchAllSupabaseRows es alias de fetchAllRows", () => {
    expect(fetchAllSupabaseRows).toBe(fetchAllRows);
  });

  it("0 rows → empty, una página, reachedMaxRows false", async () => {
    const queryPage = vi.fn(async () => ({ data: [], error: null }));
    const result = await fetchAllRows<Row>({ queryPage, pageSize: 100 });
    expect(result.rows).toEqual([]);
    expect(result.pagesFetched).toBe(1);
    expect(result.totalFetched).toBe(0);
    expect(result.reachedMaxRows).toBe(false);
    expect(queryPage).toHaveBeenCalledWith(0, 99);
  });

  it("1 page exacta → reachedMaxRows false", async () => {
    const queryPage = mockPages(500);
    const result = await fetchAllRows<Row>({
      queryPage,
      pageSize: 1000,
      maxRows: 10_000,
    });
    expect(result.totalFetched).toBe(500);
    expect(result.pagesFetched).toBe(1);
    expect(result.reachedMaxRows).toBe(false);
  });

  it("multiple pages → concatena en orden estable", async () => {
    const queryPage = mockPages(2500, 1000);
    const result = await fetchAllRows<Row>({
      queryPage,
      pageSize: 1000,
      maxRows: 10_000,
    });
    expect(result.totalFetched).toBe(2500);
    expect(result.pagesFetched).toBe(3);
    expect(result.rows[0]?.id).toBe("row-0");
    expect(result.rows[999]?.id).toBe("row-999");
    expect(result.rows[2499]?.id).toBe("row-2499");
    expect(result.reachedMaxRows).toBe(false);
    expect(queryPage).toHaveBeenNthCalledWith(1, 0, 999);
    expect(queryPage).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(queryPage).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("stops at maxRows con reachedMaxRows true", async () => {
    const queryPage = mockPages(10_000);
    const result = await fetchAllRows<Row>({
      queryPage,
      pageSize: 1000,
      maxRows: 2000,
    });
    expect(result.reachedMaxRows).toBe(true);
    expect(result.totalFetched).toBe(2000);
    expect(result.pagesFetched).toBe(2);
    expect(queryPage).toHaveBeenCalledTimes(2);
  });

  it("5001 filas sin truncar cuando maxRows lo permite (FIX-8)", async () => {
    const queryPage = mockPages(5001);
    const result = await fetchAllRows<Row>({
      queryPage,
      pageSize: 1000,
      maxRows: DEFAULT_MAX_ROWS,
    });
    expect(result.totalFetched).toBe(5001);
    expect(result.reachedMaxRows).toBe(false);
    expect(result.pagesFetched).toBe(6);
  });

  it("propaga error de Supabase", async () => {
    const queryPage = vi.fn(async () => ({
      data: null,
      error: { message: "timeout" },
    }));
    await expect(fetchAllRows({ queryPage })).rejects.toThrow("timeout");
  });

  it("fetchAllRowsSafe captura error sin lanzar", async () => {
    const result = await fetchAllRowsSafe<Row>({
      queryPage: async () => ({ data: null, error: { message: "boom" } }),
    });
    expect(result.rows).toEqual([]);
    expect(result.fetchError).toBe("boom");
    expect(result.reachedMaxRows).toBe(false);
  });

  it("defaults pageSize y maxRows", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(1000);
    expect(DEFAULT_MAX_ROWS).toBe(50_000);
  });
});
