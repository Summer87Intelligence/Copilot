import { beforeEach, describe, expect, it, vi } from "vitest";

import { INACTIVE_ACCOUNT_LOGIN_MESSAGE } from "@/lib/auth/app-user-lifecycle";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  hashPin: vi.fn(),
  verifyPinAgainstHash: vi.fn(),
  safeEqualPlaintextPin: vi.fn(),
  checkLoginRateLimit: vi.fn(),
  insertAuthLoginEvent: vi.fn(),
  getDefaultPermissionsForRole: vi.fn(),
  resolveEffectivePermissions: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/security/pin-hash", () => ({
  hashPin: mocks.hashPin,
  verifyPinAgainstHash: mocks.verifyPinAgainstHash,
  safeEqualPlaintextPin: mocks.safeEqualPlaintextPin,
}));

vi.mock("@/lib/security/login-rate-limit", () => ({
  checkLoginRateLimit: () => ({ allowed: true }),
  resolveLoginRateLimitMaxIp: () => 100,
  resolveLoginRateLimitMaxUser: () => 100,
  resolveLoginRateLimitWindowMs: () => 60_000,
}));

vi.mock("@/lib/security/auth-login-events", () => ({
  insertAuthLoginEvent: mocks.insertAuthLoginEvent,
  logAuthStructured: vi.fn(),
}));

vi.mock("@/lib/auth/role-permission-presets", () => ({
  getDefaultPermissionsForRole: mocks.getDefaultPermissionsForRole,
}));

vi.mock("@/lib/auth/module-permissions", () => ({
  resolveEffectivePermissions: mocks.resolveEffectivePermissions,
}));

vi.mock("@/lib/copilot-cookie-options", () => ({
  getCopilotSessionCookieSetOptions: () => ({}),
}));

vi.mock("@/lib/copilot-session-cookie", () => ({
  COPILOT_SESSION_COOKIE: "copilot_session",
  serializeCopilotSessionValue: vi.fn().mockReturnValue("signed-cookie"),
}));

vi.mock("@/lib/security/request-client-meta", () => ({
  getRequestClientMeta: () => ({ ip: "127.0.0.1", userAgent: "vitest" }),
}));

vi.mock("@/lib/auth/default-landing", () => ({
  getDefaultLandingForUser: () => "/copilot/tareas-diarias",
}));

import { POST } from "@/app/api/copilot/login/route";

function makeLoginAdmin(user: Record<string, unknown> | null) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: user, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue(updateChain),
    }),
  };
}

describe("POST /api/copilot/login — cuenta inactiva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.COPILOT_SESSION_SIGNING_SECRET = "test-secret-32chars-minimum!!";

    mocks.checkLoginRateLimit.mockReturnValue({ allowed: true });
    mocks.verifyPinAgainstHash.mockResolvedValue(true);
    mocks.hashPin.mockResolvedValue("hash");
    mocks.getDefaultPermissionsForRole.mockReturnValue([]);
    mocks.resolveEffectivePermissions.mockReturnValue([]);
    mocks.createClient.mockReturnValue(makeLoginAdmin(null));
  });

  it("usuario inactivo con PIN correcto no inicia sesión y muestra mensaje claro", async () => {
    const inactiveUser = {
      id: "user-1",
      company_id: "company-1",
      username: "juan",
      pin: null,
      pin_hash: "hash",
      role: "usuario",
      credential_version: 1,
      failed_login_count: 0,
      locked_until: null,
      is_active: false,
      deleted_at: null,
    };
    mocks.createClient.mockReturnValue(makeLoginAdmin(inactiveUser));

    const req = new Request("http://localhost/api/copilot/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: "juan", pin: "1234" }),
    });

    const res = await POST(req);
    const json = (await res.json()) as { ok: boolean; error?: string };

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error).toBe(INACTIVE_ACCOUNT_LOGIN_MESSAGE);
    expect(mocks.insertAuthLoginEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failureReason: "account_inactive", success: false })
    );
  });

  it("usuario activo con PIN correcto puede iniciar sesión", async () => {
    const activeUser = {
      id: "user-2",
      company_id: "company-1",
      username: "ana",
      pin: null,
      pin_hash: "hash",
      role: "usuario",
      credential_version: 1,
      failed_login_count: 0,
      locked_until: null,
      is_active: true,
      deleted_at: null,
    };

    const permChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };
    const admin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "app_user_permissions") return permChain;
        return makeLoginAdmin(activeUser).from("app_users");
      }),
    };
    mocks.createClient.mockReturnValue(admin);

    const req = new Request("http://localhost/api/copilot/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: "ana", pin: "1234" }),
    });

    const res = await POST(req);
    const json = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
