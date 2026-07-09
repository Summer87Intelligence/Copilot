import { describe, expect, it } from "vitest";

import {
  buildBulkPreviewFailureSummary,
  formatBankStatementPreviewFileError,
  mapBankStatementPreviewError,
  resolveBankImportPreviewHttpError,
} from "@/lib/bank-movements/bank-movements-import-preview-errors";

describe("mapBankStatementPreviewError", () => {
  it("mapea hoja consolidada faltante", () => {
    expect(mapBankStatementPreviewError(new Error("NOT_CONSOLIDATED"))).toBe(
      formatBankStatementPreviewFileError(
        'no encontramos la hoja "Movimientos consolidados" ni columnas requeridas.'
      )
    );
  });

  it("mapea archivo sin movimientos", () => {
    expect(mapBankStatementPreviewError(new Error("NO_MOVEMENTS"))).toContain(
      "no encontramos movimientos"
    );
  });

  it("mapea PDF no legible", () => {
    expect(mapBankStatementPreviewError(new Error("PDF_READ_FAILED"))).toContain(
      "no pudimos leer el PDF"
    );
  });

  it("mapea tipo no soportado", () => {
    expect(mapBankStatementPreviewError(new Error("UNSUPPORTED"))).toContain(
      "no es compatible"
    );
  });
});

describe("buildBulkPreviewFailureSummary", () => {
  it("resume cuando todos los archivos fallan", () => {
    expect(buildBulkPreviewFailureSummary(0, 2)).toBe(
      "No pudimos leer ninguno de los archivos seleccionados."
    );
  });

  it("no resume si hubo al menos un archivo válido", () => {
    expect(buildBulkPreviewFailureSummary(1, 1)).toBeNull();
  });
});

describe("resolveBankImportPreviewHttpError", () => {
  it("mensaje útil para 500 con body no JSON", () => {
    expect(
      resolveBankImportPreviewHttpError({
        status: 500,
        jsonOk: false,
        bodyParseFailed: true,
      })
    ).toContain("servidor no pudo procesar");
  });

  it("usa error del API cuando viene en JSON", () => {
    expect(
      resolveBankImportPreviewHttpError({
        status: 400,
        jsonOk: false,
        jsonError: "El lote supera el tamaño máximo permitido.",
        bodyParseFailed: false,
      })
    ).toBe("El lote supera el tamaño máximo permitido.");
  });
});
