import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleAccess: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleAccess: mocks.requireCopilotModuleAccess,
}));

import { GET } from "@/app/api/copilot/bank-movements/imports/latest-successful/route";

function makeSupabase(result: { data: { imported_at: string } | null; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const inStatus = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ in: inStatus }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, eq, inStatus, order, limit, maybeSingle };
}

describe("GET /api/copilot/bank-movements/imports/latest-successful", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expone solo el timestamp exitoso del tenant a un lector de Banco", async () => {
    const importedAt = "2026-07-30T17:10:00.000Z";
    const supabase = makeSupabase({ data: { imported_at: importedAt }, error: null });
    mocks.requireCopilotModuleAccess.mockResolvedValue({
      ok: true,
      ctx: { supabase: supabase.client, tenantCompanyId: "company-cami" },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/copilot/bank-movements/imports/latest-successful")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { imported_at: importedAt } });
    expect(mocks.requireCopilotModuleAccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "bank_movements"
    );
    expect(supabase.eq).toHaveBeenCalledWith("workspace_id", "company-cami");
    expect(supabase.inStatus).toHaveBeenCalledWith("status", ["parsed"]);
    expect(supabase.select).toHaveBeenCalledWith("imported_at");
  });

  it("no expone información de Historial cuando no hay importaciones exitosas", async () => {
    const supabase = makeSupabase({ data: null, error: null });
    mocks.requireCopilotModuleAccess.mockResolvedValue({
      ok: true,
      ctx: { supabase: supabase.client, tenantCompanyId: "company-cami" },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/copilot/bank-movements/imports/latest-successful")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { imported_at: null } });
  });
});
