import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCanonicalCollectionsSnapshot,
  buildCanonicalFinancialContext,
} from "./index";
import type { CanonicalInvoiceInput, CanonicalReceiptInput } from "./types";

function ctx(overrides?: Partial<Parameters<typeof buildCanonicalFinancialContext>[0]>) {
  return buildCanonicalFinancialContext({
    workspaceId: "ws-collections",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-14",
    cutoffDate: "2026-07-14",
    ...overrides,
  });
}

function inv(o: Partial<CanonicalInvoiceInput>): CanonicalInvoiceInput {
  return {
    id: o.id ?? "inv-1",
    company_id: o.company_id ?? "company-1",
    currency_code: "currency_code" in o ? o.currency_code : "UYU",
    total_amount: o.total_amount ?? 100,
    balance_amount: "balance_amount" in o ? o.balance_amount : 0,
    issue_date: o.issue_date ?? "2026-07-05",
    due_date: o.due_date ?? "2026-07-20",
    status: o.status ?? "issued",
    is_active: o.is_active,
    is_credit_note: o.is_credit_note,
  };
}

function rec(o: Partial<CanonicalReceiptInput>): CanonicalReceiptInput {
  return {
    id: o.id ?? "rec-1",
    company_id: "company_id" in o ? o.company_id : "company-1",
    currency_code: "currency_code" in o ? o.currency_code : "UYU",
    amount: o.amount ?? 100,
    receipt_date: o.receipt_date ?? "2026-07-06",
    status: o.status ?? "paid",
    is_active: o.is_active,
  };
}

function currency(
  snapshot: ReturnType<typeof buildCanonicalCollectionsSnapshot>,
  code: "UYU" | "USD"
) {
  const row = snapshot.byCurrency.find((c) => c.currency === code);
  expect(row).toBeDefined();
  return row!;
}

