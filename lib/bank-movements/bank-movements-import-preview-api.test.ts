import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  previewSantanderBankStatementPdfBuffer: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/bank-movements/santander-pdf-preview-service.server", () => ({
  previewSantanderBankStatementPdfBuffer: mocks.previewSantanderBankStatementPdfBuffer,
  BANK_STATEMENT_PREVIEW_ERROR:
    "No pudimos leer este extracto. Revisá que sea un PDF de Santander con tabla de movimientos.",
}));

import { POST } from "@/app/api/copilot/bank-movements/imports/preview/route";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "u1", role: "superadmin", company_id: "c1" },
  tenantCompanyId: "c1",
};

const previewPayload = {
  bank_name: "Santander" as const,
  account_number: "000001211749",
  currency_code: "UYU" as const,
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  opening_balance: null,
  closing_balance: null,
  movements_count: 1,
  totals: { inflows: 0, outflows: 100, net: -100 },
  movements: [],
};

describe("POST /api/copilot/bank-movements/imports/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    mocks.previewSantanderBankStatementPdfBuffer.mockResolvedValue(previewPayload);
  });

  it("requiere write access", async () => {
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false }, { status: 403 }),
    });
    const form = new FormData();
    form.append("file", new File(["%PDF"], "extracto.pdf", { type: "application/pdf" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(403);
  });

  it("devuelve preview sin persistir", async () => {
    const form = new FormData();
    form.append("file", new File(["%PDF"], "extracto.pdf", { type: "application/pdf" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: typeof previewPayload };
    expect(json.ok).toBe(true);
    expect(json.data.account_number).toBe("000001211749");
    expect(mocks.previewSantanderBankStatementPdfBuffer).toHaveBeenCalledOnce();
  });

  it("rechaza archivos no PDF", async () => {
    const form = new FormData();
    form.append("file", new File(["a,b"], "extracto.csv", { type: "text/csv" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.previewSantanderBankStatementPdfBuffer).not.toHaveBeenCalled();
  });
});
