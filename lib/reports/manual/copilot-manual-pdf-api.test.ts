import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotTenantContext: vi.fn(),
  requireCopilotWriteContext: vi.fn(),
  renderCopilotManualPdf: vi.fn(),
}));

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: mocks.requireCopilotTenantContext,
  requireCopilotWriteContext: mocks.requireCopilotWriteContext,
}));

vi.mock("@/lib/reports/manual/render-copilot-manual-pdf", () => ({
  renderCopilotManualPdf: mocks.renderCopilotManualPdf,
}));

const { requireCopilotTenantContext, requireCopilotWriteContext, renderCopilotManualPdf } =
  mocks;

import { GET } from "@/app/api/copilot/manual.pdf/route";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "u1", role: "demo_readonly", company_id: "c1" },
  tenantCompanyId: "c1",
};

describe("GET /api/copilot/manual.pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCopilotTenantContext.mockResolvedValue({ ok: true, ctx: tenantCtx });
    renderCopilotManualPdf.mockResolvedValue(
      Buffer.from("%PDF-1.4 manual Manual de Usuario Roles y permisos")
    );
  });

  it("responde application/pdf para usuario solo lectura sin requireCopilotWriteContext", async () => {
    const req = new NextRequest("http://localhost/api/copilot/manual.pdf");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("manual-uso-copilot.pdf");
    expect(requireCopilotTenantContext).toHaveBeenCalled();
    expect(requireCopilotWriteContext).not.toHaveBeenCalled();
    expect(renderCopilotManualPdf).toHaveBeenCalled();
  });
});
