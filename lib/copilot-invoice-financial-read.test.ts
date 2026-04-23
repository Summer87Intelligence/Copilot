import { describe, expect, it } from "vitest";

import { readInvoiceFinancial } from "@/lib/copilot-invoice-financial-read";

function mapFrom(entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

describe("readInvoiceFinancial (PR2: persistido autoritativo)", () => {
  it("usa solo balance persistido como autoritativo", () => {
    const r = readInvoiceFinancial({
      invoiceId: "inv-1",
      totalAmount: 7000,
      balancePersisted: 4000,
    });
    expect(r.balance_authoritative).toBe(4000);
    expect(r.paid_derived).toBe(3000);
    expect(r.confidence).toBe("high");
    expect(r.reasons).toContain("ok");
  });

  it("vista distinta solo agrega control en reasons; no cambia saldo", () => {
    const balMap = mapFrom([["inv-1", 2500]]);
    const r = readInvoiceFinancial({
      invoiceId: "inv-1",
      totalAmount: 7000,
      balancePersisted: 4000,
      balanceFromFinancialsMap: balMap,
    });
    expect(r.balance_authoritative).toBe(4000);
    expect(r.paid_derived).toBe(3000);
    expect(r.reasons).toContain("invoice_financials_diverges_from_persisted");
    expect(r.confidence).toBe("medium");
    expect(r.reasons).toContain("ok");
  });

  it("sin divergencia de vista cuando coincide dentro del epsilon", () => {
    const balMap = mapFrom([["inv-1", 4000.5]]);
    const r = readInvoiceFinancial({
      invoiceId: "inv-1",
      totalAmount: 7000,
      balancePersisted: 4000,
      balanceFromFinancialsMap: balMap,
    });
    expect(r.confidence).toBe("high");
    expect(r.reasons).not.toContain("invoice_financials_diverges_from_persisted");
  });

  it("paid_derived null si saldo > total", () => {
    const r = readInvoiceFinancial({
      invoiceId: "inv-1",
      totalAmount: 7000,
      balancePersisted: 8000,
    });
    expect(r.paid_derived).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.reasons).toContain("balance_above_total");
  });

  it("paid_derived null si total no positivo", () => {
    const r = readInvoiceFinancial({
      invoiceId: "inv-1",
      totalAmount: 0,
      balancePersisted: 0,
    });
    expect(r.paid_derived).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("sin total: paid_derived null; mapa de vista sigue pudiendo marcar divergencia", () => {
    const balMap = mapFrom([["inv-1", 1]]);
    const r = readInvoiceFinancial({
      invoiceId: "inv-1",
      balancePersisted: 4000,
      balanceFromFinancialsMap: balMap,
    });
    expect(r.paid_derived).toBeNull();
    expect(r.reasons).toContain("invoice_financials_diverges_from_persisted");
  });
});
