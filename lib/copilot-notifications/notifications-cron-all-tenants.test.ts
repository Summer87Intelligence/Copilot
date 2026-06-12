import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const fetchActiveWorkspaceIdPageMock = vi.fn();
const generateMock = vi.fn();

vi.mock("@/lib/cron/zeta-cron-workspace-pages", () => ({
  fetchActiveWorkspaceIdPage: (...args: unknown[]) => fetchActiveWorkspaceIdPageMock(...args),
}));

vi.mock("@/lib/copilot-notifications/generate-operational-notifications", () => ({
  generateOperationalNotificationsForWorkspace: (...args: unknown[]) =>
    generateMock(...args),
}));

// Stub @supabase/supabase-js — the route only needs a non-null client.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({}) }),
}));

function makeRequest(headers: Record<string, string> = {}): import("next/server").NextRequest {
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("/api/cron/notifications-generate-all-tenants GET", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchActiveWorkspaceIdPageMock.mockReset();
    generateMock.mockReset();
    process.env.CRON_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("rechaza sin Authorization Bearer CRON_SECRET → 401", async () => {
    const mod = await import(
      "@/app/api/cron/notifications-generate-all-tenants/route"
    );
    const res = await mod.GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("unauthorized");
    expect(fetchActiveWorkspaceIdPageMock).not.toHaveBeenCalled();
  });

  it("falla con 500 si faltan envs de service role", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const mod = await import(
      "@/app/api/cron/notifications-generate-all-tenants/route"
    );
    const res = await mod.GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("missing_service_role");
  });

  it("procesa múltiples tenants y agrega contadores", async () => {
    fetchActiveWorkspaceIdPageMock.mockResolvedValueOnce({
      ids: ["w1", "w2", "w3"],
      nextAfterId: null,
    });
    generateMock
      .mockResolvedValueOnce({ ok: true, created: 3, skipped: 1, byType: {} })
      .mockResolvedValueOnce({ ok: true, created: 0, skipped: 0, byType: {} })
      .mockResolvedValueOnce({ ok: true, created: 5, skipped: 2, byType: {} });

    const mod = await import(
      "@/app/api/cron/notifications-generate-all-tenants/route"
    );
    const res = await mod.GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.tenants_total).toBe(3);
    expect(json.tenants_processed).toBe(3);
    expect(json.tenants_failed).toBe(0);
    expect(json.notifications_created).toBe(8);
    expect(json.notifications_skipped).toBe(3);
    expect(json.errors).toEqual([]);
    expect(generateMock).toHaveBeenCalledTimes(3);
  });

  it("aísla errores por tenant: uno falla, los otros siguen", async () => {
    fetchActiveWorkspaceIdPageMock.mockResolvedValueOnce({
      ids: ["w1", "w2", "w3"],
      nextAfterId: null,
    });
    generateMock
      .mockResolvedValueOnce({ ok: true, created: 2, skipped: 0, byType: {} })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, created: 1, skipped: 0, byType: {} });

    const mod = await import(
      "@/app/api/cron/notifications-generate-all-tenants/route"
    );
    const res = await mod.GET(makeRequest({ authorization: "Bearer test-secret" }));
    const json = await res.json();
    expect(json.tenants_processed).toBe(2);
    expect(json.tenants_failed).toBe(1);
    expect(json.notifications_created).toBe(3);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0]).toEqual({ workspace_id: "w2", error: "boom" });
  });

  it("ok=false del generator cuenta como fallo (no aborta)", async () => {
    fetchActiveWorkspaceIdPageMock.mockResolvedValueOnce({
      ids: ["w1", "w2"],
      nextAfterId: null,
    });
    generateMock
      .mockResolvedValueOnce({ ok: false, created: 0, skipped: 0, byType: {} })
      .mockResolvedValueOnce({ ok: true, created: 4, skipped: 0, byType: {} });

    const mod = await import(
      "@/app/api/cron/notifications-generate-all-tenants/route"
    );
    const res = await mod.GET(makeRequest({ authorization: "Bearer test-secret" }));
    const json = await res.json();
    expect(json.tenants_processed).toBe(1);
    expect(json.tenants_failed).toBe(1);
    expect(json.notifications_created).toBe(4);
  });
});
