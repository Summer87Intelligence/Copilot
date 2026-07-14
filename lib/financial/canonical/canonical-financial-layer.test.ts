import { describe, expect, it } from "vitest";

import {
  buildCanonicalAgingMetrics,
  buildCanonicalDebtMetrics,
  buildCanonicalFinancialContext,
  buildCanonicalFinancialSummary,
  buildCanonicalRegisteredCollectionsMetrics,
  buildCanonicalSalesMetrics,
} from "./index";
import type { CanonicalInvoiceInput, CanonicalReceiptInput } from "./types";

/**
 * Corte fijo para aging determinista. Días de atraso = cutoff − due_date.
 *  due 2026-07-26 → 5 días · 2026-07-21 → 10 · 2026-07-11 → 20 · 2026-06-16 → 45
 *  due 2026-08-15 → -15 (al día).
 */
const CUTOFF = "2026-07-31";

function ctx(overrides?: Partial<Parameters<typeof buildCanonicalFinancialContext>[0]>) {
  return buildCanonicalFinancialContext({
    workspaceId: "ws-1",
    periodStart: "2026-07-01",
    periodEnd: CUTOFF,
    cutoffDate: CUTOFF,
    ...overrides,
  });
}

function inv(o: Partial<CanonicalInvoiceInput>): CanonicalInvoiceInput {
  return {
    id: o.id ?? "i1",
    company_id: o.company_id ?? "c1",
    currency_code: "currency_code" in o ? o.currency_code : "UYU",
    total_amount: o.total_amount ?? 0,
    balance_amount: o.balance_amount ?? 0,
    status: o.status ?? "issued",
    issue_date: o.issue_date ?? "2026-07-05",
    due_date: o.due_date,
    is_credit_note: o.is_credit_note,
    is_active: o.is_active,
  };
}

describe("canonical aging buckets (due_date)", () => {
  const base = { currency_code: "UYU", total_amount: 1000, balance_amount: 1000, issue_date: "2026-05-01" };

  it("Caso 1 — factura al día (vence en el futuro) → current", () => {
    const aging = buildCanonicalAgingMetrics([inv({ ...base, due_date: "2026-08-15" })], ctx(), "UYU");
    expect(aging.current).toBe(1000);
    expect(aging.total).toBe(1000);
    expect(aging.overdue1To7).toBe(0);
  });

  it("Caso 2 — 5 días de atraso → overdue_1_7", () => {
    const aging = buildCanonicalAgingMetrics([inv({ ...base, due_date: "2026-07-26" })], ctx(), "UYU");
    expect(aging.overdue1To7).toBe(1000);
  });

  it("Caso 3 — 10 días de atraso → overdue_8_14", () => {
    const aging = buildCanonicalAgingMetrics([inv({ ...base, due_date: "2026-07-21" })], ctx(), "UYU");
    expect(aging.overdue8To14).toBe(1000);
  });

  it("Caso 4 — 20 días de atraso → overdue_15_30", () => {
    const aging = buildCanonicalAgingMetrics([inv({ ...base, due_date: "2026-07-11" })], ctx(), "UYU");
    expect(aging.overdue15To30).toBe(1000);
  });

  it("Caso 5 — 45 días de atraso → overdue_31_plus", () => {
    const aging = buildCanonicalAgingMetrics([inv({ ...base, due_date: "2026-06-16" })], ctx(), "UYU");
    expect(aging.overdue31Plus).toBe(1000);
  });
});

describe("Caso 6 — factura con cuotas (aging solo sobre balance abierto)", () => {
  // El caller expande cuotas a filas por cuota abierta (una fila por cuota con
  // due_date y balance propios). La cuota saldada (balance 0) no aporta.
  const installments: CanonicalInvoiceInput[] = [
    inv({ id: "inv1-c1", due_date: "2026-06-16", total_amount: 1000, balance_amount: 0, issue_date: "2026-04-01" }), // saldada
    inv({ id: "inv1-c2", due_date: "2026-08-15", total_amount: 1000, balance_amount: 1000, issue_date: "2026-04-01" }), // abierta al día
    inv({ id: "inv1-c3", due_date: "2026-07-11", total_amount: 1000, balance_amount: 1000, issue_date: "2026-04-01" }), // abierta atrasada 20d
  ];

  it("aging distribuye por vencimiento de cada cuota abierta; la saldada no cuenta", () => {
    const aging = buildCanonicalAgingMetrics(installments, ctx(), "UYU");
    expect(aging.current).toBe(1000); // cuota 2
    expect(aging.overdue15To30).toBe(1000); // cuota 3
    expect(aging.total).toBe(2000); // solo balance abierto
  });

  it("deuda: pendiente 2000, vencido 1000", () => {
    const debt = buildCanonicalDebtMetrics(installments, ctx(), "UYU");
    expect(debt.pendingBalance).toBe(2000);
    expect(debt.overdueBalance).toBe(1000);
    expect(debt.currentBalance).toBe(1000);
  });
});