describe("buildCanonicalCollectionsSnapshot", () => {
  it("separa cobrado aplicado y cobrado registrado cuando coinciden en el período", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ total_amount: 100, balance_amount: 0 })],
      receipts: [rec({ amount: 100 })],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(100);
    expect(uyu.applied.pendingBalanceAtCutoffForPeriodSales).toBe(0);
    expect(uyu.applied.appliedCollectionsAtCutoff).toBe(100);
    expect(uyu.applied.appliedCollectionRate).toBe(1);
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(100);
    expect(uyu.registered.receiptCountInPeriod).toBe(1);
  });

  it("recibo de julio para factura de junio cuenta solo como cobrado registrado", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ issue_date: "2026-06-20", total_amount: 100, balance_amount: 0 })],
      receipts: [rec({ receipt_date: "2026-07-06", amount: 100 })],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(0);
    expect(uyu.applied.appliedCollectionsAtCutoff).toBe(0);
    expect(uyu.applied.appliedCollectionRate).toBeNull();
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(100);
  });

  it("factura de julio cobrada en agosto queda pendiente al cutoff de julio", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ total_amount: 100, balance_amount: 100 })],
      receipts: [rec({ receipt_date: "2026-08-02", amount: 100 })],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(100);
    expect(uyu.applied.pendingBalanceAtCutoffForPeriodSales).toBe(100);
    expect(uyu.applied.appliedCollectionsAtCutoff).toBe(0);
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(0);
  });

  it("maneja factura parcial, abierta y totalmente saldada sin mezclar recibos", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [
        inv({ id: "partial", total_amount: 100, balance_amount: 40 }),
        inv({ id: "open", total_amount: 50, balance_amount: 50 }),
        inv({ id: "paid", total_amount: 80, balance_amount: 0 }),
      ],
      receipts: [rec({ amount: 60 })],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(230);
    expect(uyu.applied.pendingBalanceAtCutoffForPeriodSales).toBe(90);
    expect(uyu.applied.appliedCollectionsAtCutoff).toBe(140);
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(60);
  });

  it("nota de crédito reduce ventas netas y aplicado", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [
        inv({ id: "sale", total_amount: 100, balance_amount: 0 }),
        inv({ id: "credit", total_amount: 25, balance_amount: 0, is_credit_note: true }),
      ],
      receipts: [],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(75);
    expect(uyu.applied.appliedCollectionsAtCutoff).toBe(75);
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(0);
  });

  it("excluye factura void y recibo anulado, con diagnóstico de status no soportado", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ status: "void", total_amount: 100, balance_amount: 0 })],
      receipts: [rec({ status: "void", amount: 100 })],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(0);
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(0);
    expect(snapshot.diagnostics).toContainEqual({
      code: "unsupported_receipt_status",
      count: 1,
    });
  });

  it("diagnostica moneda faltante, fecha inválida, monto inválido y recibo sin compañía", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ id: "missing-currency", currency_code: null })],
      receipts: [
        rec({ id: "missing-receipt-currency", currency_code: null }),
        rec({ id: "invalid-date", receipt_date: "not-a-date" }),
        rec({ id: "invalid-amount", amount: Number.NaN }),
        rec({ id: "no-company", company_id: null }),
      ],
    });

    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        { code: "missing_invoice_currency", count: 1 },
        { code: "missing_receipt_currency", count: 1 },
        { code: "invalid_receipt_date", currency: "UYU", count: 1 },
        { code: "invalid_receipt_amount", count: 1 },
        { code: "receipt_without_company", currency: "UYU", count: 1 },
      ])
    );
  });

  it("mantiene UYU y USD separados", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [
        inv({ id: "uyu", currency_code: "UYU", total_amount: 100, balance_amount: 0 }),
        inv({ id: "usd", currency_code: "USD", total_amount: 20, balance_amount: 5 }),
      ],
      receipts: [
        rec({ id: "r-uyu", currency_code: "UYU", amount: 70 }),
        rec({ id: "r-usd", currency_code: "USD", amount: 9 }),
      ],
    });

    expect(currency(snapshot, "UYU").applied.appliedCollectionsAtCutoff).toBe(100);
    expect(currency(snapshot, "USD").applied.appliedCollectionsAtCutoff).toBe(15);
    expect(currency(snapshot, "UYU").registered.registeredCollectionsInPeriod).toBe(70);
    expect(currency(snapshot, "USD").registered.registeredCollectionsInPeriod).toBe(9);
  });

  it("períodos sin ventas o sin recibos usan null/0 explícitos", () => {
    const noSales = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [],
      receipts: [rec({ amount: 100 })],
    });
    expect(currency(noSales, "UYU").applied.appliedCollectionRate).toBeNull();
    expect(currency(noSales, "UYU").registered.registeredCollectionsInPeriod).toBe(100);

    const noReceipts = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ total_amount: 100, balance_amount: 0 })],
      receipts: [],
    });
    expect(currency(noReceipts, "UYU").registered.registeredCollectionsInPeriod).toBe(0);
  });

  it("emite diagnóstico si el aplicado bruto queda negativo", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx(),
      invoices: [inv({ total_amount: 100, balance_amount: 130 })],
      receipts: [],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.appliedCollectionsAtCutoff).toBe(0);
    expect(snapshot.diagnostics).toContainEqual({
      code: "negative_applied_collections",
      currency: "UYU",
      count: 1,
    });
  });

  it("excluye filas pre-2026 de ventas y recibos", () => {
    const snapshot = buildCanonicalCollectionsSnapshot({
      context: ctx({ periodStart: "2026-01-01", periodEnd: "2026-01-31", cutoffDate: "2026-01-31" }),
      invoices: [inv({ issue_date: "2025-12-31", total_amount: 100, balance_amount: 0 })],
      receipts: [rec({ receipt_date: "2025-12-31", amount: 100 })],
    });
    const uyu = currency(snapshot, "UYU");

    expect(uyu.applied.issuedNetInPeriod).toBe(0);
    expect(uyu.registered.registeredCollectionsInPeriod).toBe(0);
  });
});

describe("FASE 2 static guards", () => {
  const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

  it("Collections JSON y PDF comparten el mismo modelo productivo", () => {
    expect(read("app/api/copilot/reports/collections.json/route.ts")).toContain(
      "buildCollectionsReportModel"
    );
    expect(read("app/api/copilot/reports/collections.pdf/route.ts")).toContain(
      "buildCollectionsReportModel"
    );
  });

  it("consumidores migrados no muestran label visible ambiguo Cobrado", () => {
    const files = [
      "components/copilot/reports/collections-preview-dialog.tsx",
      "lib/reports/collections-report/render-collections-report-pdf.ts",
      "lib/copilot-financial-panorama-details.ts",
      "lib/copilot-hoy-executive.ts",
      "components/copilot/hoy/hoy-cockpit-card-drawer.tsx",
      "components/copilot/copilot-client-account-statement.tsx",
      "app/copilot/dashboard/dashboard-page-client.tsx",
    ];

    for (const file of files) {
      const src = read(file);
      expect(src).not.toMatch(/title="Cobrado"/);
      expect(src).not.toMatch(/label:\s*"Cobrado"/);
      expect(src).not.toMatch(/>\s*Cobrado\s*</);
      expect(src).not.toMatch(/Total cobrado|Cobrado acumulado|Cobrado según Zeta/);
    }
  });

  it("el snapshot canónico no distribuye recibos a facturas por FIFO o invoice_id", () => {
    const src = read("lib/financial/canonical/collections-snapshot.ts");
    expect(src).not.toMatch(/invoice_id|fifo|FIFO/);
  });
});
