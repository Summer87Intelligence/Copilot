/**
 * FASE 9E — El endpoint legado de asignación POR DOCUMENTO no permite nuevas
 * escrituras (410 Gone). La atribución canónica es por cliente. Mantiene el
 * guard RBAC del módulo (no expone estado a llamadas no autorizadas).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const requireWrite = vi.fn();

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: (...args: unknown[]) => requireWrite(...args),
}));

import { POST } from "@/app/api/copilot/sales/assignments/route";

const fakeRequest = {} as never;

describe("legacy per-document assignment endpoint", () => {
  beforeEach(() => requireWrite.mockReset());

  it("con acceso de módulo responde 410 Gone y redirige a la asignación por cliente", async () => {
    requireWrite.mockResolvedValue({ ok: true, ctx: {} });
    const res = await POST(fakeRequest);
    expect(res.status).toBe(410);
    expect(res.headers.get("Deprecation")).toBe("true");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("GONE");
    expect(String(body.message)).toContain("client-assignments");
  });

  it("sin acceso de módulo NO llega al 410 (respeta RBAC)", async () => {
    const forbidden = new Response(null, { status: 403 });
    requireWrite.mockResolvedValue({ ok: false, response: forbidden });
    const res = await POST(fakeRequest);
    expect(res.status).toBe(403);
  });
});
