import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  confirmSantanderBankStatementImport: vi.fn(),
  confirmSantanderBankStatementImportsBulk: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/bank-movements/santander-bank-statement-import-persist.server", () => ({
  confirmSantanderBankStatementImport: mocks.confirmSantanderBankStatementImport,
  confirmSantanderBankStatementImportsBulk: mocks.confirmSantanderBankStatementImportsBulk,
}));

import { POST } from "@/app/api/copilot/bank-movements/imports/confirm/route";
import { buildSantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import {
  SANTANDER_USD_JULY_AUSZUG_FIXTURE,
  SANTANDER_UYU_JULY_AUSZUG_FIXTURE,
} from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "user-abc", role: "superadmin", company_id: "c1" },
  tenantCompanyId: "c1",
};

function previewBodyFromFixture(fixture: string) {
  const { movements_count: _mc, totals: _t, ...preview } = buildSantanderBankStatementPreview(fixture);
  return preview;
}

function singlePayload() {
  return {
    file_name: "auszug-julio.pdf",
    file_type: "application/pdf" as const,
    preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE),
  };
}

function bulkPayload() {
  return {
    previews: [
      { file_name: "uyu.pdf", preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE) },
      { file_name: "usd.pdf", preview: previewBodyFromFixture(SANTANDER_USD_JULY_AUSZUG_FIXTURE) },
    ],
  };
}

const bulkResult = {
  files_count: 2,
  imported_files_count: 2,
  failed_files_count: 0,
  total_preview_count: 5,
  inserted_count: 5,
  skipped_duplicates_count: 0,
  results: [
    {
      file_name: "uyu.pdf",
      import_id: "import-uyu",
      inserted_count: 3,
      skipped_duplicates_count: 0,
      total_preview_count: 3,
      status: "imported" as const,
    },
    {
      file_name: "usd.pdf",
      import_id: "import-usd",
      inserted_count: 2,
      skipped_duplicates_count: 0,
      total_preview_count: 2,
      status: "imported" as const,
    },
  ],
  errors: [],
};

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
    mocks.confirmSantanderBankStatementImportsBulk.mockResolvedValue(bulkResult);
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
        body: JSON.stringify(singlePayload()),
      })
    );
    expect(res.status).toBe(403);
  });

  it("confirma importación single con workspace del server", async () => {
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(singlePayload()),
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
    expect(mocks.confirmSantanderBankStatementImportsBulk).not.toHaveBeenCalled();
  });

  it("confirma importación bulk UYU + USD", async () => {
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkPayload()),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: typeof bulkResult };
    expect(json.data.imported_files_count).toBe(2);
    expect(json.data.results).toHaveLength(2);
    expect(mocks.confirmSantanderBankStatementImportsBulk).toHaveBeenCalledOnce();
  });

  it("rechaza payload sin bank_name Santander", async () => {
    const body = singlePayload();
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

  it("rechaza payload bulk inválido", async () => {
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previews: [] }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.confirmSantanderBankStatementImportsBulk).not.toHaveBeenCalled();
  });
});
