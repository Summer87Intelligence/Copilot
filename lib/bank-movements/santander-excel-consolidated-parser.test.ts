import { describe, expect, it } from "vitest";

import {
  buildSantanderConsolidatedUyuFixtureBuffer,
  buildSantanderConsolidatedUsdFixtureBuffer,
  buildSantanderConsolidatedExcelBuffer,
  SANTANDER_CONSOLIDATED_UYU_ROWS,
} from "@/lib/bank-movements/fixtures/santander-excel-consolidated.fixture";
import {
  buildSantanderConsolidatedExcelPreview,
  isSantanderConsolidatedExcelBuffer,
  isSantanderConsolidatedRows,
  parseSantanderConsolidatedExcelBuffer,
  SANTANDER_CONSOLIDATED_SHEET_NAME,
} from "@/lib/bank-movements/santander-excel-consolidated-parser";

describe("santander-excel-consolidated-parser", () => {
  it("detecta hoja Movimientos consolidados con columnas UYU", async () => {
    const buffer = buildSantanderConsolidatedUyuFixtureBuffer();
    expect(await isSantanderConsolidatedExcelBuffer(buffer)).toBe(true);
  });

  it("detecta hoja Movimientos consolidados con columnas USD", async () => {
    const buffer = buildSantanderConsolidatedUsdFixtureBuffer();
    expect(await isSantanderConsolidatedExcelBuffer(buffer)).toBe(true);
  });

  it("rechaza Excel sin hoja consolidada", async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Fecha", "Monto"],
      ["01/07/2026", "100"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Otra hoja");
    const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    expect(await isSantanderConsolidatedExcelBuffer(buffer)).toBe(false);
    await expect(parseSantanderConsolidatedExcelBuffer(buffer)).rejects.toThrow("NOT_CONSOLIDATED");
  });

  it("parsea movimientos UYU con cuenta, moneda y metadata source_file", async () => {
    const preview = await buildSantanderConsolidatedExcelPreview(buildSantanderConsolidatedUyuFixtureBuffer());
    expect(preview.bank_name).toBe("Santander");
    expect(preview.account_number).toBe("000001211749");
    expect(preview.currency_code).toBe("UYU");
    expect(preview.movements_count).toBe(3);
    expect(preview.period_start).toBe("2026-07-01");
    expect(preview.period_end).toBe("2026-07-03");

    const zeta = preview.movements.find((m) => m.description.includes("ZETA"));
    expect(zeta).toMatchObject({
      date: "2026-07-02",
      reference: "ZETA001",
      direction: "outflow",
      debit: 3721,
      amount: -3721,
      source_file: "julio-uyu-2.pdf",
    });
    expect(preview.totals.inflows).toBe(1500);
    expect(preview.totals.outflows).toBe(3971);
    expect(preview.totals.net).toBe(-2471);
  });

  it("parsea movimientos USD con columnas Débito USD / Crédito USD", async () => {
    const preview = await buildSantanderConsolidatedExcelPreview(buildSantanderConsolidatedUsdFixtureBuffer());
    expect(preview.account_number).toBe("005205831977");
    expect(preview.currency_code).toBe("USD");
    expect(preview.movements_count).toBe(2);
    expect(preview.movements[0]?.direction).toBe("inflow");
    expect(preview.movements[1]?.direction).toBe("outflow");
  });

  it("isSantanderConsolidatedRows valida encabezados mínimos", () => {
    const rows = [
      [
        "Fecha",
        "Referencia",
        "Tipo Movimiento / Concepto",
        "Descripción",
        "Débito",
        "Crédito",
        "Importe neto",
        "Saldo",
        "Moneda",
        "Cuenta",
        "Archivos origen",
      ],
      ...SANTANDER_CONSOLIDATED_UYU_ROWS.map((row) => [
        row.fecha,
        row.referencia ?? "",
        row.tipoConcepto,
        row.descripcion ?? "",
        row.debito ?? "",
        row.credito ?? "",
        row.importeNeto ?? "",
        row.saldo ?? "",
        row.moneda,
        row.cuenta,
        row.archivosOrigen ?? "",
      ]),
    ];
    expect(isSantanderConsolidatedRows(rows)).toBe(true);
    expect(rows[0]?.[0]).toBe("Fecha");
    expect(SANTANDER_CONSOLIDATED_SHEET_NAME).toBe("Movimientos consolidados");
  });

  it("omite filas vacías sin romper el conteo", async () => {
    const buffer = buildSantanderConsolidatedExcelBuffer({
      currency: "UYU",
      accountNumber: "000001211749",
      rows: [
        ...SANTANDER_CONSOLIDATED_UYU_ROWS,
        {
          fecha: "",
          tipoConcepto: "",
          moneda: "UYU",
          cuenta: "000001211749",
        },
      ],
    });
    const preview = await buildSantanderConsolidatedExcelPreview(buffer);
    expect(preview.movements_count).toBe(3);
  });
});
