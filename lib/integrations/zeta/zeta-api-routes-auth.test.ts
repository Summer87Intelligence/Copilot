import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: vi.fn(),
}));

vi.mock("@/lib/integrations/zeta/zeta-clients", () => ({
  fetchZetaClients: vi.fn().mockResolvedValue({
    ok: true,
    requestUrl: "https://zeta.example/contacts",
    httpStatus: 200,
    extractedRows: [],
    warnings: [],
    errors: [],
    parsedJson: null,
    rawText: "{}",
  }),
}));

vi.mock("@/lib/integrations/zeta/zeta-connection", () => ({
  buildZetaConnectionBlock: vi.fn().mockReturnValue({}),
  ZetaConfigurationError: class ZetaConfigurationError extends Error {},
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        not: vi.fn(() => query),
        order: vi.fn(() => query),
        in: vi.fn(() => query),
        limit: vi.fn(() => query),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return query;
    }),
  })),
}));

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { GET as testClientsGet } from "@/app/api/zeta/test-clients/route";
import { GET as testConnectionGet } from "@/app/api/zeta/test-connection/route";
import { POST as syncInstallmentsBackfillPost } from "@/app/api/zeta/sync-installments-backfill/route";

const mockAuth = vi.mocked(requireCopilotTenantContext);

const superadminCtx = {
  supabase: {} as never,
  authUser: {} as never,
  appUser: {
    id: "u1",
    company_id: "c1",
    full_name: "Admin",
    email: "a@test.com",
    role: "superadmin",
    created_at: "2026-01-01T00:00:00Z",
  },
  tenantCompanyId: "c1",
};

describe("Zeta route handlers — auth enforcement", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("test-clients: anónimo → 401", async () => {
    mockAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    });

    const res = await testClientsGet(
      new NextRequest("http://localhost/api/zeta/test-clients")
    );
    expect(res.status).toBe(401);
  });

  it("test-clients: superadmin autenticado → no 401/403", async () => {
    mockAuth.mockResolvedValue({ ok: true, ctx: superadminCtx });

    const res = await testClientsGet(
      new NextRequest("http://localhost/api/zeta/test-clients")
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("test-connection: anónimo → 401", async () => {
    mockAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    });

    const res = await testConnectionGet(
      new NextRequest("http://localhost/api/zeta/test-connection")
    );
    expect(res.status).toBe(401);
  });

  it("sync-installments-backfill: cron sin secret → 401", async () => {
    delete process.env.CRON_SECRET;

    const res = await syncInstallmentsBackfillPost(
      new NextRequest("http://localhost/api/zeta/sync-installments-backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceCompanyId: "040321ff-10fd-4da3-aeca-f1865f879986" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("sync-installments-backfill: cron con secret → no 401 por auth", async () => {
    vi.stubEnv("CRON_SECRET", "route-test-secret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const res = await syncInstallmentsBackfillPost(
      new NextRequest("http://localhost/api/zeta/sync-installments-backfill", {
        method: "POST",
        headers: {
          authorization: "Bearer route-test-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ workspaceCompanyId: "040321ff-10fd-4da3-aeca-f1865f879986", dryRun: true }),
      })
    );
    expect(res.status).not.toBe(401);
  });
});
