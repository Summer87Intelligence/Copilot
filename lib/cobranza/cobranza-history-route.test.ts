import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleAccess: vi.fn(),
  fetchCobranzaHistoryReceiptRows: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleAccess: mocks.requireCopilotModuleAccess,
}));

vi.mock("@/lib/copilot-cobranza-history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/copilot-cobranza-history")>();
  return {
    ...actual,
    fetchCobranzaHistoryReceiptRows: mocks.fetchCobranzaHistoryReceiptRows,
  };
});

import { GET } from "@/app/api/copilot/cobranza/history/route";

const SUPABASE_STUB = { from: vi.fn() };

describe("GET /api/copilot/cobranza/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleAccess.mockResolvedValue({
      ok: true,
      ctx: { supabase: SUPABASE_STUB, tenantCompanyId: "ws-1" },
    });
  });

  it("returns items with truncated meta from fetch helper", async () => {
    mocks.fetchCobranzaHistoryReceiptRows.mockResolvedValue({
      rows: [
        {
          id: "r1",
          receipt_date: "2026-06-10",
          amount: 100,
          currency_code: "UYU",
          company_id: null,
          reference: null,
          created_at: "2026-06-10T10:00:00Z",
          status: "paid",
        },
      ],
      truncated: false,
      fetched: 1,
      limitApplied: null,
    });

    const req = new NextRequest(
      "http://localhost/api/copilot/cobranza/history?period=month&currency=UYU"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.truncated).toBe(false);
    expect(json.meta).toEqual({ fetched: 1, limitApplied: null });
    expect(json.items).toHaveLength(1);
    expect(json.items[0].moneda).toBe("UYU");
    expect(mocks.fetchCobranzaHistoryReceiptRows).toHaveBeenCalledWith(
      SUPABASE_STUB,
      expect.objectContaining({
        workspaceId: "ws-1",
        currency: "UYU",
        period: "month",
      })
    );
  });

  it("propagates truncated=true in response", async () => {
    mocks.fetchCobranzaHistoryReceiptRows.mockResolvedValue({
      rows: [],
      truncated: true,
      fetched: 50_000,
      limitApplied: 50_000,
    });

    const req = new NextRequest(
      "http://localhost/api/copilot/cobranza/history?period=all"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.truncated).toBe(true);
    expect(json.meta.limitApplied).toBe(50_000);
  });

  it("propaga 403 cuando auth falla", async () => {
    mocks.requireCopilotModuleAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const req = new NextRequest("http://localhost/api/copilot/cobranza/history");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
