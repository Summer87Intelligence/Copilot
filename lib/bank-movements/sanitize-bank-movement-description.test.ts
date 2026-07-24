import { describe, expect, it } from "vitest";

import { sanitizeBankMovementDescription } from "@/lib/bank-movements/sanitize-bank-movement-description";

describe("sanitizeBankMovementDescription", () => {
  it("caso real: importe + saldo duplicado + 'Saldo final' con el mismo valor", () => {
    expect(
      sanitizeBankMovementDescription(
        "CREDITO OPERACION EN BANCA DIGITAL ... 122,00 5.969,41 Saldo final 5.969,41"
      )
    ).toBe("CREDITO OPERACION EN BANCA DIGITAL ... 122,00");
  });

  it("caso 2: importe distinto del saldo — el importe real sobrevive", () => {
    expect(sanitizeBankMovementDescription("122,00 Saldo final 5.969,41")).toBe("122,00");
  });

  it("caso 3: saldo inicial + movimiento + saldo final en la misma cadena", () => {
    expect(
      sanitizeBankMovementDescription(
        "Saldo inicial 8.450,00 Movimiento 122,00 Saldo final 8.572,00"
      )
    ).toBe("Movimiento 122,00");
  });

  it("'Saldo final:' con dos puntos", () => {
    expect(sanitizeBankMovementDescription("DEBITO VARIOS 300,00 Saldo final: 1.200,00")).toBe(
      "DEBITO VARIOS 300,00"
    );
  });

  it("'Saldo disponible' sin valor duplicado adyacente", () => {
    expect(sanitizeBankMovementDescription("PAGO TARJETA 450,00 Saldo disponible 9.000,00")).toBe(
      "PAGO TARJETA 450,00"
    );
  });

  it("'Saldo contable'", () => {
    expect(sanitizeBankMovementDescription("DEPOSITO 1.000,00 Saldo contable 15.000,00")).toBe(
      "DEPOSITO 1.000,00"
    );
  });

  it("'Nuevo saldo'", () => {
    expect(sanitizeBankMovementDescription("TRANSFERENCIA 700,00 Nuevo saldo 2.300,00")).toBe(
      "TRANSFERENCIA 700,00"
    );
  });

  it("'Balance' (variante en inglés)", () => {
    expect(sanitizeBankMovementDescription("PAYMENT 500,00 Balance 3.400,00")).toBe("PAYMENT 500,00");
  });

  it("'Closing balance' (regla permanente — variantes internacionales)", () => {
    expect(sanitizeBankMovementDescription("PAYMENT 500,00 Closing balance 3.400,00")).toBe(
      "PAYMENT 500,00"
    );
  });

  it("'Opening balance'", () => {
    expect(sanitizeBankMovementDescription("Opening balance 1.000,00 DEPOSIT 200,00")).toBe(
      "DEPOSIT 200,00"
    );
  });

  it("'Available balance'", () => {
    expect(sanitizeBankMovementDescription("WITHDRAWAL 300,00 Available balance 700,00")).toBe(
      "WITHDRAWAL 300,00"
    );
  });

  it("'Ledger balance'", () => {
    expect(sanitizeBankMovementDescription("TRANSFER 150,00 Ledger balance 9.850,00")).toBe(
      "TRANSFER 150,00"
    );
  });

  it("'Closing balance' con el valor duplicado inmediatamente antes (mismo patrón que 'Saldo final')", () => {
    expect(
      sanitizeBankMovementDescription("PAYMENT 500,00 3.400,00 Closing balance 3.400,00")
    ).toBe("PAYMENT 500,00");
  });

  it("saltos de línea y espacios múltiples entre el importe y la etiqueta", () => {
    const raw =
      "24/07/2026\n7505 DEBITO A\nCONFIRMAR\nBANRED COMPRA\n510325 -\nMONTEVIDEO/DLO\n*ARCOS DORADOS\nUY VIS3 -\n-184,32 709.689,76\nSaldo final 709.689,76";
    expect(sanitizeBankMovementDescription(raw)).toBe(
      "24/07/2026 7505 DEBITO A CONFIRMAR BANRED COMPRA 510325 - MONTEVIDEO/DLO *ARCOS DORADOS UY VIS3 - -184,32"
    );
  });

  it("moneda UYU pegada a la etiqueta", () => {
    expect(sanitizeBankMovementDescription("DEPOSITO 100,00 Saldo final UYU 5.000,00")).toBe(
      "DEPOSITO 100,00"
    );
  });

  it("moneda USD pegada a la etiqueta", () => {
    expect(sanitizeBankMovementDescription("DEPOSITO 100,00 Saldo final USD 5.000,00")).toBe(
      "DEPOSITO 100,00"
    );
  });

  it("OCR con orden alterado: el valor del saldo aparece antes de la etiqueta, sin repetirse después", () => {
    expect(sanitizeBankMovementDescription("PAGO 250,00 5.500,00 Saldo final")).toBe("PAGO 250,00");
  });

  it("descripción sin ninguna referencia a saldo queda intacta", () => {
    expect(sanitizeBankMovementDescription("TRANSFERENCIA RECIBIDA JUAN PEREZ")).toBe(
      "TRANSFERENCIA RECIBIDA JUAN PEREZ"
    );
  });

  it("referencias numéricas legítimas (sin la palabra saldo) nunca se tocan", () => {
    expect(sanitizeBankMovementDescription("TRANSFERENCIA REF 123456 A JUAN PEREZ 500,00")).toBe(
      "TRANSFERENCIA REF 123456 A JUAN PEREZ 500,00"
    );
  });

  it("frase fija de pie de extracto real ('El saldo informado no incluye movimientos en tránsito.'), junto con 'Saldo final' duplicado", () => {
    expect(
      sanitizeBankMovementDescription(
        "24/07/2026 362629 DEBITO OPERACION EN BANCA DIGITAL TFCG DEMOCORP -113,00 96.000,00 Saldo final 96.000,00 El saldo informado no incluye movimientos en tránsito."
      )
    ).toBe("24/07/2026 362629 DEBITO OPERACION EN BANCA DIGITAL TFCG DEMOCORP -113,00");
  });

  it("null / undefined / vacío devuelven cadena vacía", () => {
    expect(sanitizeBankMovementDescription(null)).toBe("");
    expect(sanitizeBankMovementDescription(undefined)).toBe("");
    expect(sanitizeBankMovementDescription("")).toBe("");
    expect(sanitizeBankMovementDescription("   ")).toBe("");
  });

  it("no altera el importe real cuando coincide por casualidad con un token cercano no adyacente a la etiqueta", () => {
    // "500,00" (importe real) no es adyacente a "Saldo final" (hay otro token en medio) — debe sobrevivir intacto.
    expect(sanitizeBankMovementDescription("PAGO 500,00 REF 8 Saldo final 500,00")).toBe(
      "PAGO 500,00 REF 8"
    );
  });

  it("dos etiquetas de saldo no adyacentes entre sí no interfieren una con la otra", () => {
    expect(
      sanitizeBankMovementDescription(
        "Saldo inicial 1.000,00 COMPRA VARIOS 50,00 Saldo disponible 950,00"
      )
    ).toBe("COMPRA VARIOS 50,00");
  });
});
