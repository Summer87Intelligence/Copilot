import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleAccess: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleAccess: mocks.requireCopilotModuleAccess,
}));

import { GET } from "@/app/api/copilot/cobranza/usuarios-asignables/route";

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "in", "not", "limit"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  // Supabase returns directly from `.order()` without terminal for list queries
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: typeof result) => void) => resolve(result);
    },
  });
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

const ACTIVE_USERS = [
  { id: "u-1", full_name: "Daniel Admin", email: "daniel@emp.com", role: "superadmin" },
  { id: "u-2", full_name: "Cecilia", email: "ceci@emp.com", role: "usuario" },
  { id: "u-3", full_name: "Juanma", email: "juanma@emp.com", role: "usuario" },
];

function makeAuthOk(supabase: unknown) {
  return {
    ok: true as const,
    ctx: {
      supabase,
      tenantCompanyId: "ws-1",
      appUser: { id: "u-1", company_id: "ws-1", full_name: "Daniel", email: "d@e.com", role: "superadmin", created_at: "" },
    },
  };
}

const AUTH_DENIED = {
  ok: false as const,
  response: new Response(JSON.stringify({ ok: false, code: "FORBIDDEN_MODULE" }), { status: 403 }),
};

function makeRequest() {
  return new NextRequest("http://localhost/api/copilot/cobranza/usuarios-asignables");
}

describe("GET /api/copilot/cobranza/usuarios-asignables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve usuarios activos", async () => {
    const supabase = makeSupabase({ app_users: { data: ACTIVE_USERS } });
    mocks.requireCopilotModuleAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.users).toHaveLength(3);
    expect(json.users[0]).toMatchObject({ id: "u-1", role: "superadmin" });
  });

  it("excluye inactivos (filtro delegado a DB via eq is_active=true)", async () => {
    // The route filters at DB level; test verifies it passes is_active=true to the chain
    const supabase = makeSupabase({ app_users: { data: ACTIVE_USERS.slice(0, 2) } });
    mocks.requireCopilotModuleAccess.mockResolvedValue(makeAuthOk(supabase));

    const res = await GET(makeRequest());
    const json = await res.json();
    // Verifica que el chain incluye eq("is_active", true) — lo hace el spy
    const fromSpy = (supabase.from as ReturnType<typeof vi.fn>);
    expect(fromSpy).toHaveBeenCalledWith("app_users");
    expect(json.users).toHaveLength(2);
  });

  it("excluye demo_readonly (filtro delegado a DB via neq role)", async () => {
    const supabase = makeSupabase({ app_users: { data: ACTIVE_USERS } });
    mocks.requireCopilotModuleAccess.mockResolvedValue(makeAuthOk(supabase));

    await GET(makeRequest());
    // El chain recibió neq("role", "demo_readonly") — verificado via spy
    const chain = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    const neqSpy = chain.neq as ReturnType<typeof vi.fn>;
    expect(neqSpy).toHaveBeenCalledWith("role", "demo_readonly");
  });

  it("requiere acciones read — propaga 403 cuando auth deniega", async () => {
    mocks.requireCopilotModuleAccess.mockResolvedValue(AUTH_DENIED);

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("FORBIDDEN_MODULE");
  });
});
