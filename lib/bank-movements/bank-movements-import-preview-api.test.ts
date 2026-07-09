import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  previewSantanderBankStatementPdfFiles: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/bank-movements/santander-pdf-preview-service.server", () => ({
  previewSantanderBankStatementPdfFiles: mocks.previewSantanderBankStatementPdfFiles,
  BANK_STATEMENT_PREVIEW_ERROR:
    "No pudimos leer este extracto. Revisá que sea un PDF de Santander con tabla de movimientos.",
}));

import { POST } from "@/app/api/copilot/bank-movements/imports/preview/route";
import { MAX_BULK_PDF_FILES } from "@/lib/bank-movements/bank-movements-import-constants";

const tenantCtx = {
  supabase: {},
  authUser: { id: "u1" },
  appUser: { id: "u1", role: "superadmin", company_id: "c1" },
  tenantCompanyId: "c1",
};

const readyPreview = {
  client_preview_id: "p1",
  file_name: "extracto-uyu.pdf",
  status: "ready" as const,
  bank_name: "Santander" as const,
  account_number: "000001211749",
  account_label: "Santander 000001211749 UYU",
  currency_code: "UYU" as const,
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  opening_balance: null,
  closing_balance: null,
  movements_count: 2,
  totals: { inflows: 100, outflows: 50, net: 50 },
  movements: [],
};

const bulkPayload = {
  files_count: 2,
  parsed_count: 2,
  failed_count: 0,
  total_movements_count: 5,
  totals_by_currency: {
    UYU: { inflows: 100, outflows: 50, net: 50, movements_count: 2 },
    USD: { inflows: 200, outflows: 0, net: 200, movements_count: 3 },
  },
  previews: [
    readyPreview,
    { ...readyPreview, client_preview_id: "p2", file_name: "extracto-usd.pdf", currency_code: "USD" as const },
  ],
  errors: [],
};

describe("POST /api/copilot/bank-movements/imports/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    mocks.previewSantanderBankStatementPdfFiles.mockResolvedValue(bulkPayload);
  });

  it("requiere write access", async () => {
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false }, { status: 403 }),
    });
    const form = new FormData();
    form.append("files", new File(["%PDF"], "extracto.pdf", { type: "application/pdf" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(403);
  });

  it("devuelve preview bulk sin persistir", async () => {
    const form = new FormData();
    form.append("files", new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    form.append("files", new File(["%PDF"], "b.pdf", { type: "application/pdf" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: typeof bulkPayload };
    expect(json.ok).toBe(true);
    expect(json.data.parsed_count).toBe(2);
    expect(json.data.total_movements_count).toBe(5);
    expect(mocks.previewSantanderBankStatementPdfFiles).toHaveBeenCalledOnce();
  });

  it("acepta campo file único para compatibilidad", async () => {
    const form = new FormData();
    form.append("file", new File(["%PDF"], "extracto.pdf", { type: "application/pdf" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.previewSantanderBankStatementPdfFiles).toHaveBeenCalledOnce();
  });

  it("rechaza archivos no PDF", async () => {
    const form = new FormData();
    form.append("files", new File(["a,b"], "extracto.csv", { type: "text/csv" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.previewSantanderBankStatementPdfFiles).not.toHaveBeenCalled();
  });

  it("rechaza más de 20 archivos", async () => {
    const form = new FormData();
    for (let i = 0; i < MAX_BULK_PDF_FILES + 1; i += 1) {
      form.append("files", new File(["%PDF"], `extracto-${i}.pdf`, { type: "application/pdf" }));
    }
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.previewSantanderBankStatementPdfFiles).not.toHaveBeenCalled();
  });
});
