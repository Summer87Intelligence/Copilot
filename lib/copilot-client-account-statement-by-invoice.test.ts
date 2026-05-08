import { describe, expect, it } from "vitest";

import {
  buildClientAccountStatementByInvoice,
  classifyInvoiceFocusedStatus,
  describeInvoiceFocusedStatus,
} from "./copilot-client-account-statement-by-invoice";
import type { DataRow } from "./copilot-data";

function invoice(opts: {
  id: string;
  number?: string;
  date: string;
  total: number;
  balance?: number | null | undefined;
  currency?: "USD" | "UYU" | null;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    invoice_number: opts.number ?? `INV-${opts.id}`,
    issue_date: opts.date,
    total_amount: opts.total,
    balance_amount: opts.balance === undefined ? 0 : opts.balance,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    is_active: opts.active ?? true,
  };
}

function receipt(opts: {
  id: string;
  number?: string;
  date: string;
  amount: number;
  currency?: "USD" | "UYU" | null;
  active?: boolean;
  paymentMethod?: string | null;
  reference?: string | null;
}): DataRow {
  return {
    id: opts.id,
    receipt_number: opts.number ?? `REC-${opts.id}`,
    receipt_date: opts.date,
    amount: opts.amount,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    is_active: opts.active ?? true,
    payment_method: opts.paymentMethod ?? null,
    reference: opts.reference ?? null,
  };
}

describe("classifyInvoiceFocusedStatus", () => {
  it("balance 0 → paid", () => {
    expect(classifyInvoiceFocusedStatus(1000, 0)).toBe("paid");
  });
  it("balance < 0 (defensivo) → paid", () => {
    expect(classifyInvoiceFocusedStatus(1000, -5)).toBe("paid");
  });
  it("balance == total → pending", () => {
    expect(classifyInvoiceFocusedStatus(1000, 1000)).toBe("pending");
  });
  it("balance > total (defensivo) → pending", () => {
    expect(classifyInvoiceFocusedStatus(1000, 1200)).toBe("pending");
  });
  it("0 < balance < total → partial", () => {
    expect(classifyInvoiceFocusedStatus(1000, 250)).toBe("partial");
  });
});

