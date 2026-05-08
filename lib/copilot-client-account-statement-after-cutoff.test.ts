import { describe, expect, it } from "vitest";

import { buildClientAfterCutoffMovements } from "./copilot-client-account-statement-after-cutoff";
import type { DataRow } from "./copilot-data";

function invoice(opts: {
  id: string;
  number?: string;
  date: string;
  total: number;
  currency?: "USD" | "UYU" | null;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    invoice_number: opts.number ?? `ZETA:CCV1:0:0:A:${opts.id}`,
    issue_date: opts.date,
    total_amount: opts.total,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    is_active: opts.active ?? true,
  };
}

function receipt(opts: {
  id: string;
  number?: string;
  date: string;
  amount: number;
  reference?: string;
  currency?: "USD" | "UYU" | null;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    receipt_number: opts.number ?? `REC-${opts.id}`,
    reference: opts.reference,
    receipt_date: opts.date,
    amount: opts.amount,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    is_active: opts.active ?? true,
  };
}

describe("buildClientAfterCutoffMovements", () => {
  it("toDate inválido → bloques vacíos", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [invoice({ id: "i1", date: "2026-05-04", total: 366, currency: "USD" })],
      receipts: [],
      toDate: null,
    });
    expect(out.uyu.movements).toEqual([]);
    expect(out.usd.movements).toEqual([]);
  });

  it("filas anteriores o iguales al corte no aparecen; las posteriores sí", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", date: "2026-04-17", total: 100, currency: "USD" }),
        invoice({ id: "i2", date: "2026-04-18", total: 200, currency: "USD" }),
        invoice({ id: "i3", date: "2026-05-04", total: 366, currency: "USD" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-03-01", amount: 50, currency: "USD" }),
      ],
      toDate: "2026-04-17",
    });
    expect(out.usd.movements.map((m) => m.id)).toEqual(["i2", "i3"]);
    expect(out.uyu.movements).toEqual([]);
  });

  it("caso Álvarez: rango 2025-12-01 → 2026-04-17 deja A-701, A-2895, A-722 después", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i_2773", date: "2026-02-18", total: 1037, currency: "USD" }),
        invoice({ id: "i_2895", number: "ZETA:CCV1:0:190:A:2895", date: "2026-05-04", total: 366, currency: "USD" }),
      ],
      receipts: [
        receipt({ id: "r_587", date: "2026-02-24", amount: 1037, reference: "A-587", currency: "USD" }),
        receipt({ id: "r_701", date: "2026-04-20", amount: 732, reference: "A-701", currency: "USD" }),
        receipt({ id: "r_722", date: "2026-05-07", amount: 366, reference: "A-722", currency: "USD" }),
      ],
      toDate: "2026-04-17",
      ledgerMode: true,
    });
    expect(out.usd.movements.map((m) => `${m.kind}:${m.seriesNumber}`)).toEqual([
      "receipt:A-701",
      "invoice:A-2895",
      "receipt:A-722",
    ]);
    expect(out.usd.totalDebit).toBe(366);
    expect(out.usd.totalCredit).toBe(732 + 366);
    // Net = credit - debit = 1098 - 366 = 732
    expect(out.usd.netImpact).toBe(732);
  });

  it("ordena ASC por fecha y, mismo día, factura antes que recibo", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", date: "2026-05-04", total: 100, currency: "USD" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-05-04", amount: 50, currency: "USD" }),
        receipt({ id: "r2", date: "2026-05-05", amount: 25, currency: "USD" }),
      ],
      toDate: "2026-04-30",
    });
    expect(out.usd.movements.map((m) => `${m.kind}:${m.id}`)).toEqual([
      "invoice:i1",
      "receipt:r1",
      "receipt:r2",
    ]);
  });

  it("default operacional: descarta is_active=false posteriores al corte", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", date: "2026-05-04", total: 100, currency: "USD", active: false }),
        invoice({ id: "i2", date: "2026-05-04", total: 200, currency: "USD" }),
      ],
      receipts: [],
      toDate: "2026-04-30",
    });
    expect(out.usd.movements.map((m) => m.id)).toEqual(["i2"]);
  });

  it("ledgerMode=true: incluye is_active=false posteriores al corte", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", date: "2026-05-04", total: 100, currency: "USD", active: false }),
        invoice({ id: "i2", date: "2026-05-04", total: 200, currency: "USD" }),
      ],
      receipts: [],
      toDate: "2026-04-30",
      ledgerMode: true,
    });
    expect(out.usd.movements.map((m) => m.id)).toEqual(["i1", "i2"]);
  });

  it("descarta filas con moneda indeterminable (no infla unknownCurrency aquí)", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", date: "2026-05-04", total: 100, currency: null }),
        invoice({ id: "i2", date: "2026-05-04", total: 200, currency: "UYU" }),
      ],
      receipts: [],
      toDate: "2026-04-30",
    });
    expect(out.uyu.movements.map((m) => m.id)).toEqual(["i2"]);
    expect(out.usd.movements).toEqual([]);
  });

  it("seriesNumber parsea ZETA:CCV1:* en facturas y A-NNN en recibos", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", number: "ZETA:CCV1:0:190:B:0042", date: "2026-05-04", total: 100, currency: "UYU" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-05-04", amount: 25, reference: "A-7", currency: "UYU" }),
      ],
      toDate: "2026-04-30",
    });
    const labels = out.uyu.movements.map((m) => `${m.kind}:${m.seriesNumber}`);
    expect(labels).toEqual(["invoice:B-42", "receipt:A-7"]);
  });

  it("netImpact: ventas posteriores → negativo (saldo crece)", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [
        invoice({ id: "i1", date: "2026-05-04", total: 100, currency: "UYU" }),
      ],
      receipts: [],
      toDate: "2026-04-30",
    });
    expect(out.uyu.totalDebit).toBe(100);
    expect(out.uyu.totalCredit).toBe(0);
    expect(out.uyu.netImpact).toBe(-100);
  });

  it("netImpact: cobros posteriores → positivo (saldo cae)", () => {
    const out = buildClientAfterCutoffMovements({
      invoices: [],
      receipts: [
        receipt({ id: "r1", date: "2026-05-04", amount: 100, currency: "UYU" }),
      ],
      toDate: "2026-04-30",
    });
    expect(out.uyu.totalCredit).toBe(100);
    expect(out.uyu.netImpact).toBe(100);
  });
});
