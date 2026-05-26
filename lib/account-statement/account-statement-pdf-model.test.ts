/**
 * Tests del modelo de estado de cuenta orientados al PDF:
 * running balance, saldo anterior, saldo final, separación de monedas,
 * y fixture El País S.A.
 */
import { describe, expect, it } from "vitest";

import {
  buildClientAccountStatement,
} from "@/lib/copilot-client-account-statement";
import type { DataRow } from "@/lib/copilot-data";

// ── Factories ─────────────────────────────────────────────────────────────────

function invoice(opts: {
  id: string;
  number?: string;
  date: string;
  total: number;
  currency?: "UYU" | "USD";
}): DataRow {
  return {
    id: opts.id,
    invoice_number: opts.number ?? `INV-${opts.id}`,
    issue_date: opts.date,
    total_amount: opts.total,
    currency_code: opts.currency ?? "UYU",
    is_active: true,
  };
}

function receipt(opts: {
  id: string;
  number?: string;
  date: string;
  amount: number;
  currency?: "UYU" | "USD";
}): DataRow {
  return {
    id: opts.id,
    receipt_number: opts.number ?? `REC-${opts.id}`,
    receipt_date: opts.date,
    amount: opts.amount,
    currency_code: opts.currency ?? "UYU",
    is_active: true,
  };
}

// ── Fixture El País S.A. ──────────────────────────────────────────────────────
//
// Movimientos reales del tenant demo:
//   A2821  13/03/26  Venta Crédito  17.080,00  Debe
//   A2877  17/04/26  Venta Crédito  41.480,00  Debe
//   A2932  07/05/26  Venta Crédito   8.662,00  Debe
//   A2934  08/05/26  Venta Crédito   8.662,00  Debe
//   A391   08/05/26  Recibo          8.662,00  Haber
//   A768   20/05/26  Recibo         41.480,00  Haber
//
// Saldo final esperado: 25.742,00

const EL_PAIS_INVOICES = [
  invoice({ id: "i1", number: "A2821", date: "2026-03-13", total: 17080 }),
  invoice({ id: "i2", number: "A2877", date: "2026-04-17", total: 41480 }),
  invoice({ id: "i3", number: "A2932", date: "2026-05-07", total: 8662  }),
  invoice({ id: "i4", number: "A2934", date: "2026-05-08", total: 8662  }),
];

const EL_PAIS_RECEIPTS = [
  receipt({ id: "r1", number: "A391", date: "2026-05-08", amount: 8662  }),
  receipt({ id: "r2", number: "A768", date: "2026-05-20", amount: 41480 }),
];

describe("fixture El País S.A.", () => {
  const stmt = buildClientAccountStatement({
    invoices: EL_PAIS_INVOICES,
    receipts: EL_PAIS_RECEIPTS,
    ledgerMode: true,
  });

  it("saldo final UYU es 25742", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(25742);
  });

  it("totalDebit es 75884 (suma de facturas)", () => {
    expect(stmt.uyu.summary.totalDebit).toBe(75884);
  });

  it("totalCredit es 50142 (suma de recibos)", () => {
    expect(stmt.uyu.summary.totalCredit).toBe(50142);
  });

  it("hay 6 movimientos UYU", () => {
    expect(stmt.uyu.movements).toHaveLength(6);
  });

  it("USD vacío", () => {
    expect(stmt.usd.summary.movementCount).toBe(0);
  });

  it("running balance en cada movimiento es correcto", () => {
    const mvs = stmt.uyu.movements;
    // Orden: invoice antes que receipt mismo día, luego por número
    // 2026-03-13 A2821 debit 17080 → 17080
    // 2026-04-17 A2877 debit 41480 → 58560
    // 2026-05-07 A2932 debit  8662 → 67222
    // 2026-05-08 A2934 debit  8662 → 75884 (invoice, primero)
    // 2026-05-08 A391  credit 8662 → 67222 (receipt, después)
    // 2026-05-20 A768  credit 41480 → 25742
    const expected = [17080, 58560, 67222, 75884, 67222, 25742];
    expect(mvs.map((m) => m.runningBalance)).toEqual(expected);
  });

  it("facturas producen debit y credit = 0", () => {
    const invoiceMovs = stmt.uyu.movements.filter((m) => m.kind === "invoice");
    for (const m of invoiceMovs) {
      expect(m.debit).toBeGreaterThan(0);
      expect(m.credit).toBe(0);
    }
  });

  it("recibos producen credit y debit = 0", () => {
    const receiptMovs = stmt.uyu.movements.filter((m) => m.kind === "receipt");
    for (const m of receiptMovs) {
      expect(m.credit).toBeGreaterThan(0);
      expect(m.debit).toBe(0);
    }
  });

  it("primer movimiento es la factura más antigua (A2821)", () => {
    expect(stmt.uyu.movements[0].number).toBe("A2821");
    expect(stmt.uyu.movements[0].kind).toBe("invoice");
  });

  it("último movimiento es el recibo A768 con saldo 25742", () => {
    const last = stmt.uyu.movements[stmt.uyu.movements.length - 1];
    expect(last.number).toBe("A768");
    expect(last.kind).toBe("receipt");
    expect(last.runningBalance).toBe(25742);
  });
});

// ── Saldo anterior (previousBalance) ─────────────────────────────────────────

describe("saldo anterior al filtrar por período", () => {
  it("movimientos antes del período quedan fuera pero afectan el runningBalance", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "prev", date: "2025-12-01", total: 5000 }),
        invoice({ id: "curr", date: "2026-01-15", total: 3000 }),
      ],
      receipts: [],
      ledgerMode: true,
    });

    // El movimiento de enero ya tiene runningBalance = 5000 + 3000 = 8000
    const jan = stmt.uyu.movements.find((m) => m.id === "curr");
    expect(jan?.runningBalance).toBe(8000);

    // El movimiento de dic tiene runningBalance = 5000
    const dec = stmt.uyu.movements.find((m) => m.id === "prev");
    expect(dec?.runningBalance).toBe(5000);
  });
});

// ── Separación de monedas ─────────────────────────────────────────────────────

describe("aislamiento por moneda", () => {
  const stmt = buildClientAccountStatement({
    invoices: [
      invoice({ id: "uyu1", date: "2026-01-01", total: 10000, currency: "UYU" }),
      invoice({ id: "usd1", date: "2026-01-02", total: 500,   currency: "USD" }),
    ],
    receipts: [
      receipt({ id: "uyu-r", date: "2026-02-01", amount: 3000, currency: "UYU" }),
      receipt({ id: "usd-r", date: "2026-02-01", amount: 200,  currency: "USD" }),
    ],
    ledgerMode: true,
  });

  it("ningún movimiento UYU aparece en USD", () => {
    for (const m of stmt.usd.movements) expect(m.currency).toBe("USD");
  });

  it("ningún movimiento USD aparece en UYU", () => {
    for (const m of stmt.uyu.movements) expect(m.currency).toBe("UYU");
  });

  it("saldo UYU es 7000", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(7000);
  });

  it("saldo USD es 300", () => {
    expect(stmt.usd.summary.finalBalance).toBe(300);
  });
});
