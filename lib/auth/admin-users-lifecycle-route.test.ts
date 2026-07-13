import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  bumpUserCredentialVersion: vi.fn(),
}));

vi.mock("@/lib/auth/admin-api-auth", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/security/credential-version", () => ({
  bumpUserCredentialVersion: mocks.bumpUserCredentialVersion,
}));

import { PATCH, DELETE } from "@/app/api/copilot/admin/users/[id]/route";

const TENANT = "company-1";
const ACTOR_ID = "actor-superadmin";
const TARGET_ID = "target-user";

function makeChain(final: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "is", "update", "insert", "order", "limit", "neq"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: final.data ?? null, error: final.error ?? null });
  chain.single = vi.fn().mockResolvedValue({ data: final.data ?? null, error: final.error ?? null });
  if (final.count !== undefined) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) => resolve({ count: final.count, error: final.error ?? null }),
    });
  }
  return chain;
}

function makeAdmin(fromHandlers: Record<string, () => unknown>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      const handler = fromHandlers[table];
      return handler ? handler() : makeChain({});
    }),
  };
}

function adminAuthOk(admin: unknown) {
  return {
    ok: true as const,
    ctx: { admin, tenantCompanyId: TENANT, actorId: ACTOR_ID },
  };
}

const TARGET_ACTIVE = {
  id: TARGET_ID,
  role: "usuario",
  is_active: true,
  deleted_at: null,
  email: "user@test.com",
};

const TARGET_INACTIVE = { ...TARGET_ACTIVE, is_active: false };
const TARGET_SUPERADMIN = { ...TARGET_ACTIVE, role: "superadmin" };

describe("PATCH /api/copilot/admin/users/:id — desactivar / reactivar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bumpUserCredentialVersion.mockResolvedValue({ ok: true });
  });

  it("desactivar pone is_active=false e invalida sesiones", async () => {
    const updateMock = vi.fn().mockReturnValue(makeChain({}));
    const admin = makeAdmin({
      app_users: () => {
        let calls = 0;
        return {
          select: vi.fn().mockImplementation(() => {
            calls += 1;
            if (calls === 1) return makeChain({ data: TARGET_ACTIVE });
            return makeChain({ count: 2 });
          }),
          update: updateMock,
          eq: vi.fn().mockReturnThis(),
        };
      },
    });
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const req = new NextRequest(`http://localhost/api/copilot/admin/users/${TARGET_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: TARGET_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    expect(mocks.bumpUserCredentialVersion).toHaveBeenCalledWith(admin, TARGET_ID);
  });

  it("reactivar pone is_active=true sin bump de sesión", async () => {
    const updateMock = vi.fn().mockReturnValue(makeChain({}));
    const admin = makeAdmin({
      app_users: () => ({
        select: vi.fn().mockReturnValue(makeChain({ data: TARGET_INACTIVE })),
        update: updateMock,
        eq: vi.fn().mockReturnThis(),
      }),
    });
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const req = new NextRequest(`http://localhost/api/copilot/admin/users/${TARGET_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: TARGET_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_active: true });
    expect(mocks.bumpUserCredentialVersion).not.toHaveBeenCalled();
  });

  it("no desactiva al último superadmin activo", async () => {
    const updateMock = vi.fn();
    const admin = {
      from: vi.fn().mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === "exact") {
            return {
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              then: (resolve: (v: unknown) => void) => resolve({ count: 1, error: null }),
            };
          }
          return {
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: TARGET_SUPERADMIN, error: null }),
              })),
            })),
          };
        });
        chain.update = updateMock;
        chain.eq = vi.fn().mockReturnValue(chain);
        return chain;
      }),
    };
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const req = new NextRequest(`http://localhost/api/copilot/admin/users/${TARGET_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: TARGET_ID }) });
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/copilot/admin/users/:id — eliminar cuenta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bumpUserCredentialVersion.mockResolvedValue({ ok: true });
  });

  it("no permite autoeliminación", async () => {
    mocks.requireAdminContext.mockResolvedValue(
      adminAuthOk(makeAdmin({}))
    );
    mocks.requireAdminContext.mockResolvedValue({
      ok: true,
      ctx: { admin: {}, tenantCompanyId: TENANT, actorId: TARGET_ID },
    });

    const req = new NextRequest(`http://localhost/api/copilot/admin/users/${TARGET_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: TARGET_ID }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toMatch(/propia cuenta/i);
  });

  it("soft delete setea deleted_at y anonimiza credenciales", async () => {
    const updateMock = vi.fn().mockReturnValue(makeChain({}));
    const admin = makeAdmin({
      app_users: () => ({
        select: vi.fn().mockReturnValue(makeChain({ data: TARGET_ACTIVE })),
        update: updateMock,
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
      }),
    });
    // count superadmins > 1
    (admin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table !== "app_users") return makeChain({});
      return {
        select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string }) => {
          if (opts?.count === "exact") {
            return {
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              then: (resolve: (v: unknown) => void) => resolve({ count: 2, error: null }),
            };
          }
          return makeChain({ data: TARGET_ACTIVE });
        }),
        update: updateMock,
        eq: vi.fn().mockReturnThis(),
      };
    });
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const req = new NextRequest(`http://localhost/api/copilot/admin/users/${TARGET_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: TARGET_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateMock).toHaveBeenCalled();
    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.is_active).toBe(false);
    expect(payload.deleted_at).toBeTruthy();
    expect(String(payload.email)).toContain("deleted+");
    expect(payload.pin_hash).toBeNull();
    expect(mocks.bumpUserCredentialVersion).toHaveBeenCalled();
  });
});
