import { describe, expect, it } from "vitest";

import {
  BANK_IMPORT_ERROR_MESSAGES,
  getBankImportFileType,
  SantanderStatementParseError,
} from "@/lib/treasury/santander-bank-import-file-type";

function mockFile(name: string, type = ""): File {
  return new File(["content"], name, { type });
}

describe("getBankImportFileType", () => {
  it("detecta CSV por extensión", () => {
    expect(getBankImportFileType(mockFile("extracto.csv"))).toBe("csv");
  });

  it("detecta CSV por mime", () => {
    expect(getBankImportFileType(mockFile("movimientos.dat", "text/csv"))).toBe("csv");
  });

  it("detecta XLSX por extensión", () => {
    expect(getBankImportFileType(mockFile("extracto.xlsx"))).toBe("xlsx");
  });

  it("detecta XLS por extensión", () => {
    expect(getBankImportFileType(mockFile("extracto.xls"))).toBe("xlsx");
  });

  it("detecta Excel por mime", () => {
    expect(
      getBankImportFileType(
        mockFile(
          "movimientos.bin",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      )
    ).toBe("xlsx");
  });

  it("detecta PDF por extensión", () => {
    expect(getBankImportFileType(mockFile("extracto.pdf"))).toBe("pdf");
  });

  it("detecta PDF por mime", () => {
    expect(getBankImportFileType(mockFile("extracto.bin", "application/pdf"))).toBe("pdf");
  });

  it("rechaza formato no soportado", () => {
    expect(getBankImportFileType(mockFile("extracto.zip", "application/zip"))).toBe("unsupported");
  });
});

describe("SantanderStatementParseError", () => {
  it("expone mensaje amigable para PDF", () => {
    const err = new SantanderStatementParseError("PDF_NOT_SUPPORTED");
    expect(err.code).toBe("PDF_NOT_SUPPORTED");
    expect(err.message).toBe(BANK_IMPORT_ERROR_MESSAGES.PDF_NOT_SUPPORTED);
  });
});
