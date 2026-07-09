import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const pdfDeps = vi.hoisted(() => ({
  pdfTextExtractLoaded: false,
  pdfParseLoaded: false,
  extractTextFromPdfBuffer: vi.fn(),
}));

vi.mock("pdf-parse", () => {
  pdfDeps.pdfParseLoaded = true;
  return {
    PDFParse: vi.fn().mockImplementation(() => ({
      getText: vi.fn().mockResolvedValue({ text: "" }),
      destroy: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock("@/lib/treasury/santander-pdf-text-extract.server", () => {
  pdfDeps.pdfTextExtractLoaded = true;
  return {
    extractTextFromPdfBuffer: pdfDeps.extractTextFromPdfBuffer,
  };
});

import { buildSantanderConsolidatedUyuFixtureBuffer } from "@/lib/bank-movements/fixtures/santander-excel-consolidated.fixture";
import { SANTANDER_UYU_JULY_AUSZUG_FIXTURE } from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";
import { previewSantanderBankStatementFiles } from "@/lib/bank-movements/bank-movements-preview-dispatcher.server";

describe("bank-movements-preview-dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfDeps.extractTextFromPdfBuffer.mockReset();
    pdfDeps.extractTextFromPdfBuffer.mockResolvedValue(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
  });

  it("xlsx preview does not load pdf parser", async () => {
    const data = await previewSantanderBankStatementFiles([
      {
        fileName: "consolidado-uyu.xlsx",
        buffer: buildSantanderConsolidatedUyuFixtureBuffer(),
      },
    ]);

    expect(data.parsed_count).toBe(1);
    expect(data.failed_count).toBe(0);
    expect(pdfDeps.pdfTextExtractLoaded).toBe(false);
    expect(pdfDeps.pdfParseLoaded).toBe(false);
    expect(pdfDeps.extractTextFromPdfBuffer).not.toHaveBeenCalled();
  });

  it("pdf preview loads pdf parser only for pdf files", async () => {
    const data = await previewSantanderBankStatementFiles([
      { fileName: "extracto.pdf", buffer: Buffer.from("%PDF") },
    ]);

    expect(data.parsed_count).toBe(1);
    expect(pdfDeps.pdfTextExtractLoaded).toBe(true);
    expect(pdfDeps.extractTextFromPdfBuffer).toHaveBeenCalledOnce();
  });

  it("bulk mixto carga pdf parser solo para el archivo pdf", async () => {
    const data = await previewSantanderBankStatementFiles([
      {
        fileName: "consolidado-uyu.xlsx",
        buffer: buildSantanderConsolidatedUyuFixtureBuffer(),
      },
      { fileName: "extracto.pdf", buffer: Buffer.from("%PDF") },
    ]);

    expect(data.parsed_count).toBe(2);
    expect(pdfDeps.extractTextFromPdfBuffer).toHaveBeenCalledOnce();
  });
});
