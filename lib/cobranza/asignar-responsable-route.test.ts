import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  assignOperationalOwner: vi.fn(),
  unassignOperationalOwner: vi.fn(),
  ensureOperationalStateRowForCustomer: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/data/decision-operational-state-repository", () => ({
  assignOperationalOwner: mocks.assignOperationalOwner,
  unassignOperationalOwner: mocks.unassignOperationalOwner,
  ensureOperationalStateRowForCustomer: mocks.ensureOperationalStateRowForCustomer,
}));

import { PATCH } from "@/app/api/copilot/cobranza/asignar-responsable/route";

// ── supabase mock helpers ────────────────────────────────────────────────────

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "not", "order", "limit"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

function makeSupabase(fromMap: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      const r = fromMap[table];
      if (!r) return makeChain({ data: null, error: null });
      return makeChain({ data: r.data, error: r.error ?? null });
    }),
  };
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const TENANT = "ws-1";
const COMPANY_ID = "company-abc";
const USER_ID = "user-xyz";

const COMPANY_ROW = { id: COMPANY_ID };
const ACTIVE_USER = {
  id: USER_ID,
  full_name: "Cecilia López",
  email: "ceci@empresa.com",
  role: "usuario",
  is_active: true,
};
const INACTIVE_USER = { ...ACTIVE_USER, is_active: false };
const DEMO_USER = { ...ACTIVE_USER, role: "demo_readonly" };

const APP_USER = {
  id: "u-admin",
  company_id: TENANT,
  full_name: "Daniel",
  email: "d@emp.com",
  role: "superadmin",
  created_at: "",
};

function makeAuthOk(supabase: unknown) {
  return { ok: true as const, ctx: { supabase, tenantCompanyId: TENANT, appUser: APP_USER } };
}

const AUTH_DENIED = {
  ok: false as const,
  response: new Response(JSON.stringify({ ok: false, code: "FORBIDDEN_MODULE" }), { status: 403 }),
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/copilot/cobranza/asignar-responsable", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── tests 5-11 ───────────────────────────────────────────────────────────────

describe("PATCH /api/copilot/cobranza/asignar-responsable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assignOperationalOwner.mockResolvedValue({});
    mocks.unassignOperationalOwner.mockResolvedValue(null);
  });

  // test 5
  it("asigna usuario válido y devuelve 200 con assignedTo", async () => {
    const supabase = makeSupabase({
      proto_companies: { data: COMPANY_ROW },
      app_users: { data: ACTIVE_USER },
    });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.companyId).toBe(COMPANY_ID);
    expect(json.assignedTo.id).toBe(USER_ID);
    expect(json.assignedTo.name).toBe("Cecilia López");
    expect(mocks.assignOperationalOwner).toHaveBeenCalledWith(
      supabase,
      TENANT,
      expect.objectContaining({ customerId: COMPANY_ID, assignedUserId: USER_ID })
    );
  });

  // test 6
  it("desasigna con userId null — llama unassignOperationalOwner", async () => {
    const supabase = makeSupabase({ proto_companies: { data: COMPANY_ROW } });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: null }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.assignedTo).toBeNull();
    expect(mocks.unassignOperationalOwner).toHaveBeenCalledWith(supabase, TENANT, COMPANY_ID);
    expect(mocks.assignOperationalOwner).not.toHaveBeenCalled();
  });

  // test 7
  it("rechaza usuario inexistente — 404", async () => {
    const supabase = makeSupabase({
      proto_companies: { data: COMPANY_ROW },
      app_users: { data: null },
    });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: "unknown-user" }));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("USER_NOT_FOUND");
  });

  // test 8
  it("rechaza usuario inactivo — 422", async () => {
    const supabase = makeSupabase({
      proto_companies: { data: COMPANY_ROW },
      app_users: { data: INACTIVE_USER },
    });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("USER_INACTIVE");
  });

  // test 9
  it("rechaza sin acciones write — propaga 403", async () => {
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(AUTH_DENIED);

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("FORBIDDEN_MODULE");
  });

  // test 10
  it("crea row decision_operational_state si no existe (via assignOperationalOwner)", async () => {
    const supabase = makeSupabase({
      proto_companies: { data: COMPANY_ROW },
      app_users: { data: ACTIVE_USER },
    });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));
    // assignOperationalOwner internally ensures the row exists
    mocks.assignOperationalOwner.mockResolvedValue({});

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));

    expect(res.status).toBe(200);
    expect(mocks.assignOperationalOwner).toHaveBeenCalledOnce();
    expect(mocks.assignOperationalOwner).toHaveBeenCalledWith(
      supabase,
      TENANT,
      expect.objectContaining({ customerId: COMPANY_ID, assignedUserId: USER_ID })
    );
  });

  // test 11
  it("actualiza row existente sin duplicar — assignOperationalOwner se llama una vez", async () => {
    const supabase = makeSupabase({
      proto_companies: { data: COMPANY_ROW },
      app_users: { data: ACTIVE_USER },
    });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));
    await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));

    // Each call → one assignOperationalOwner invocation (no duplicates per call)
    expect(mocks.assignOperationalOwner).toHaveBeenCalledTimes(2);
  });

  // additional: demo_readonly rejection
  it("rechaza usuario demo_readonly — 422", async () => {
    const supabase = makeSupabase({
      proto_companies: { data: COMPANY_ROW },
      app_users: { data: DEMO_USER },
    });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ companyId: COMPANY_ID, userId: USER_ID }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("USER_NOT_ASSIGNABLE");
  });

  // additional: missing companyId
  it("devuelve 400 si companyId está ausente", async () => {
    const supabase = makeSupabase({});
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ userId: USER_ID }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("MISSING_COMPANY_ID");
  });

  // additional: company not found
  it("devuelve 404 si companyId no existe en proto_companies", async () => {
    const supabase = makeSupabase({ proto_companies: { data: null } });
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await PATCH(makeRequest({ companyId: "nonexistent", userId: USER_ID }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("COMPANY_NOT_FOUND");
  });
});
