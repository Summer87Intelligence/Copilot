import { describe, it, expect } from "vitest";

import { validateConfirmation, type ConfirmationValidationInput } from "@/lib/bank/intelligence/allocation-validation";

function base(o: Partial<ConfirmationValidationInput> = {}): ConfirmationValidationInput {
  return {
    movementCurrency: "UYU",
    movementAmountMinor: 100000,
    movementUsedMinor: 0,
    receipt: { amountMinor: 100000, usedMinor: 0, currency: "UYU" },
    allocations: [{ invoiceId: "f1", amountMinor: 100000, invoiceBalanceMinor: 100000, currency: "UYU" }],
    ...o,
  };
}

describe("validateConfirmation — contrato de sumas transaccionales", () => {
  it("acepta una aplicación exacta; sin saldo sin aplicar", () => {
    const r = validateConfirmation(base());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.linkAmountMinor).toBe(100000); expect(r.unappliedMinor).toBe(0); }
  });

  it("saldo sin aplicar: recibo sin facturas → link = importe recibo, unapplied = link", () => {
    const r = validateConfirmation(base({ allocations: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.linkAmountMinor).toBe(100000); expect(r.unappliedMinor).toBe(100000); }
  });

  it("bloquea sobre-aplicación del MOVIMIENTO (Σ links + nuevo > importe)", () => {
    expect(validateConfirmation(base({ movementUsedMinor: 60000 }))).toMatchObject({ ok: false, code: "OVER_APPLIED_MOVEMENT" });
  });

  it("bloquea sobre-aplicación del RECIBO", () => {
    expect(validateConfirmation(base({ receipt: { amountMinor: 100000, usedMinor: 60000, currency: "UYU" } }))).toMatchObject({ ok: false, code: "OVER_APPLIED_RECEIPT" });
  });

  it("bloquea sobre-aplicación de FACTURA (allocation > saldo)", () => {
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 100000, invoiceBalanceMinor: 40000, currency: "UYU" }] }))).toMatchObject({ ok: false, code: "OVER_APPLIED_INVOICE" });
  });

  it("bloquea cruce de moneda (recibo o factura)", () => {
    expect(validateConfirmation(base({ receipt: { amountMinor: 100000, usedMinor: 0, currency: "USD" } }))).toMatchObject({ ok: false, code: "CURRENCY_MISMATCH" });
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 100000, invoiceBalanceMinor: 100000, currency: "USD" }] }))).toMatchObject({ ok: false, code: "CURRENCY_MISMATCH" });
  });

  it("importe cero → INVALID_AMOUNT; allocation no positiva → INVALID_ALLOCATION", () => {
    expect(validateConfirmation(base({ allocations: [], receipt: undefined }))).toMatchObject({ ok: false, code: "INVALID_AMOUNT" });
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 0, invoiceBalanceMinor: 100000, currency: "UYU" }] }))).toMatchObject({ ok: false, code: "INVALID_ALLOCATION" });
  });

  it("pago parcial válido: allocation < saldo factura, dentro del movimiento", () => {
    const r = validateConfirmation(base({ movementAmountMinor: 40000, allocations: [{ invoiceId: "f1", amountMinor: 40000, invoiceBalanceMinor: 100000, currency: "UYU" }], receipt: { amountMinor: 40000, usedMinor: 0, currency: "UYU" } }));
    expect(r.ok).toBe(true);
  });
});
