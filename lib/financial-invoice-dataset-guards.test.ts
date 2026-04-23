import { describe, expect, it } from "vitest";

import {
  countInvoiceBalanceOutOfRange,
  countReceiptsBalanceIncompatible,
  sumReceiptAmountsByInvoiceId,
} from "@/lib/financial-invoice-dataset-guards";

const EPS = 1.0;

describe("financial-invoice-dataset-guards", () => {
  it("sumReceiptAmountsByInvoiceId agrupa por factura", () => {
    const m = sumReceiptAmountsByInvoiceId([
      { invoice_id: "a", amount: 100 },
      { invoice_id: "a", amount: 50 },
      { invoice_id: "b", amount: 20 },
    ]);
    expect(m.get("a")).toBe(150);
    expect(m.get("b")).toBe(20);
  });

  it("countInvoiceBalanceOutOfRange detecta saldo > total", () => {
    const n = countInvoiceBalanceOutOfRange(
      [{ total_amount: 7000, balance_amount: 8000 }],
      EPS
    );
    expect(n).toBe(1);
  });

  it("countInvoiceBalanceOutOfRange ignora total inválido", () => {
    const n = countInvoiceBalanceOutOfRange(
      [{ total_amount: 0, balance_amount: 5000 }],
      EPS
    );
    expect(n).toBe(0);
  });

  it("countReceiptsBalanceIncompatible cuando Σ recibos excede total", () => {
    const n = countReceiptsBalanceIncompatible(
      [{ id: "inv-1", total_amount: 1000, balance_amount: 0 }],
      [{ invoice_id: "inv-1", amount: 2000 }],
      EPS
    );
    expect(n).toBe(1);
  });

  it("countReceiptsBalanceIncompatible cuando saldo no cuadra con total − Σ", () => {
    const n = countReceiptsBalanceIncompatible(
      [{ id: "inv-1", total_amount: 1000, balance_amount: 500 }],
      [{ invoice_id: "inv-1", amount: 300 }],
      EPS
    );
    expect(n).toBe(1);
  });

  it("countReceiptsBalanceIncompatible ok cuando cuadra dentro del epsilon", () => {
    const n = countReceiptsBalanceIncompatible(
      [{ id: "inv-1", total_amount: 1000, balance_amount: 700 }],
      [{ invoice_id: "inv-1", amount: 300 }],
      EPS
    );
    expect(n).toBe(0);
  });
});
