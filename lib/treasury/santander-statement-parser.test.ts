import { describe, expect, it } from "vitest";

import {
  parseSantanderCsvText,
  parseSantanderStatementFile,
  SantanderStatementParseError,
} from "@/lib/treasury/santander-statement-parser";

function mockFile(name: string, content: string | ArrayBuffer, type = ""): File {
  return new File([content], name, { type });
}

describe("parseSantanderCsvText", () => {
  it("parsea extracto CSV con débito y crédito", () => {
    const csv = [
      "Fecha;Concepto;Débito;Crédito;Saldo",
      "13/05/2026;Pago proveedor;1.500,00;;25.000,00",
      "12/05/2026;Recibo cobro;;2.300,50;26.500,00",
    ].join("\n");

    const rows = parseSantanderCsvText(csv, "UYU");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      movementDate: "2026-05-13",
      description: "Pago proveedor",
      amount: 1500,
      movementType: "debit",
      currencyCode: "UYU",
    });
    expect(rows[1]).toMatchObject({
      movementDate: "2026-05-12",
      movementType: "credit",
      amount: 2300.5,
    });
    expect(rows[0]?.externalId).toMatch(/^santander:/);
  });

  it("deduplica external_id estable para la misma fila", () => {
    const csv = "Fecha;Concepto;Importe\n2026-05-13;Comisión;120,00\n";
    const first = parseSantanderCsvText(csv, "UYU");
    const second = parseSantanderCsvText(csv, "UYU");
    expect(first[0]?.externalId).toBe(second[0]?.externalId);
  });
});

describe("parseSantanderStatementFile", () => {
  it("parsea CSV por detección automática", async () => {
    const csv = [
      "Fecha;Concepto;Importe",
      "2026-05-12;Cobro Dolby;366,00",
    ].join("\n");
    const rows = await parseSantanderStatementFile(mockFile("santander.csv", csv, "text/csv"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      movementDate: "2026-05-12",
      description: "Cobro Dolby",
      amount: 366,
    });
  });

  it("devuelve error controlado para PDF", async () => {
    await expect(
      parseSantanderStatementFile(mockFile("extracto.pdf", "%PDF-1.4", "application/pdf"))
    ).rejects.toMatchObject({
      code: "PDF_NOT_SUPPORTED",
    } satisfies Partial<SantanderStatementParseError>);
  });

  it("rechaza formato no soportado", async () => {
    await expect(
      parseSantanderStatementFile(mockFile("extracto.zip", "zip", "application/zip"))
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("reporta columnas no detectadas en CSV", async () => {
    const csv = "Columna1;Columna2\na;b\n";
    await expect(parseSantanderStatementFile(mockFile("bad.csv", csv))).rejects.toMatchObject({
      code: "COLUMNS_NOT_DETECTED",
    });
  });

  it("reporta archivo vacío en CSV", async () => {
    await expect(parseSantanderStatementFile(mockFile("empty.csv", "Fecha;Concepto;Importe\n"))).rejects.toMatchObject({
      code: "EMPTY_FILE",
    });
  });
});
