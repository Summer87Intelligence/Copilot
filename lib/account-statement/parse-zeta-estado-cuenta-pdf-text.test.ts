import { describe, expect, it } from "vitest";

import {
  parseZetaAmount,
  parseZetaEstadoCuentaPdfText,
} from "@/lib/account-statement/parse-zeta-estado-cuenta-pdf-text";

const FLETCHER_SNIPPET = `
Moneda: Pesos
CIUDAD DE LA COSTA
38 - Estudio Fletcher SAS
., Montevideo, Montevideo, Uruguay / Tel. .
Fecha Comprobante Serie y Nº Moneda Debe Haber Saldo
Saldo anterior... -700,00
05/01/26 Venta Crédito (CFE) A2662 $ 14.640,00 13.940,00
14/01/26 Recibo de Cobro A517 $ 14.640,00 -700,00
04/06/26 Venta Crédito (CFE) A2948 $ 14.640,00 28.580,00
SALDO $ al 31/12/26 ... 28.580,00
`;

describe("parseZetaEstadoCuentaPdfText", () => {
  it("parsea montos es-UY con signo", () => {
    expect(parseZetaAmount("-700,00")).toBe(-700);
    expect(parseZetaAmount("14.640,00")).toBe(14640);
    expect(parseZetaAmount("30,35")).toBe(30.35);
  });

  it("parsea Fletcher UYU con opening negativo y saldo final", () => {
    const rows = parseZetaEstadoCuentaPdfText(FLETCHER_SNIPPET, "UYU");
    expect(rows).toHaveLength(1);
    const f = rows[0]!;
    expect(f.codigo).toBe("38");
    expect(f.openingBalance).toBe(-700);
    expect(f.finalBalance).toBe(28580);
    expect(f.movementCount).toBe(3);
    expect(f.cfeCount).toBe(2);
    expect(f.receiptCount).toBe(1);
    expect(f.totalDebit).toBe(29280);
    expect(f.totalCredit).toBe(14640);
  });

  it("infiere opening 0 cuando falta Saldo anterior", () => {
    const snippet = `
Moneda: Pesos
36 - El Pais S.A.
Fecha Comprobante Serie y Nº Moneda Debe Haber Saldo
13/03/26 Venta Crédito (CFE) A2821 $ 17.080,00 17.080,00
SALDO $ al 31/12/26 ... 17.080,00
`;
    const rows = parseZetaEstadoCuentaPdfText(snippet, "UYU");
    expect(rows[0]!.openingBalance).toBe(0);
    expect(rows[0]!.parseWarnings).toContain("opening_inferred_from_first_movement");
  });
});
