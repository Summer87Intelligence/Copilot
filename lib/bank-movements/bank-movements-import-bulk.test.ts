import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  extractTextFromPdfBuffer: vi.fn(),
}));

vi.mock("@/lib/treasury/santander-pdf-text-extract.server", () => ({
  extractTextFromPdfBuffer: mocks.extractTextFromPdfBuffer,
}));

import {
  SANTANDER_USD_JULY_AUSZUG_FIXTURE,
  SANTANDER_UYU_JULY_AUSZUG_FIXTURE,
  NON_SANTANDER_BANK_PDF_FIXTURE,
} from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";
import {
  addPreviewToCurrencyTotals,
  emptyCurrencyTotals,
} from "@/lib/bank-movements/bank-movements-import-bulk";
import { buildSantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import { previewSantanderBankStatementPdfFiles } from "@/lib/bank-movements/santander-pdf-preview-service.server";

describe("previewSantanderBankStatementPdfFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preview bulk con 2 PDFs válidos suma movimientos y totales por moneda", async () => {
    mocks.extractTextFromPdfBuffer
      .mockResolvedValueOnce(SANTANDER_UYU_JULY_AUSZUG_FIXTURE)
      .mockResolvedValueOnce(SANTANDER_USD_JULY_AUSZUG_FIXTURE);

    const uyu = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const usd = buildSantanderBankStatementPreview(SANTANDER_USD_JULY_AUSZUG_FIXTURE);

    const data = await previewSantanderBankStatementPdfFiles([
      { fileName: "uyu.pdf", buffer: Buffer.from("%PDF-uyu") },
      { fileName: "usd.pdf", buffer: Buffer.from("%PDF-usd") },
    ]);

    expect(data.parsed_count).toBe(2);
    expect(data.failed_count).toBe(0);
    expect(data.total_movements_count).toBe(uyu.movements_count + usd.movements_count);
    expect(data.totals_by_currency.UYU.movements_count).toBe(uyu.movements_count);
    expect(data.totals_by_currency.USD.movements_count).toBe(usd.movements_count);
    expect(data.totals_by_currency.UYU.inflows).toBe(uyu.totals.inflows);
    expect(data.totals_by_currency.USD.outflows).toBe(usd.totals.outflows);
  });

  it("preview bulk con 1 válido + 1 inválido no rompe el lote", async () => {
    mocks.extractTextFromPdfBuffer
      .mockResolvedValueOnce(SANTANDER_UYU_JULY_AUSZUG_FIXTURE)
      .mockResolvedValueOnce(NON_SANTANDER_BANK_PDF_FIXTURE);

    const data = await previewSantanderBankStatementPdfFiles([
      { fileName: "ok.pdf", buffer: Buffer.from("%PDF-ok") },
      { fileName: "bad.pdf", buffer: Buffer.from("%PDF-bad") },
    ]);

    expect(data.parsed_count).toBe(1);
    expect(data.failed_count).toBe(1);
    expect(data.previews).toHaveLength(1);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]?.file_name).toBe("bad.pdf");
  });
});

describe("addPreviewToCurrencyTotals", () => {
  it("acumula totales por moneda", () => {
    const preview = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const next = addPreviewToCurrencyTotals(emptyCurrencyTotals(), preview);
    expect(next.movements_count).toBe(preview.movements_count);
    expect(next.inflows).toBe(preview.totals.inflows);
  });
});
