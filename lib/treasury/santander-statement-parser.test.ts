import { describe, expect, it } from "vitest";

import { parseSantanderCsvText } from "@/lib/treasury/santander-statement-parser";

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