describe("buildClientAccountStatementByInvoice — casos del prompt", () => {
  it("factura con balance_amount = 0 → paidAmount = total, pending = 0, status = paid", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [invoice({ id: "i1", date: "2026-01-15", total: 1000, balance: 0, currency: "UYU" })],
      receipts: [],
    });
    expect(stmt.uyu.invoices).toHaveLength(1);
    const row = stmt.uyu.invoices[0];
    expect(row.totalAmount).toBe(1000);
    expect(row.paidAmount).toBe(1000);
    expect(row.pendingAmount).toBe(0);
    expect(row.status).toBe("paid");
    expect(stmt.uyu.summary.totalInvoiced).toBe(1000);
    expect(stmt.uyu.summary.totalCollectedApplied).toBe(1000);
    expect(stmt.uyu.summary.totalPending).toBe(0);
    expect(stmt.uyu.summary.paidCount).toBe(1);
  });

  it("factura con balance_amount = total_amount → paidAmount = 0, pending = total, status = pending", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 500, balance: 500, currency: "UYU" }),
      ],
      receipts: [],
    });
    const row = stmt.uyu.invoices[0];
    expect(row.totalAmount).toBe(500);
    expect(row.paidAmount).toBe(0);
    expect(row.pendingAmount).toBe(500);
    expect(row.status).toBe("pending");
    expect(stmt.uyu.summary.pendingCount).toBe(1);
  });

  it("factura con 0 < balance < total → status = partial y paidAmount = total - balance", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, balance: 250, currency: "UYU" }),
      ],
      receipts: [],
    });
    const row = stmt.uyu.invoices[0];
    expect(row.totalAmount).toBe(1000);
    expect(row.pendingAmount).toBe(250);
    expect(row.paidAmount).toBe(750);
    expect(row.status).toBe("partial");
    expect(stmt.uyu.summary.partialCount).toBe(1);
  });

  it("no mezcla monedas: facturas USD y UYU se separan", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "u1", date: "2026-01-15", total: 12300, balance: 5000, currency: "UYU" }),
        invoice({ id: "u2", date: "2026-02-10", total: 4400, balance: 0, currency: "UYU" }),
        invoice({ id: "d1", date: "2026-01-20", total: 1000, balance: 1000, currency: "USD" }),
      ],
      receipts: [],
    });
    expect(stmt.uyu.invoices).toHaveLength(2);
    expect(stmt.usd.invoices).toHaveLength(1);
    for (const r of stmt.uyu.invoices) expect(r.currency).toBe("UYU");
    for (const r of stmt.usd.invoices) expect(r.currency).toBe("USD");
    expect(stmt.uyu.summary.totalPending).toBe(5000);
    expect(stmt.usd.summary.totalPending).toBe(1000);
  });

  it("recibos NO afectan pending por factura: pendingAmount viene sólo de balance_amount", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, balance: 1000, currency: "UYU" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-02-01", amount: 10000, currency: "UYU" }),
        receipt({ id: "r2", date: "2026-02-02", amount: 999, currency: "UYU" }),
      ],
    });
    expect(stmt.uyu.invoices[0].pendingAmount).toBe(1000);
    expect(stmt.uyu.invoices[0].paidAmount).toBe(0);
    expect(stmt.uyu.summary.totalPending).toBe(1000);
    // Recibos quedan separados como unmatched
    expect(stmt.uyu.unmatchedReceipts).toHaveLength(2);
    expect(stmt.uyu.summary.unmatchedReceiptCount).toBe(2);
    expect(stmt.uyu.summary.unmatchedReceiptAmount).toBe(10999);
  });

  it("recibos USD van al bloque USD; recibos UYU al bloque UYU", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [],
      receipts: [
        receipt({ id: "r-uyu", date: "2026-01-10", amount: 5000, currency: "UYU" }),
        receipt({ id: "r-usd", date: "2026-01-12", amount: 305, currency: "USD" }),
      ],
    });
    expect(stmt.uyu.unmatchedReceipts).toHaveLength(1);
    expect(stmt.usd.unmatchedReceipts).toHaveLength(1);
    expect(stmt.uyu.unmatchedReceipts[0].amount).toBe(5000);
    expect(stmt.usd.unmatchedReceipts[0].amount).toBe(305);
  });

  it("no muta los inputs", () => {
    const inv = invoice({ id: "i1", date: "2026-01-15", total: 1000, balance: 250, currency: "UYU" });
    const rec = receipt({ id: "r1", date: "2026-02-01", amount: 100, currency: "UYU" });
    const invoicesArr = [inv];
    const receiptsArr = [rec];
    const invoicesSnapshot = JSON.stringify(invoicesArr);
    const receiptsSnapshot = JSON.stringify(receiptsArr);
    const invSnap = JSON.stringify(inv);
    const recSnap = JSON.stringify(rec);

    buildClientAccountStatementByInvoice({ invoices: invoicesArr, receipts: receiptsArr });
    buildClientAccountStatementByInvoice({ invoices: invoicesArr, receipts: receiptsArr });

    expect(JSON.stringify(invoicesArr)).toBe(invoicesSnapshot);
    expect(JSON.stringify(receiptsArr)).toBe(receiptsSnapshot);
    expect(JSON.stringify(inv)).toBe(invSnap);
    expect(JSON.stringify(rec)).toBe(recSnap);
  });

  it("filas inactivas se omiten en facturas y recibos", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, balance: 1000, currency: "UYU" }),
        invoice({
          id: "i2",
          date: "2026-01-16",
          total: 999,
          balance: 999,
          currency: "UYU",
          active: false,
        }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-02-05", amount: 50, currency: "UYU" }),
        receipt({ id: "r2", date: "2026-02-06", amount: 999, currency: "UYU", active: false }),
      ],
    });
    expect(stmt.uyu.summary.invoiceCount).toBe(1);
    expect(stmt.uyu.summary.totalInvoiced).toBe(1000);
    expect(stmt.uyu.unmatchedReceipts).toHaveLength(1);
  });

  it("balance_amount = null → asumir pendiente total (conservador)", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, balance: null, currency: "UYU" }),
      ],
      receipts: [],
    });
    const row = stmt.uyu.invoices[0];
    expect(row.totalAmount).toBe(1000);
    expect(row.pendingAmount).toBe(1000);
    expect(row.paidAmount).toBe(0);
    expect(row.status).toBe("pending");
  });

  it("ignora facturas con total_amount <= 0", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i0", date: "2026-01-01", total: 0, balance: 0, currency: "UYU" }),
        invoice({ id: "i-neg", date: "2026-01-02", total: -50, balance: 0, currency: "UYU" }),
        invoice({ id: "i1", date: "2026-01-03", total: 100, balance: 0, currency: "UYU" }),
      ],
      receipts: [],
    });
    expect(stmt.uyu.summary.invoiceCount).toBe(1);
    expect(stmt.uyu.invoices[0].id).toBe("i1");
  });

  it("moneda no determinable se cuenta en unknownCurrencyCount y NO asume UYU", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [invoice({ id: "i1", date: "2026-01-01", total: 1000, currency: null })],
      receipts: [receipt({ id: "r1", date: "2026-02-01", amount: 50, currency: null })],
    });
    expect(stmt.unknownCurrencyCount).toBe(2);
    expect(stmt.uyu.summary.invoiceCount).toBe(0);
    expect(stmt.usd.summary.invoiceCount).toBe(0);
  });

  it("orden DESC por fecha (más reciente arriba) en facturas y recibos", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-01", total: 100, balance: 0, currency: "UYU" }),
        invoice({ id: "i2", date: "2026-03-01", total: 100, balance: 0, currency: "UYU" }),
        invoice({ id: "i3", date: "2026-02-01", total: 100, balance: 0, currency: "UYU" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-01-15", amount: 50, currency: "UYU" }),
        receipt({ id: "r2", date: "2026-04-15", amount: 50, currency: "UYU" }),
      ],
    });
    expect(stmt.uyu.invoices.map((r) => r.id)).toEqual(["i2", "i3", "i1"]);
    expect(stmt.uyu.unmatchedReceipts.map((r) => r.id)).toEqual(["r2", "r1"]);
  });

  it("paidAmount tolera redondeo: balance ligeramente mayor a total no genera negativo", () => {
    const stmt = buildClientAccountStatementByInvoice({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 100, balance: 100.005, currency: "UYU" }),
      ],
      receipts: [],
    });
    expect(stmt.uyu.invoices[0].paidAmount).toBe(0);
    expect(stmt.uyu.invoices[0].status).toBe("pending");
  });

  // -------------------------------------------------------------------------
  // Capa financiera (`ledgerMode: true`)
  //
  // Misma regla que en `buildClientAccountStatement`: facturas archivadas
  // (`is_active=false`) que ya están cobradas deben aparecer en la vista
  // "Por factura" cuando el caller pide el reporte histórico.
  // -------------------------------------------------------------------------
  describe("ledgerMode", () => {
    it("default operacional: descarta factura inactiva", () => {
      const stmt = buildClientAccountStatementByInvoice({
        invoices: [
          invoice({ id: "i1", date: "2026-02-18", total: 1037, balance: 0, currency: "USD" }),
          invoice({
            id: "i2",
            date: "2026-04-06",
            total: 366,
            balance: 0,
            currency: "USD",
            active: false,
          }),
        ],
        receipts: [],
      });
      expect(stmt.usd.summary.invoiceCount).toBe(1);
      expect(stmt.usd.summary.totalInvoiced).toBe(1037);
    });

    it("ledgerMode=true: incluye facturas inactivas y suma a totales", () => {
      const stmt = buildClientAccountStatementByInvoice({
        invoices: [
          invoice({ id: "i1", date: "2026-02-18", total: 1037, balance: 0, currency: "USD" }),
          invoice({
            id: "i2",
            date: "2026-04-06",
            total: 366,
            balance: 0,
            currency: "USD",
            active: false,
          }),
        ],
        receipts: [],
        ledgerMode: true,
      });
      expect(stmt.usd.summary.invoiceCount).toBe(2);
      expect(stmt.usd.summary.totalInvoiced).toBe(1403);
      expect(stmt.usd.summary.paidCount).toBe(2);
    });

    it("ledgerMode=true: incluye recibos inactivos en unmatchedReceipts", () => {
      const stmt = buildClientAccountStatementByInvoice({
        invoices: [],
        receipts: [
          receipt({
            id: "r1",
            date: "2026-02-24",
            amount: 1037,
            currency: "USD",
            active: false,
          }),
        ],
        ledgerMode: true,
      });
      expect(stmt.usd.summary.unmatchedReceiptCount).toBe(1);
      expect(stmt.usd.summary.unmatchedReceiptAmount).toBe(1037);
    });
  });
});

describe("describeInvoiceFocusedStatus", () => {
  it("etiquetas en español", () => {
    expect(describeInvoiceFocusedStatus("paid")).toBe("Cobrada");
    expect(describeInvoiceFocusedStatus("partial")).toBe("Parcial");
    expect(describeInvoiceFocusedStatus("pending")).toBe("Pendiente");
  });
});