describe("Caso 7 — cobro registrado en julio de factura emitida en junio", () => {
  const junPeriod = ctx({ periodStart: "2026-07-01", periodEnd: "2026-07-31" });
  const invoiceJune = inv({ issue_date: "2026-06-20", total_amount: 5000, balance_amount: 0 });
  const receiptJuly: CanonicalReceiptInput = {
    currency_code: "UYU",
    amount: 5000,
    receipt_date: "2026-07-10",
    status: "paid",
  };

  it("impacta cobrado registrado de julio", () => {
    const coll = buildCanonicalRegisteredCollectionsMetrics([receiptJuly], junPeriod, "UYU");
    expect(coll.registeredCollections).toBe(5000);
    expect(coll.receiptCount).toBe(1);
  });

  it("NO impacta ventas emitidas de julio (factura es de junio)", () => {
    const sales = buildCanonicalSalesMetrics([invoiceJune], junPeriod, "UYU");
    expect(sales.issuedNet).toBe(0);
    expect(sales.invoiceCount).toBe(0);
  });
});

describe("Caso 8 — factura emitida en julio, cobrada en agosto", () => {
  const julio = ctx({ periodStart: "2026-07-01", periodEnd: "2026-07-31", cutoffDate: "2026-07-31" });
  const agosto = ctx({ periodStart: "2026-08-01", periodEnd: "2026-08-31", cutoffDate: "2026-08-31" });
  // Emitida en julio, todavía pendiente al corte de julio.
  const invoiceJuly = inv({ issue_date: "2026-07-15", due_date: "2026-08-15", total_amount: 8000, balance_amount: 8000 });
  const receiptAug: CanonicalReceiptInput = {
    currency_code: "UYU",
    amount: 8000,
    receipt_date: "2026-08-05",
    status: "paid",
  };

  it("ventas emitidas de julio = 8000; cobrado aplicado al corte = 0 (sigue pendiente)", () => {
    const sales = buildCanonicalSalesMetrics([invoiceJuly], julio, "UYU");
    expect(sales.issuedNet).toBe(8000);
    expect(sales.pendingAtCutoff).toBe(8000);
    expect(sales.appliedCollected).toBe(0);
    expect(sales.collectionRate).toBe(0);
  });

  it("cobrado registrado de agosto = 8000", () => {
    const coll = buildCanonicalRegisteredCollectionsMetrics([receiptAug], agosto, "UYU");
    expect(coll.registeredCollections).toBe(8000);
  });
});

describe("Caso 9 — nota de crédito reduce ventas netas", () => {
  it("issuedNet = venta − NC; cuenta de NC expuesta", () => {
    const rows = [
      inv({ id: "v1", issue_date: "2026-07-05", total_amount: 10000, balance_amount: 0 }),
      inv({ id: "nc1", issue_date: "2026-07-08", total_amount: 2000, balance_amount: 0, is_credit_note: true }),
    ];
    const sales = buildCanonicalSalesMetrics(rows, ctx(), "UYU");
    expect(sales.issuedNet).toBe(8000);
    expect(sales.creditNoteAmount).toBe(2000);
    expect(sales.creditNoteCount).toBe(1);
    expect(sales.invoiceCount).toBe(1); // la NC no cuenta como factura de venta
  });
});

