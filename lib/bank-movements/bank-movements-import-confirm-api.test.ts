import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  confirmSantanderBankStatementImport: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/bank-movements/santander-bank-statement-import-persist.server", () => ({
  confirmSantanderBankStatementImport: mocks.confirmSantanderBankStatementImport,
}));

import { POST } from "@/app/api/copilot/bank-movements/imports/confirm/route";
import { buildSantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import { SANTANDER_UYU_JULY_AUSZUG_FIXTURE } from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "user-abc", role: "superadmin", company_id: "c1" },
  tenantCompanyId: "c1",
};

function previewPayload() {
  const { movements_count: _mc, totals: _t, ...preview } =
    buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
  return {
    file_name: "auszug-julio.pdf",
    file_type: "application/pdf" as const,
    preview,
  };
}

describe("POST /api/copilot/bank-movements/imports/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    mocks.confirmSantanderBankStatementImport.mockResolvedValue({
      import_id: "import-1",
      inserted_count: 3,
      skipped_duplicates_count: 0,
      total_preview_count: 3,
    });
  });

  it("requiere write access", async () => {
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false }, { status: 403 }),
    });
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewPayload()),
      })
    );
    expect(res.status).toBe(403);
  });

  it("confirma importación con workspace del server", async () => {
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewPayload()),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.confirmSantanderBankStatementImport).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "c1",
        importedBy: "user-abc",
        fileName: "auszug-julio.pdf",
      })
    );
  });

  it("rechaza payload sin bank_name Santander", async () => {
    const body = previewPayload();
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          preview: { ...body.preview, bank_name: "Otro" },
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.confirmSantanderBankStatementImport).not.toHaveBeenCalled();
  });
});
