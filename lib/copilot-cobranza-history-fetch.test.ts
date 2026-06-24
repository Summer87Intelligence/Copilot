import { beforeEach, describe, expect, it, vi } from "vitest";

const paginationMocks = vi.hoisted(() => ({
  fetchAllRows: vi.fn(),
}));

vi.mock("@/lib/supabase-pagination", () => ({
  fetchAllRows: paginationMocks.fetchAllRows,
}));

import {
  buildCobranzaHistoryItems,
  COBRANZA_HISTORY_FETCH_PAGE_SIZE,
  fetchCobranzaHistoryReceiptRows,
} from "./copilot-cobranza-history";

const EMPTY_NAMES = new Map<string, string>();

function receipt(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    receipt_date: "2026-06-10",
    amount: 100,
    currency_code: "UYU",
    company_id: "c1",
    reference: null,
    created_at: "2026-06-10T10:00:00Z",
    status: "paid",
    ...overrides,
  };
}

describe("fetchCobranzaHistoryReceiptRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes void/cancelled/anulada statuses", async () => {
    paginationMocks.fetchAllRows.mockResolvedValue({
      rows: [
        receipt("ok", { status: "paid" }),
        receipt("void", { status: "void", amount: 999 }),
        receipt("cancel", { status: "cancelled", amount: 999 }),
        receipt("anul", { status: "anulada", amount: 999 }),
      ],
      pagesFetched: 1,
      totalFetched: 4,
      reachedMaxRows: false,
    });

    const result = await fetchCobranzaHistoryReceiptRows({} as never, {
      workspaceId: "ws-1",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      currency: "",
      period: "month",
    });

    expect(result.rows.map((r) => r.id)).toEqual(["ok"]);
    expect(result.truncated).toBe(false);
  });

  it("includes paid/applied/pending/processing", async () => {
    paginationMocks.fetchAllRows.mockResolvedValue({
      rows: [
        receipt("p1", { status: "paid" }),
        receipt("p2", { status: "applied" }),
        receipt("p3", { status: "pending" }),
        receipt("p4", { status: "processing" }),
      ],
      pagesFetched: 1,
      totalFetched: 4,
      reachedMaxRows: false,
    });

    const result = await fetchCobranzaHistoryReceiptRows({} as never, {
      workspaceId: "ws-1",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      currency: "",
      period: "month",
    });

    expect(result.rows).toHaveLength(4);
  });

  it("paginates via fetchAllRows with page size 1000", async () => {
    const page1 = Array.from({ length: COBRANZA_HISTORY_FETCH_PAGE_SIZE }, (_, i) =>
      receipt(`r-${i}`)
    );
    const page2 = [receipt("r-last")];

    paginationMocks.fetchAllRows.mockResolvedValue({
      rows: [...page1, ...page2],
      pagesFetched: 2,
      totalFetched: COBRANZA_HISTORY_FETCH_PAGE_SIZE + 1,
      reachedMaxRows: false,
    });

    const result = await fetchCobranzaHistoryReceiptRows({} as never, {
      workspaceId: "ws-1",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      currency: "",
      period: "month",
    });

    expect(paginationMocks.fetchAllRows).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: COBRANZA_HISTORY_FETCH_PAGE_SIZE })
    );
    expect(result.rows).toHaveLength(COBRANZA_HISTORY_FETCH_PAGE_SIZE + 1);
    expect(result.truncated).toBe(false);
    expect(result.limitApplied).toBeNull();
  });

  it("returns truncated=true when fetchAllRows reaches maxRows", async () => {
    paginationMocks.fetchAllRows.mockResolvedValue({
      rows: [receipt("r1")],
      pagesFetched: 50,
      totalFetched: 50_000,
      reachedMaxRows: true,
    });

    const result = await fetchCobranzaHistoryReceiptRows({} as never, {
      workspaceId: "ws-1",
      fromDate: null,
      toDate: null,
      currency: "",
      period: "all",
    });

    expect(result.truncated).toBe(true);
    expect(result.limitApplied).toBe(50_000);
  });
});

describe("buildCobranzaHistoryItems", () => {
  it("orders by receipt_date desc then created_at desc then id desc", () => {
    const items = buildCobranzaHistoryItems(
      [
        receipt("a", { receipt_date: "2026-06-01", created_at: "2026-06-01T08:00:00Z" }),
        receipt("c", { receipt_date: "2026-06-03", created_at: "2026-06-03T12:00:00Z" }),
        receipt("b", { receipt_date: "2026-06-03", created_at: "2026-06-03T10:00:00Z" }),
      ],
      EMPTY_NAMES
    );
    expect(items.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});
