import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCopilotModuleWriteAccess: vi.fn(),
  previewSantanderBankStatementFiles: vi.fn(),
  copilotRequestLogger: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: mocks.requireCopilotModuleWriteAccess,
}));

vi.mock("@/lib/bank-movements/santander-pdf-preview-service.server", () => ({
  previewSantanderBankStatementFiles: mocks.previewSantanderBankStatementFiles,
  previewSantanderBankStatementPdfFiles: mocks.previewSantanderBankStatementFiles,
  BANK_STATEMENT_PREVIEW_ERROR:
    "No pudimos leer este archivo. Revisá que sea un PDF o Excel consolidado de Santander con tabla de movimientos.",
}));

vi.mock("@/lib/copilot-structured-logger", () => ({
  copilotRequestLogger: mocks.copilotRequestLogger,
}));

import { POST } from "@/app/api/copilot/bank-movements/imports/preview/route";
import {
  MAX_BANK_STATEMENT_PDF_BYTES,
  MAX_BULK_PDF_FILES,
  MAX_BULK_TOTAL_BYTES,
} from "@/lib/bank-movements/bank-movements-import-constants";

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

function makeLogger() {
  const logger = {
    requestId: "req-test",
    withTenant: vi.fn(),
    withSyncRunId: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  logger.withTenant.mockReturnValue(logger);
  logger.withSyncRunId.mockReturnValue(logger);
  return logger;
}

describe("POST /api/copilot/bank-movements/imports/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCopilotModuleWriteAccess.mockResolvedValue({ ok: true, ctx: tenantCtx });
    mocks.previewSantanderBankStatementFiles.mockResolvedValue(bulkPayload);
    mocks.copilotRequestLogger.mockReturnValue(makeLogger());
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
    expect(mocks.previewSantanderBankStatementFiles).toHaveBeenCalledOnce();
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
    expect(mocks.previewSantanderBankStatementFiles).toHaveBeenCalledOnce();
  });

  it("acepta archivos xlsx consolidados", async () => {
    const form = new FormData();
    form.append(
      "files",
      new File([new Uint8Array([1, 2, 3])], "consolidado.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.previewSantanderBankStatementFiles).toHaveBeenCalledOnce();
  });

  it("rechaza archivos no PDF ni xlsx", async () => {
    const form = new FormData();
    form.append("files", new File(["a,b"], "extracto.csv", { type: "text/csv" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toContain("PDF o Excel");
    expect(mocks.previewSantanderBankStatementFiles).not.toHaveBeenCalled();
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
    expect(mocks.previewSantanderBankStatementFiles).not.toHaveBeenCalled();
  });

  it("rechaza archivo individual demasiado grande", async () => {
    const form = new FormData();
    form.append(
      "files",
      new File([new Uint8Array(MAX_BANK_STATEMENT_PDF_BYTES + 1)], "grande.pdf", {
        type: "application/pdf",
      })
    );
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: string };
    expect(json.error).toContain("grande.pdf");
    expect(mocks.previewSantanderBankStatementFiles).not.toHaveBeenCalled();
  });

  it("rechaza lote con tamaño total excesivo", async () => {
    const form = new FormData();
    const perFile = Math.floor(MAX_BULK_TOTAL_BYTES / 2) + 1;
    form.append(
      "files",
      new File([new Uint8Array(perFile)], "a.pdf", { type: "application/pdf" })
    );
    form.append(
      "files",
      new File([new Uint8Array(perFile)], "b.pdf", { type: "application/pdf" })
    );
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: string };
    expect(json.error).toContain("lote supera el tamaño máximo");
    expect(mocks.previewSantanderBankStatementFiles).not.toHaveBeenCalled();
  });

  it("devuelve JSON ok:false ante error inesperado del service", async () => {
    mocks.previewSantanderBankStatementFiles.mockRejectedValue(new Error("XLSX_RUNTIME_FAIL"));
    const form = new FormData();
    form.append("files", new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    const res = await POST(
      new NextRequest("https://example.test/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: false; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toContain("Intentá de nuevo");
  });
});
