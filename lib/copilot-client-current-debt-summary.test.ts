import { describe, expect, it } from "vitest";

import { buildClientCurrentDebtSummary } from "./copilot-client-current-debt-summary";
import type { DataRow } from "./copilot-data";

function invoice(opts: {
  id: string;
  total: number;
  balance?: number | null | undefined;
  currency?: "USD" | "UYU" | null;
  status?: string;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    invoice_number: `INV-${opts.id}`,
    issue_date: "2026-01-01",
    total_amount: opts.total,
    balance_amount: opts.balance === undefined ? 0 : opts.balance,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    status: opts.status ?? "issued",
    is_active: opts.active ?? true,
  };
}

describe("buildClientCurrentDebtSummary", () => {
  it("dataset vacío → estructura vacía y sin deuda", () => {
    const out = buildClientCurrentDebtSummary({ invoices: [] });
    expect(out.currencies).toEqual([]);
    expect(out.hasPendingDebt).toBe(false);
    expect(out.totalInvoiceCount).toBe(0);
    expect(out.voidedCount).toBe(0);
    expect(out.unknownCurrencyCount).toBe(0);
  });

  it("caso Álvarez: 4 facturas USD, todas balance=0 → pendiente=0, 4 cobradas", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 1037, balance: 0, currency: "USD" }),
        invoice({ id: "i2", total: 366, balance: 0, currency: "USD" }),
        invoice({ id: "i3", total: 366, balance: 0, currency: "USD", active: false }), // archivada
        invoice({ id: "i4", total: 366, balance: 0, currency: "USD" }),
      ],
    });
    expect(out.currencies).toHaveLength(1);
    const usd = out.currencies[0];
    expect(usd.currencyCode).toBe("USD");
    expect(usd.totalInvoiced).toBe(2135);
    expect(usd.totalPending).toBe(0);
    expect(usd.totalPaidByZeta).toBe(2135);
    expect(usd.invoiceCount).toBe(4);
    expect(usd.paidCount).toBe(4);
    expect(usd.partialCount).toBe(0);
    expect(usd.pendingCount).toBe(0);
    expect(out.hasPendingDebt).toBe(false);
  });

  it("mezcla pendiente/parcial/cobrada en USD", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 1000, balance: 0, currency: "USD" }), // paid
        invoice({ id: "i2", total: 1000, balance: 1000, currency: "USD" }), // pending
        invoice({ id: "i3", total: 1000, balance: 400, currency: "USD" }), // partial
      ],
    });
    const usd = out.currencies[0];
    expect(usd.totalInvoiced).toBe(3000);
    expect(usd.totalPending).toBe(1400);
    expect(usd.totalPaidByZeta).toBe(1600);
    expect(usd.paidCount).toBe(1);
    expect(usd.partialCount).toBe(1);
    expect(usd.pendingCount).toBe(1);
    expect(out.hasPendingDebt).toBe(true);
  });

  it("multi-moneda: USD pendiente y UYU cobrado coexisten", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 500, balance: 500, currency: "USD" }),
        invoice({ id: "i2", total: 12300, balance: 0, currency: "UYU" }),
      ],
    });
    expect(out.currencies.map((c) => c.currencyCode)).toEqual(["USD", "UYU"]);
    expect(out.currencies[0].totalPending).toBe(500);
    expect(out.currencies[1].totalPending).toBe(0);
    expect(out.hasPendingDebt).toBe(true);
  });

  it("balance_amount=null → asume total como pendiente (status=pending)", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 200, balance: null, currency: "UYU" }),
      ],
    });
    const uyu = out.currencies[0];
    expect(uyu.totalPending).toBe(200);
    expect(uyu.pendingCount).toBe(1);
  });

  it("balance_amount > total (defensivo): pending no excede total, paid no negativo", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 100, balance: 100.005, currency: "UYU" }),
      ],
    });
    const uyu = out.currencies[0];
    expect(uyu.pendingCount).toBe(1);
    expect(uyu.totalPaidByZeta).toBe(0);
  });

  it("ignora facturas con total_amount <= 0", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 0, balance: 0, currency: "USD" }),
        invoice({ id: "i2", total: -50, balance: 0, currency: "USD" }),
        invoice({ id: "i3", total: 100, balance: 100, currency: "USD" }),
      ],
    });
    const usd = out.currencies[0];
    expect(usd.invoiceCount).toBe(1);
    expect(usd.totalInvoiced).toBe(100);
    expect(usd.totalPending).toBe(100);
  });

  it("descarta filas con status anulado/cancelado y las cuenta en voidedCount", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 500, balance: 500, currency: "USD", status: "voided" }),
        invoice({ id: "i2", total: 200, balance: 0, currency: "USD", status: "Cancelled" }),
        invoice({ id: "i3", total: 100, balance: 0, currency: "USD", status: "anulado" }),
        invoice({ id: "i4", total: 1000, balance: 0, currency: "USD" }),
      ],
    });
    expect(out.voidedCount).toBe(3);
    const usd = out.currencies[0];
    expect(usd.invoiceCount).toBe(1);
    expect(usd.totalInvoiced).toBe(1000);
    expect(out.hasPendingDebt).toBe(false);
  });

  it("incluye facturas con is_active=false (las archivadas siguen siendo financieras)", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 366, balance: 0, currency: "USD", active: false }),
        invoice({ id: "i2", total: 1000, balance: 1000, currency: "USD", active: false }),
      ],
    });
    const usd = out.currencies[0];
    expect(usd.invoiceCount).toBe(2);
    expect(usd.totalInvoiced).toBe(1366);
    expect(usd.totalPending).toBe(1000);
    expect(usd.paidCount).toBe(1);
    expect(usd.pendingCount).toBe(1);
    expect(out.hasPendingDebt).toBe(true);
  });

  it("descarta filas con moneda indeterminable y las cuenta en unknownCurrencyCount", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 100, balance: 100, currency: null }),
        invoice({ id: "i2", total: 200, balance: 0, currency: "UYU" }),
      ],
    });
    expect(out.unknownCurrencyCount).toBe(1);
    expect(out.currencies).toHaveLength(1);
    expect(out.currencies[0].currencyCode).toBe("UYU");
    expect(out.currencies[0].invoiceCount).toBe(1);
  });

  it("solo expone monedas con al menos 1 factura procesada", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 100, balance: 0, currency: "UYU" }),
      ],
    });
    expect(out.currencies.map((c) => c.currencyCode)).toEqual(["UYU"]);
  });

  it("orden estable USD → UYU cuando ambas existen", () => {
    const out = buildClientCurrentDebtSummary({
      invoices: [
        invoice({ id: "i1", total: 100, balance: 0, currency: "UYU" }),
        invoice({ id: "i2", total: 100, balance: 0, currency: "USD" }),
      ],
    });
    expect(out.currencies.map((c) => c.currencyCode)).toEqual(["USD", "UYU"]);
  });

  it("inmutabilidad: no modifica los inputs", () => {
    const inv = invoice({ id: "i1", total: 100, balance: 30, currency: "UYU" });
    const before = JSON.stringify(inv);
    buildClientCurrentDebtSummary({ invoices: [inv] });
    expect(JSON.stringify(inv)).toBe(before);
  });
});
