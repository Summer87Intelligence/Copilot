import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotTenantContext: vi.fn(),
}));

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: mocks.requireCopilotTenantContext,
}));

import {
  requireCopilotModuleAccessAny,
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { resolveCopilotApiModuleKey } from "@/lib/auth/copilot-api-module-map";

const { requireCopilotTenantContext } = mocks;

function mockPermissionsSupabase(overrides: Array<{ module_key: string; access_level: string }> = []) {
  const eqUser = vi.fn().mockResolvedValue({ data: overrides });
  const eqWorkspace = vi.fn().mockReturnValue({ eq: eqUser });
  const select = vi.fn().mockReturnValue({ eq: eqWorkspace });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

const tenantCtx = {
  supabase: mockPermissionsSupabase(),
  authUser: { id: "auth-1" },
  appUser: {
    id: "u1",
    role: "cobranza",
    company_id: "ws-1",
    full_name: "Test",
    email: "t@test.com",
    created_at: "2026-01-01",
  },
  tenantCompanyId: "ws-1",
};

describe("resolveCopilotApiModuleKey", () => {
  it("mapea prefijos críticos", () => {
    expect(resolveCopilotApiModuleKey("/api/copilot/treasury/cash-position")).toBe("tesoreria");
    expect(resolveCopilotApiModuleKey("/api/copilot/dashboard/summary.pdf")).toBe("dashboard");
    expect(resolveCopilotApiModuleKey("/api/copilot/reports/debtors.pdf")).toBe("reportes");
    expect(resolveCopilotApiModuleKey("/api/copilot/financial-snapshot")).toBe("finanzas");
    expect(resolveCopilotApiModuleKey("/api/copilot/me")).toBeNull();
  });

  it("mapea rutas legacy Fase 4B", () => {
    expect(resolveCopilotApiModuleKey("/api/copilot/notifications")).toBe("hoy");
    expect(resolveCopilotApiModuleKey("/api/copilot/decision-engine/briefing")).toBe("acciones");
    expect(resolveCopilotApiModuleKey("/api/copilot/real-insights")).toBe("finanzas");
    expect(resolveCopilotApiModuleKey("/api/copilot/intelligence-bundle")).toBe("agentes");
    expect(resolveCopilotApiModuleKey("/api/copilot/operational-actions")).toBe("acciones");
    expect(resolveCopilotApiModuleKey("/api/copilot/cobranza/registrar-cobro")).toBe("cobranza");
    expect(resolveCopilotApiModuleKey("/api/copilot/operational-feed/timeline")).toBe("hoy");
    expect(resolveCopilotApiModuleKey("/api/copilot/integrations/zeta/sync-saldos-pendientes")).toBe(
      "datos"
    );
    expect(resolveCopilotApiModuleKey("/api/copilot/transfer-aliases")).toBe("clientes");
  });
});

describe("requireCopilotModuleAccess — dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantCtx.supabase = mockPermissionsSupabase();
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "usuario" },
      },
    });
  });

  it("401 anónimo en summary.pdf (sin sesión)", async () => {
    requireCopilotTenantContext.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 }),
    });
    const req = new NextRequest("http://localhost/api/copilot/dashboard/summary.pdf");
    const auth = await requireCopilotModuleAccess(req, "dashboard");
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("403 cuando dashboard=none y hoy=read (override)", async () => {
    const supabase = mockPermissionsSupabase([
      { module_key: "dashboard", access_level: "none" },
    ]);
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        supabase,
        appUser: { ...tenantCtx.appUser, role: "usuario" },
      },
    });
    const req = new NextRequest("http://localhost/api/copilot/dashboard/summary.pdf");
    const auth = await requireCopilotModuleAccess(req, "dashboard");
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(403);
      const body = await auth.response.json();
      expect(body.code).toBe("FORBIDDEN_MODULE");
      expect(body.moduleKey).toBe("dashboard");
    }
  });

  it("permite GET summary.pdf con dashboard=read (rol usuario)", async () => {
    tenantCtx.supabase = mockPermissionsSupabase();
    const req = new NextRequest("http://localhost/api/copilot/dashboard/summary.pdf");
    const auth = await requireCopilotModuleAccess(req, "dashboard");
    expect(auth.ok).toBe(true);
  });

  it("superadmin bypass en dashboard", async () => {
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "superadmin" },
      },
    });
    const req = new NextRequest("http://localhost/api/copilot/dashboard/summary.pdf");
    const auth = await requireCopilotModuleAccess(req, "dashboard");
    expect(auth.ok).toBe(true);
    expect(tenantCtx.supabase.from).not.toHaveBeenCalled();
  });
});

