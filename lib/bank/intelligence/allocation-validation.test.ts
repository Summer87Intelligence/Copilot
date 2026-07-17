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
  it("aplicación exacta; sin saldo sin aplicar", () => {
    const r = validateConfirmation(base());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.linkAmountMinor).toBe(100000); expect(r.unappliedMinor).toBe(0); }
  });

  it("SALDO SIN APLICAR: link ≥ Σ allocations (pago adelantado / parcial)", () => {
    const r = validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 60000, invoiceBalanceMinor: 100000, currency: "UYU" }] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.allocatedMinor).toBe(60000); expect(r.unappliedMinor).toBe(40000); }
  });

  it("recibo sin facturas → link = importe recibo, todo sin aplicar", () => {
    const r = validateConfirmation(base({ allocations: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.unappliedMinor).toBe(100000); }
  });

  it("Σ allocations > link → ALLOCATIONS_EXCEED_LINK", () => {
    expect(validateConfirmation(base({ linkAmountMinor: 50000, allocations: [{ invoiceId: "f1", amountMinor: 60000, invoiceBalanceMinor: 100000, currency: "UYU" }] }))).toMatchObject({ ok: false, code: "ALLOCATIONS_EXCEED_LINK" });
  });

  it("sobre-aplicación de MOVIMIENTO / RECIBO", () => {
    expect(validateConfirmation(base({ movementUsedMinor: 60000 }))).toMatchObject({ ok: false, code: "OVER_APPLIED_MOVEMENT" });
    expect(validateConfirmation(base({ receipt: { amountMinor: 100000, usedMinor: 60000, currency: "UYU" } }))).toMatchObject({ ok: false, code: "OVER_APPLIED_RECEIPT" });
  });

  it("sobre-aplicación de FACTURA agregada (existentes + nuevas > saldo)", () => {
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 40000, invoiceBalanceMinor: 100000, invoiceExistingAllocatedMinor: 70000, currency: "UYU" }] }))).toMatchObject({ ok: false, code: "OVER_APPLIED_INVOICE" });
  });

  it("factura totalmente pagada (saldo 0) → INVOICE_FULLY_PAID", () => {
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 10000, invoiceBalanceMinor: 0, currency: "UYU" }] }))).toMatchObject({ ok: false, code: "INVOICE_FULLY_PAID" });
  });

  it("cruce de moneda (recibo o factura)", () => {
    expect(validateConfirmation(base({ receipt: { amountMinor: 100000, usedMinor: 0, currency: "USD" } }))).toMatchObject({ ok: false, code: "CURRENCY_MISMATCH" });
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 100000, invoiceBalanceMinor: 100000, currency: "USD" }] }))).toMatchObject({ ok: false, code: "CURRENCY_MISMATCH" });
  });

  it("importe cero → INVALID_AMOUNT; allocation no positiva → INVALID_ALLOCATION", () => {
    expect(validateConfirmation(base({ allocations: [], receipt: undefined }))).toMatchObject({ ok: false, code: "INVALID_AMOUNT" });
    expect(validateConfirmation(base({ allocations: [{ invoiceId: "f1", amountMinor: 0, invoiceBalanceMinor: 100000, currency: "UYU" }] }))).toMatchObject({ ok: false, code: "INVALID_ALLOCATION" });
  });
});
