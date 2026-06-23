import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

import { POST } from "@/app/api/copilot/cobranza/registrar-cobro/route";

const AUTH_OK = {
  ok: true as const,
  ctx: { supabase: {}, tenantCompanyId: "ws-1" },
};

describe("POST /api/copilot/cobranza/registrar-cobro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(AUTH_OK);
  });

  it("returns 410 Gone — manual registration is disabled", async () => {
    const req = new NextRequest(
      "http://localhost/api/copilot/cobranza/registrar-cobro",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100, currency_code: "UYU" }),
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("COBRANZA_MANUAL_REGISTRATION_DISABLED");
  });

  it("propaga 403 cuando acciones write está denegado", async () => {
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: false,
      response: new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN_MODULE" }),
        { status: 403 }
      ),
    });
    const req = new NextRequest(
      "http://localhost/api/copilot/cobranza/registrar-cobro",
      { method: "POST", body: "{}" }
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("no crea movimientos de caja ni collection_actions", async () => {
    const req = new NextRequest(
      "http://localhost/api/copilot/cobranza/registrar-cobro",
      { method: "POST", body: "{}" }
    );
    const res = await POST(req);
    expect(res.status).toBe(410);
  });
});
