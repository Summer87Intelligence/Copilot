import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveBankImportAuthMode } from "@/lib/auth/bank-import-auth-mode";
import { shouldBlockReadOnlyApiMutation } from "@/lib/auth/read-only-post-allowed";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleAccess: vi.fn(),
  requireCopilotModuleWriteAccess: vi.fn(),
  bankReconciliationImportSantander: vi.fn(),
  parseSantanderBankStatementPdfBuffer: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleAccess: mocks.requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/treasury/services/bank-reconciliation-import-service", () => ({
  bankReconciliationImportSantander: mocks.bankReconciliationImportSantander,
}));

vi.mock("@/lib/treasury/services/santander-bank-statement-parse-service", () => ({
  parseSantanderBankStatementPdfBuffer: mocks.parseSantanderBankStatementPdfBuffer,
}));

const {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
  bankReconciliationImportSantander,
  parseSantanderBankStatementPdfBuffer,
} = mocks;

import { POST as postImport } from "@/app/api/copilot/treasury/bank-reconciliation-movements/import/route";
import { POST as postParse } from "@/app/api/copilot/treasury/bank-reconciliation-movements/parse/route";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "u1", role: "demo_readonly", company_id: "c1" },
  tenantCompanyId: "c1",
};

const previewRow = {
  movement_date: "2026-05-27",
  description: "Cobro test",
  amount: 366,
  currency_code: "USD",
  movement_type: "credit",
  external_id: "santander:test",
};

describe("resolveBankImportAuthMode", () => {
  it("apply false o ausente => read", () => {
    expect(resolveBankImportAuthMode(false)).toBe("read");
    expect(resolveBankImportAuthMode(undefined)).toBe("read");
  });
  it("apply true => write", () => {
    expect(resolveBankImportAuthMode(true)).toBe("write");
  });
});

describe("Santander import/parse API RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankReconciliationImportSantander.mockResolvedValue({
      ok: true,
      data: {
        preview: [],
        summary: { total: 0 },
        imported: [],
        importedCount: 0,
        skippedDuplicates: 0,
        autoMatchedCount: 0,
      },
      message: "Preview",
    });
    parseSantanderBankStatementPdfBuffer.mockResolvedValue({
      metadata: { currencyCode: "USD" },
      movements: [],
    });
  });

  it("demo_readonly POST parse => 200 con module read access", async () => {
    requireCopilotModuleAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    const file = new File(["%PDF"], "extracto.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.append("file", file);
    const res = await postParse(
      new NextRequest(
        "https://example.test/api/copilot/treasury/bank-reconciliation-movements/parse",
        { method: "POST", body: form }
      )
    );
    expect(res.status).toBe(200);
    expect(requireCopilotModuleWriteAccess).not.toHaveBeenCalled();
  });

  it("demo_readonly POST import apply=false => 200", async () => {
    requireCopilotModuleAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    const res = await postImport(
      new NextRequest(
        "https://example.test/api/copilot/treasury/bank-reconciliation-movements/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply: false, rows: [previewRow] }),
        }
      )
    );
    expect(res.status).toBe(200);
    expect(requireCopilotModuleAccess).toHaveBeenCalled();
    expect(requireCopilotModuleWriteAccess).not.toHaveBeenCalled();
  });

  it("demo_readonly POST import apply=true => 403", async () => {
    requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: "READ_ONLY_USER", message: "solo lectura" },
        { status: 403 }
      ),
    });
    const res = await postImport(
      new NextRequest(
        "https://example.test/api/copilot/treasury/bank-reconciliation-movements/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apply: true,
            account_id: "00000000-0000-4000-8000-000000000001",
            rows: [previewRow],
          }),
        }
      )
    );
    expect(res.status).toBe(403);
    expect(bankReconciliationImportSantander).not.toHaveBeenCalled();
  });

  it("superadmin POST import apply=true usa write context", async () => {
    requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: true,
      ctx: { ...tenantCtx, appUser: { role: "superadmin" } },
    });
    const res = await postImport(
      new NextRequest(
        "https://example.test/api/copilot/treasury/bank-reconciliation-movements/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apply: true,
            account_id: "00000000-0000-4000-8000-000000000001",
            rows: [previewRow],
          }),
        }
      )
    );
    expect(res.status).toBe(200);
    expect(requireCopilotModuleWriteAccess).toHaveBeenCalled();
  });

  it("middleware bloquea manual cash POST para read-only", () => {
    expect(
      shouldBlockReadOnlyApiMutation("/api/copilot/treasury/manual-cash-movements", "POST")
    ).toBe(true);
  });

  it("middleware bloquea zeta sync POST para read-only", () => {
    expect(shouldBlockReadOnlyApiMutation("/api/zeta/sync-contacts", "POST")).toBe(true);
  });
});
