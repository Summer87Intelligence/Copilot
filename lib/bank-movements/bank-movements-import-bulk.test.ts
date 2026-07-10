import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  extractTextFromPdfBuffer: vi.fn(),
}));

vi.mock("@/lib/treasury/santander-pdf-text-extract.server", () => ({
  extractTextFromPdfBuffer: mocks.extractTextFromPdfBuffer,
}));

import {
  buildSantanderConsolidatedUyuFixtureBuffer,
  buildSantanderConsolidatedUsdFixtureBuffer,
} from "@/lib/bank-movements/fixtures/santander-excel-consolidated.fixture";
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
import {
  mapBankStatementPreviewError,
} from "@/lib/bank-movements/bank-movements-import-preview-errors";
import { previewSantanderBankStatementFiles } from "@/lib/bank-movements/santander-pdf-preview-service.server";

describe("previewSantanderBankStatementFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preview bulk con 2 PDFs válidos suma movimientos y totales por moneda", async () => {
    mocks.extractTextFromPdfBuffer
      .mockResolvedValueOnce(SANTANDER_UYU_JULY_AUSZUG_FIXTURE)
      .mockResolvedValueOnce(SANTANDER_USD_JULY_AUSZUG_FIXTURE);

    const uyu = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const usd = buildSantanderBankStatementPreview(SANTANDER_USD_JULY_AUSZUG_FIXTURE);

    const data = await previewSantanderBankStatementFiles([
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

    const data = await previewSantanderBankStatementFiles([
      { fileName: "ok.pdf", buffer: Buffer.from("%PDF-ok") },
      { fileName: "bad.pdf", buffer: Buffer.from("%PDF-bad") },
    ]);

    expect(data.parsed_count).toBe(1);
    expect(data.failed_count).toBe(1);
    expect(data.previews).toHaveLength(1);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]?.file_name).toBe("bad.pdf");
    expect(data.errors[0]?.error).toContain("No pudimos leer este archivo");
  });

  it("reporta error claro cuando falta hoja consolidada en xlsx", async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Fecha", "Monto"],
      ["01/07/2026", "100"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Otra hoja");
    const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const data = await previewSantanderBankStatementFiles([
      { fileName: "sin-hoja.xlsx", buffer },
    ]);

    expect(data.parsed_count).toBe(0);
    expect(data.failed_count).toBe(1);
    expect(data.errors[0]?.error).toBe(
      mapBankStatementPreviewError(new Error("NOT_CONSOLIDATED"))
    );
    expect(data.errors[0]?.error).toContain("Movimientos consolidados");
  });

  it("reporta error claro para xlsx ilegible o sin hoja consolidada", async () => {
    const data = await previewSantanderBankStatementFiles([
      { fileName: "roto.xlsx", buffer: Buffer.from("not-an-xlsx") },
    ]);

    expect(data.parsed_count).toBe(0);
    expect(data.errors[0]?.error).toContain("No pudimos leer este archivo:");
  });

  it("preview bulk mixto: importa UYU empresa y omite USD cuenta personal", async () => {
    mocks.extractTextFromPdfBuffer.mockResolvedValueOnce(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);

    const pdfPreview = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const data = await previewSantanderBankStatementFiles([
      { fileName: "uyu.pdf", buffer: Buffer.from("%PDF-uyu") },
      {
        fileName: "consolidado-usd.xlsx",
        buffer: buildSantanderConsolidatedUsdFixtureBuffer(),
      },
    ]);

    // El USD consolidado es cuenta personal 005205831977 → se omite (no importable).
    expect(data.parsed_count).toBe(1);
    expect(data.failed_count).toBe(0);
    expect(data.skipped_count).toBe(1);
    expect(data.total_movements_count).toBe(pdfPreview.movements_count);
    expect(data.totals_by_currency.UYU.movements_count).toBe(pdfPreview.movements_count);
    expect(data.totals_by_currency.USD.movements_count).toBe(0);
    expect(data.skipped[0]?.account_scope).toBe("blocked_personal");
    expect(data.skipped[0]?.file_name).toBe("consolidado-usd.xlsx");
  });

  it("preview bulk Excel UYU consolidado", async () => {
    const data = await previewSantanderBankStatementFiles([
      {
        fileName: "consolidado-uyu.xlsx",
        buffer: buildSantanderConsolidatedUyuFixtureBuffer(),
      },
    ]);

    expect(data.parsed_count).toBe(1);
    expect(data.previews[0]?.account_number).toBe("000001211749");
    expect(data.previews[0]?.movements_count).toBe(3);
  });

  it("preview bulk real: importa 441 UYU empresa y omite 471 USD personal", async () => {
    const { existsSync, readFileSync } = await import("fs");
    const uyuPath = "C:/Users/Andres/Downloads/santander_movimientos_consolidado.xlsx";
    const usdPath = "C:/Users/Andres/Downloads/santander_movimientos_dolares_consolidado.xlsx";
    if (!existsSync(uyuPath) || !existsSync(usdPath)) return;

    const data = await previewSantanderBankStatementFiles([
      { fileName: "santander_movimientos_consolidado.xlsx", buffer: readFileSync(uyuPath) },
      { fileName: "santander_movimientos_dolares_consolidado.xlsx", buffer: readFileSync(usdPath) },
    ]);

    // Solo EASY (1211749 UYU) es importable; la cuenta personal 005205831977 USD se omite.
    expect(data.parsed_count).toBe(1);
    expect(data.failed_count).toBe(0);
    expect(data.skipped_count).toBe(1);
    expect(data.total_movements_count).toBe(441);
    expect(data.totals_by_currency.UYU.movements_count).toBe(441);
    expect(data.totals_by_currency.USD.movements_count).toBe(0);
    expect(data.skipped[0]?.movements_count).toBe(471);
    expect(data.skipped[0]?.account_scope).toBe("blocked_personal");
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
