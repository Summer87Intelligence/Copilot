import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

import {
  isZetaApiPath,
  isZetaCronAuthRoute,
  isZetaCronAuthorized,
  requireZetaCronAuth,
  requireZetaSuperAdminAuth,
  zetaCronUnauthorizedResponse,
} from "./zeta-api-auth";

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: vi.fn(),
}));

const mockRequireCopilotTenantContext = vi.mocked(requireCopilotTenantContext);

describe("zeta-api-auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("isZetaApiPath", () => {
    it("detecta rutas bajo /api/zeta/", () => {
      expect(isZetaApiPath("/api/zeta/test-connection")).toBe(true);
      expect(isZetaApiPath("/api/copilot/login")).toBe(false);
    });
  });

  describe("isZetaCronAuthRoute", () => {
    it("solo marca sync-installments-backfill", () => {
      expect(isZetaCronAuthRoute("/api/zeta/sync-installments-backfill")).toBe(true);
      expect(isZetaCronAuthRoute("/api/zeta/resync")).toBe(false);
    });
  });

  describe("cron auth", () => {
    it("acceso anónimo sin secret → no autorizado", () => {
      vi.stubEnv("CRON_SECRET", "test-cron-secret");
      const req = new NextRequest("http://localhost/api/zeta/sync-installments-backfill", {
        method: "POST",
      });
      expect(isZetaCronAuthorized(req)).toBe(false);
      expect(requireZetaCronAuth(req).ok).toBe(false);
    });

    it("cron sin secret configurado → 401", () => {
      delete process.env.CRON_SECRET;
      const req = new NextRequest("http://localhost/api/zeta/sync-installments-backfill", {
        method: "POST",
        headers: { authorization: "Bearer anything" },
      });
      const result = requireZetaCronAuth(req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(401);
        expect(zetaCronUnauthorizedResponse().status).toBe(401);
      }
    });

    it("cron con secret válido → OK", () => {
      vi.stubEnv("CRON_SECRET", "test-cron-secret");
      const req = new NextRequest("http://localhost/api/zeta/sync-installments-backfill", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      });
      expect(isZetaCronAuthorized(req)).toBe(true);
      expect(requireZetaCronAuth(req)).toEqual({ ok: true });
    });
  });

  describe("requireZetaSuperAdminAuth", () => {
    it("acceso anónimo → 401", async () => {
      mockRequireCopilotTenantContext.mockResolvedValue({
        ok: false,
        response: new Response(JSON.stringify({ ok: false, code: "UNAUTHENTICATED" }), {
          status: 401,
        }) as never,
      });

      const req = new NextRequest("http://localhost/api/zeta/test-connection");
      const result = await requireZetaSuperAdminAuth(req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(401);
      }
    });

    it("usuario autenticado superadmin → OK", async () => {
      mockRequireCopilotTenantContext.mockResolvedValue({
        ok: true,
        ctx: {
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
        },
      });

      const req = new NextRequest("http://localhost/api/zeta/test-connection");
      const result = await requireZetaSuperAdminAuth(req);
      expect(result.ok).toBe(true);
    });

    it("usuario autenticado no superadmin → 403", async () => {
      mockRequireCopilotTenantContext.mockResolvedValue({
        ok: true,
        ctx: {
          supabase: {} as never,
          authUser: {} as never,
          appUser: {
            id: "u1",
            company_id: "c1",
            full_name: "User",
            email: "u@test.com",
            role: "user",
            created_at: "2026-01-01T00:00:00Z",
          },
          tenantCompanyId: "c1",
        },
      });

      const req = new NextRequest("http://localhost/api/zeta/clients");
      const result = await requireZetaSuperAdminAuth(req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
      }
    });
  });
});
