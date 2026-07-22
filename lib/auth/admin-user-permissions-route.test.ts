import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RBAC-BANK-ACCESS-URGENT-FIX-001 — cobertura de persistencia de permisos.
 * El bug reproducido no estaba acá (la persistencia ya era correcta: upsert
 * por user_id+workspace_id+module_key), pero no existía ningún test que lo
 * confirmara. Cubre además el contrato de niveles inválidos/escalada.
 */

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
}));

vi.mock("@/lib/auth/admin-api-auth", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

import { PATCH } from "@/app/api/copilot/admin/users/[id]/permissions/route";

const TENANT = "workspace-1";
const TARGET_ID = "target-user-1";

function makeUserLookupChain(data: { id: string; role: string } | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function adminAuthOk(admin: unknown) {
  return {
    ok: true as const,
    ctx: { admin, tenantCompanyId: TENANT, actorId: "actor-1" },
  };
}

function makeRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/copilot/admin/users/${TARGET_ID}/permissions`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/copilot/admin/users/:id/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persiste bank_movements en write vía upsert por user_id (no email)", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "app_users") {
          return makeUserLookupChain({ id: TARGET_ID, role: "usuario" });
        }
        return { upsert: upsertMock };
      }),
    };
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const res = await PATCH(
      makeRequest({ permissions: [{ moduleKey: "bank_movements", accessLevel: "write" }] }),
      { params: Promise.resolve({ id: TARGET_ID }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          workspace_id: TENANT,
          user_id: TARGET_ID,
          module_key: "bank_movements",
          access_level: "write",
        },
      ],
      { onConflict: "workspace_id,user_id,module_key" }
    );
    // No debe referenciar email en ningún punto del upsert.
    const upsertedRow = upsertMock.mock.calls[0]![0]![0] as Record<string, unknown>;
    expect(Object.keys(upsertedRow)).not.toContain("email");
  });

  it("persiste bank_movements en read", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "app_users") {
          return makeUserLookupChain({ id: TARGET_ID, role: "usuario" });
        }
        return { upsert: upsertMock };
      }),
    };
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const res = await PATCH(
      makeRequest({ permissions: [{ moduleKey: "bank_movements", accessLevel: "read" }] }),
      { params: Promise.resolve({ id: TARGET_ID }) }
    );
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      [{ workspace_id: TENANT, user_id: TARGET_ID, module_key: "bank_movements", access_level: "read" }],
      { onConflict: "workspace_id,user_id,module_key" }
    );
  });

  it("rechaza moduleKey inválido sin llamar upsert", async () => {
    const upsertMock = vi.fn();
    const admin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "app_users") return makeUserLookupChain({ id: TARGET_ID, role: "usuario" });
        return { upsert: upsertMock };
      }),
    };
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const res = await PATCH(
      makeRequest({ permissions: [{ moduleKey: "banco", accessLevel: "write" }] }),
      { params: Promise.resolve({ id: TARGET_ID }) }
    );
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rechaza escalar a nivel 'admin' en bank_movements para rol no-superadmin", async () => {
    const upsertMock = vi.fn();
    const admin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "app_users") return makeUserLookupChain({ id: TARGET_ID, role: "usuario" });
        return { upsert: upsertMock };
      }),
    };
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const res = await PATCH(
      makeRequest({ permissions: [{ moduleKey: "bank_movements", accessLevel: "admin" }] }),
      { params: Promise.resolve({ id: TARGET_ID }) }
    );
    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("404 si el usuario no pertenece al workspace del admin", async () => {
    const admin = {
      from: vi.fn().mockImplementation(() => makeUserLookupChain(null)),
    };
    mocks.requireAdminContext.mockResolvedValue(adminAuthOk(admin));

    const res = await PATCH(
      makeRequest({ permissions: [{ moduleKey: "bank_movements", accessLevel: "write" }] }),
      { params: Promise.resolve({ id: TARGET_ID }) }
    );
    expect(res.status).toBe(404);
  });
});
