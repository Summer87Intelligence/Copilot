import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  registrarCobro: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/cobranza/registrar-cobro-service", () => ({
  registrarCobro: mocks.registrarCobro,
}));

import { POST } from "@/app/api/copilot/cobranza/registrar-cobro/route";

const validBody = {
  company_id: "8fd1272a-3829-4d50-8aa8-66aced1828a0",
  payment_date: "2026-06-22",
  amount: 15000,
  currency_code: "UYU",
  client_request_id: "req-route-test-001",
};

describe("POST /api/copilot/cobranza/registrar-cobro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: true,
      ctx: {
        supabase: {},
        tenantCompanyId: "ws-1",
      },
    });
    mocks.registrarCobro.mockResolvedValue({
      ok: true,
      message: "Cobro registrado. Impacta Tesorería local; no modifica facturas en Zeta.",
      data: {
        manual_cash_movement: {
          id: "mov-1",
          amount: 15000,
          currency_code: "UYU",
          movement_date: "2026-06-22",
        },
        collection_action: {
          id: "act-1",
          action_type: "internal_note",
          status: "contacted",
        },
      },
      warnings: [],
      refresh_hints: ["cobranza", "treasury_cash_position", "hoy"],
    });
  });

  it("usa permission gate acciones write", async () => {
    const request = new NextRequest("http://localhost/api/copilot/cobranza/registrar-cobro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mocks.requireCopilotModuleWriteAccess).toHaveBeenCalledWith(
      request,
      "acciones",
      expect.objectContaining({ client_request_id: validBody.client_request_id })
    );
  });

  it("rechaza payload inválido sin llamar al servicio", async () => {
    const request = new NextRequest("http://localhost/api/copilot/cobranza/registrar-cobro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, amount: -1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.registrarCobro).not.toHaveBeenCalled();
  });

  it("propaga 403 cuando acciones write está denegado", async () => {
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, code: "FORBIDDEN_MODULE" }), {
        status: 403,
      }),
    });

    const request = new NextRequest("http://localhost/api/copilot/cobranza/registrar-cobro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mocks.registrarCobro).not.toHaveBeenCalled();
  });

  it("devuelve 207 en fallo parcial", async () => {
    mocks.registrarCobro.mockResolvedValue({
      ok: false,
      partial: true,
      code: "PARTIAL",
      message: "Parcial",
      movement_id: "mov-partial",
    });

    const request = new NextRequest("http://localhost/api/copilot/cobranza/registrar-cobro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(207);
    const json = await response.json();
    expect(json.partial).toBe(true);
    expect(json.movement_id).toBe("mov-partial");
  });

  it("devuelve 200 idempotente", async () => {
    mocks.registrarCobro.mockResolvedValue({
      ok: true,
      idempotent: true,
      message: "Cobro ya registrado (idempotente). Impacta Tesorería local; no modifica facturas en Zeta.",
      data: {
        manual_cash_movement: {
          id: "mov-1",
          amount: 15000,
          currency_code: "UYU",
          movement_date: "2026-06-22",
        },
        collection_action: {
          id: "act-1",
          action_type: "internal_note",
          status: "contacted",
        },
      },
      warnings: [],
      refresh_hints: ["cobranza", "treasury_cash_position", "hoy"],
    });

    const request = new NextRequest("http://localhost/api/copilot/cobranza/registrar-cobro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.idempotent).toBe(true);
  });
});
