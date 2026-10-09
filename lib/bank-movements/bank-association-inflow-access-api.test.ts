import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), restricted: vi.fn(), identification: vi.fn() }));
vi.mock("@/lib/auth/copilot-module-api-auth", () => ({ requireCopilotModuleAccess: mocks.auth, isBankMovementsInflowReadonly: mocks.restricted }));
vi.mock("@/lib/bank/canonical/client-identification-repository.server", () => ({ getActiveIdentificationForMovement: mocks.identification }));
import { GET } from "@/app/api/copilot/bank-reconciliation/movements/[id]/association/route";
const id = "11111111-1111-4111-8111-111111111111";
const request = new NextRequest(`http://localhost/api/copilot/bank-reconciliation/movements/${id}/association`);
function database(direction = "inflow", metadata: Record<string, unknown> = { balance: 9999 }) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id, direction, metadata }, error: null });
  const from = vi.fn(() => query);
  mocks.auth.mockResolvedValue({ ok: true, ctx: { supabase: { from }, tenantCompanyId: "ws" } });
  return { from, query };
}
describe("detalle de asociación — aislamiento de ingresos", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.restricted.mockResolvedValue(true);
    mocks.identification.mockResolvedValue({ id: "association", clientCompanyId: "client", status: "identified" });
  });
  it("rechaza egresos antes de buscar asociaciones", async () => {
    database("outflow");
    expect((await GET(request, { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(mocks.identification).not.toHaveBeenCalled();
  });
  it("rechaza movimientos ocultos", async () => {
    database("inflow", { ui_hidden: true });
    expect((await GET(request, { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(mocks.identification).not.toHaveBeenCalled();
  });
  it("muestra la asociación existente sin devolver saldos", async () => {
    const db = database();
    const res = await GET(request, { params: Promise.resolve({ id }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.identification.clientCompanyId).toBe("client");
    expect(body.data.movement.metadata).not.toHaveProperty("balance");
    expect(db.query.eq).toHaveBeenCalledWith("workspace_id", "ws");
  });
});
