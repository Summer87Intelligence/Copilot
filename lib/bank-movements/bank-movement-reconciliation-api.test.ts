import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleAccess: vi.fn(),
  requireCopilotModuleWriteAccess: vi.fn(),
  loadBankMovementReconciliationList: vi.fn(),
  reconcileBankMovementWithObligation: vi.fn(),
  ignoreBankMovement: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleAccess: mocks.requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/bank-movements/bank-movement-reconciliation-service.server", () => ({
  loadBankMovementReconciliationList: mocks.loadBankMovementReconciliationList,
  reconcileBankMovementWithObligation: mocks.reconcileBankMovementWithObligation,
  ignoreBankMovement: mocks.ignoreBankMovement,
}));

import { GET } from "@/app/api/copilot/bank-movements/reconciliation/route";
import { POST as POST_IGNORE } from "@/app/api/copilot/bank-movements/[id]/ignore/route";
import { POST as POST_RECONCILE } from "@/app/api/copilot/bank-movements/[id]/reconcile/route";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "user-abc", role: "superadmin", company_id: "c1" },
  tenantCompanyId: "c1",
};

const movement = {
  id: "11111111-1111-1111-1111-111111111111",
  workspace_id: "c1",
  status: "matched",
  matched_type: "planned_payment",
  matched_id: "22222222-2222-2222-2222-222222222222",
};

describe("bank movement reconciliation APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    mocks.loadBankMovementReconciliationList.mockResolvedValue({
      items: [{ movement: { id: movement.id, status: "pending" }, suggestions: [{ score: 90 }] }],
      meta: {
        pending_count: 1,
        with_high_confidence: 1,
        with_medium_confidence: 0,
        without_suggestions: 0,
        matched_count: 0,
        ignored_count: 0,
      },
    });
    mocks.reconcileBankMovementWithObligation.mockResolvedValue(movement);
    mocks.ignoreBankMovement.mockResolvedValue({ ...movement, status: "ignored" });
  });

  it("GET reconciliation requiere acceso", async () => {
    mocks.requireCopilotModuleAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false }, { status: 403 }),
    });
    const res = await GET(new NextRequest("https://example.test/api/copilot/bank-movements/reconciliation"));
    expect(res.status).toBe(403);
  });

  it("GET reconciliation devuelve pending + suggestions", async () => {
    const res = await GET(new NextRequest("https://example.test/api/copilot/bank-movements/reconciliation"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toHaveLength(1);
    expect(mocks.loadBankMovementReconciliationList).toHaveBeenCalledOnce();
  });

  it("POST reconcile marca movimiento y requiere write", async () => {
    const res = await POST_RECONCILE(
      new NextRequest("https://example.test/api/copilot/bank-movements/11111111-1111-1111-1111-111111111111/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: "planned_cash_obligation",
          target_id: "22222222-2222-2222-2222-222222222222",
          confidence: "high",
          score: 90,
        }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.reconcileBankMovementWithObligation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "c1",
        userId: "user-abc",
        targetId: "22222222-2222-2222-2222-222222222222",
      })
    );
  });

  it("POST ignore marca ignored", async () => {
    const res = await POST_IGNORE(
      new NextRequest("https://example.test/api/copilot/bank-movements/11111111-1111-1111-1111-111111111111/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Sin match" }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.ignoreBankMovement).toHaveBeenCalledOnce();
  });
});
