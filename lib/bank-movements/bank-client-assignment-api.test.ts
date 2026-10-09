import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), level: vi.fn(), preflight: vi.fn(), confirm: vi.fn() }));
vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireBankMovementClientAssignmentAccess: mocks.auth,
  getCopilotModuleAccessLevel: mocks.level,
}));
vi.mock("@/lib/bank-movements/bank-client-assignment-access.server", () => ({ canAccessBankInflowAssignmentBatch: mocks.preflight }));
vi.mock("@/lib/bank/canonical/confirm-client-identification.server", () => ({ confirmBatchClientIdentification: mocks.confirm }));
import { POST } from "@/app/api/copilot/bank-reconciliation/client-identifications/route";
const clientId = "33333333-3333-4333-8333-333333333333";
const movementId = "11111111-1111-4111-8111-111111111111";
const request = () => new NextRequest("http://localhost/api/copilot/bank-reconciliation/client-identifications", {
  method: "POST", body: JSON.stringify({ clientCompanyId: clientId, movementIds: [movementId] }),
});
describe("asignación acotada a ingresos — endpoint real", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, ctx: { supabase: {}, tenantCompanyId: "ws", appUser: { id: "actor" } } });
    mocks.level.mockResolvedValue("inflow_associate");
    mocks.preflight.mockResolvedValue(true);
    mocks.confirm.mockResolvedValue({ created: [{ id: "association" }], alreadyIdentifiedSameClient: [], conflicts: [], blockedNonInflow: [], alreadyReconciled: [] });
  });
  it("reutiliza el escritor existente y obtiene tenant/actor de la sesión", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mocks.preflight).toHaveBeenCalledWith({}, "ws", [movementId], clientId);
    expect(mocks.confirm).toHaveBeenCalledWith({}, expect.objectContaining({ workspaceId: "ws", actorUserId: "actor" }));
  });
  it("devuelve 404 sin escribir ante un ID fuera de alcance", async () => {
    mocks.preflight.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("rechaza lectores antes de consultar movimientos", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("preserva el flujo de operadores con acceso completo", async () => {
    mocks.level.mockResolvedValue("write");
    expect((await POST(request())).status).toBe(200);
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });
});