describe("requireCopilotModuleAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantCtx.supabase = mockPermissionsSupabase();
    requireCopilotTenantContext.mockResolvedValue({ ok: true, ctx: tenantCtx });
  });

  it("401 cuando no hay sesión (tenant auth falla)", async () => {
    requireCopilotTenantContext.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 }),
    });
    const req = new NextRequest("http://localhost/api/copilot/treasury/accounts");
    const auth = await requireCopilotModuleAccess(req, "tesoreria");
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("403 FORBIDDEN_MODULE cuando tesoreria=none (rol cobranza)", async () => {
    const req = new NextRequest("http://localhost/api/copilot/treasury/accounts");
    const auth = await requireCopilotModuleAccess(req, "tesoreria");
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(403);
      const body = await auth.response.json();
      expect(body.code).toBe("FORBIDDEN_MODULE");
      expect(body.moduleKey).toBe("tesoreria");
    }
  });

  it("permite GET con read en cartera (rol cobranza)", async () => {
    const req = new NextRequest("http://localhost/api/copilot/portfolio");
    const auth = await requireCopilotModuleAccess(req, "cartera");
    expect(auth.ok).toBe(true);
  });

  it("superadmin bypass sin consultar permisos", async () => {
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "superadmin" },
      },
    });
    const req = new NextRequest("http://localhost/api/copilot/treasury/accounts");
    const auth = await requireCopilotModuleAccess(req, "tesoreria");
    expect(auth.ok).toBe(true);
    expect(tenantCtx.supabase.from).not.toHaveBeenCalled();
  });
});

describe("requireCopilotModuleAccessAny", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantCtx.supabase = mockPermissionsSupabase([
      { module_key: "cartera", access_level: "none" },
      { module_key: "cobranza", access_level: "read" },
      { module_key: "clientes", access_level: "read" },
    ]);
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "usuario" },
      },
    });
  });

  it("permite datasets compartidos si el usuario lee al menos un módulo consumidor", async () => {
    const req = new NextRequest("http://localhost/api/copilot/portfolio");
    const auth = await requireCopilotModuleAccessAny(req, ["cartera", "cobranza", "clientes"]);
    expect(auth.ok).toBe(true);
  });

  it("403 cuando ningún módulo consumidor está habilitado", async () => {
    const supabase = mockPermissionsSupabase([
      { module_key: "cartera", access_level: "none" },
      { module_key: "cobranza", access_level: "none" },
      { module_key: "clientes", access_level: "none" },
    ]);
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        supabase,
        appUser: { ...tenantCtx.appUser, role: "usuario" },
      },
    });
    const req = new NextRequest("http://localhost/api/copilot/portfolio");
    const auth = await requireCopilotModuleAccessAny(req, ["cartera", "cobranza", "clientes"]);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(403);
      const body = await auth.response.json();
      expect(body.code).toBe("FORBIDDEN_MODULE");
      expect(body.moduleKeys).toEqual(["cartera", "cobranza", "clientes"]);
    }
  });
});

describe("requireCopilotModuleWriteAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantCtx.supabase = mockPermissionsSupabase();
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "tesoreria" },
      },
    });
  });

  it("403 cuando módulo es read-only (rol usuario en tesoreria)", async () => {
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "usuario" },
      },
    });
    const req = new NextRequest("http://localhost/api/copilot/treasury/accounts", {
      method: "POST",
    });
    const auth = await requireCopilotModuleWriteAccess(req, "tesoreria");
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(403);
      const body = await auth.response.json();
      expect(body.code).toBe("FORBIDDEN_MODULE");
    }
  });

  it("permite POST con write (rol tesoreria)", async () => {
    const req = new NextRequest("http://localhost/api/copilot/treasury/accounts", {
      method: "POST",
    });
    const auth = await requireCopilotModuleWriteAccess(req, "tesoreria");
    expect(auth.ok).toBe(true);
  });

  it("403 READ_ONLY_USER para demo_readonly aunque override tenga write", async () => {
    tenantCtx.supabase = mockPermissionsSupabase([
      { module_key: "datos", access_level: "write" },
    ]);
    requireCopilotTenantContext.mockResolvedValue({
      ok: true,
      ctx: {
        ...tenantCtx,
        appUser: { ...tenantCtx.appUser, role: "demo_readonly" },
      },
    });
    const req = new NextRequest("http://localhost/api/copilot/data/companies/create", {
      method: "POST",
    });
    const auth = await requireCopilotModuleWriteAccess(req, "datos");
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      const body = await auth.response.json();
      expect(body.error).toBe("READ_ONLY_USER");
    }
  });
});