describe("Caso 10 — multimoneda separada", () => {
  const rows = [
    inv({ id: "u1", currency_code: "UYU", issue_date: "2026-07-05", total_amount: 3000, balance_amount: 3000, due_date: "2026-06-16" }),
    inv({ id: "d1", currency_code: "USD", issue_date: "2026-07-06", total_amount: 500, balance_amount: 500, due_date: "2026-06-16" }),
  ];

  it("UYU y USD nunca se suman", () => {
    const summary = buildCanonicalFinancialSummary({ context: ctx(), invoices: rows });
    const uyu = summary.byCurrency.find((c) => c.currency === "UYU")!;
    const usd = summary.byCurrency.find((c) => c.currency === "USD")!;
    expect(uyu.debt.pendingBalance).toBe(3000);
    expect(usd.debt.pendingBalance).toBe(500);
    expect(uyu.aging.overdue31Plus).toBe(3000);
    expect(usd.aging.overdue31Plus).toBe(500);
  });
});

describe("Caso 11 — facturas pre-2026 excluidas de KPIs", () => {
  const rows = [
    inv({ id: "old", issue_date: "2025-12-20", total_amount: 9999, balance_amount: 9999, due_date: "2025-12-30" }),
    inv({ id: "new", issue_date: "2026-07-05", total_amount: 1000, balance_amount: 1000, due_date: "2026-08-15" }),
  ];

  it("no participan en ventas, deuda ni aging, y se cuentan en diagnósticos", () => {
    const summary = buildCanonicalFinancialSummary({ context: ctx(), invoices: rows });
    const uyu = summary.byCurrency.find((c) => c.currency === "UYU")!;
    expect(uyu.sales.issuedNet).toBe(1000);
    expect(uyu.debt.pendingBalance).toBe(1000);
    expect(summary.diagnostics.excludedByMinFinancialDate).toBe(1);
  });
});

describe("Caso 12 — currency_code nulo: excluir + marcar inconsistencia", () => {
  const rows = [
    inv({ id: "nullcur", currency_code: null, issue_date: "2026-07-05", total_amount: 1000, balance_amount: 1000 }),
    inv({ id: "ok", currency_code: "UYU", issue_date: "2026-07-05", total_amount: 2000, balance_amount: 2000, due_date: "2026-08-15" }),
  ];

  it("la fila sin moneda se excluye y se reporta en diagnósticos", () => {
    const summary = buildCanonicalFinancialSummary({ context: ctx(), invoices: rows });
    const uyu = summary.byCurrency.find((c) => c.currency === "UYU")!;
    expect(uyu.debt.pendingBalance).toBe(2000);
    expect(summary.diagnostics.excludedByUnknownCurrency).toBe(1);
  });
});

describe("invariantes canónicas", () => {
  it("aging.total === debt.pendingBalance para la misma moneda", () => {
    const rows = [
      inv({ id: "a", issue_date: "2026-06-01", total_amount: 1000, balance_amount: 400, due_date: "2026-07-26" }),
      inv({ id: "b", issue_date: "2026-06-01", total_amount: 1000, balance_amount: 600, due_date: "2026-08-15" }),
      inv({ id: "c", issue_date: "2026-06-01", total_amount: 1000, balance_amount: 0, due_date: "2026-06-01" }), // saldada
    ];
    const context = ctx();
    const debt = buildCanonicalDebtMetrics(rows, context, "UYU");
    const aging = buildCanonicalAgingMetrics(rows, context, "UYU");
    expect(aging.total).toBe(debt.pendingBalance);
    expect(aging.total).toBe(1000);
  });

  it("appliedCollected = issuedNet − pendingAtCutoff (parcialmente cobrada)", () => {
    const rows = [
      inv({ id: "p", issue_date: "2026-07-05", total_amount: 10000, balance_amount: 4000 }),
    ];
    const sales = buildCanonicalSalesMetrics(rows, ctx(), "UYU");
    expect(sales.issuedNet).toBe(10000);
    expect(sales.pendingAtCutoff).toBe(4000);
    expect(sales.appliedCollected).toBe(6000);
    expect(sales.collectionRate).toBeCloseTo(0.6, 5);
    expect(sales.averageTicket).toBe(10000);
  });

  it("contexto: periodEnd anterior a periodStart lanza", () => {
    expect(() => ctx({ periodStart: "2026-07-31", periodEnd: "2026-07-01" })).toThrow();
  });
});
