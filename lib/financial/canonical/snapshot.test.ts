import { describe, expect, it } from "vitest";

import { buildCanonicalFinancialContext } from "./report-context";
import { buildCanonicalDebtSnapshot } from "./snapshot";
import type { CanonicalInstallmentInput, CanonicalInvoiceInput } from "./types";

const CUTOFF = "2026-07-31";

function ctx() {
  return buildCanonicalFinancialContext({
    workspaceId: "ws",
    periodStart: "2026-01-01",
    periodEnd: CUTOFF,
    cutoffDate: CUTOFF,
  });
}

function inv(o: Partial<CanonicalInvoiceInput> & { id: string }): CanonicalInvoiceInput {
  return {
    company_id: "company_id" in o ? o.company_id : "c1",
    currency_code: "currency_code" in o ? o.currency_code : "UYU",
    total_amount: o.total_amount ?? 1000,
    balance_amount: o.balance_amount ?? 1000,
    status: o.status ?? "issued",
    issue_date: o.issue_date ?? "2026-05-01",
    due_date: o.due_date,
    is_active: o.is_active,
    is_credit_note: o.is_credit_note,
    id: o.id,
  };
}

describe("buildCanonicalDebtSnapshot", () => {
  it("byCurrency: invariantes pendiente = al día + atrasado + sin vencimiento", () => {
    const snap = buildCanonicalDebtSnapshot({
      invoices: [
        inv({ id: "a", company_id: "c1", balance_amount: 400, due_date: "2026-07-26" }), // 5d atraso
        inv({ id: "b", company_id: "c1", balance_amount: 600, due_date: "2026-08-15" }), // al día
        inv({ id: "c", company_id: "c2", balance_amount: 300, due_date: undefined }), // sin due
      ],
      context: ctx(),
    });
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    expect(uyu.metrics.pendingBalance).toBe(1300);
    expect(uyu.metrics.overdueBalance).toBe(400);
    expect(uyu.metrics.currentBalance).toBe(900); // 600 al día + 300 sin due
    expect(uyu.metrics.balanceWithoutDueDate).toBe(300);
    expect(
      uyu.metrics.currentBalance + uyu.metrics.overdueBalance
    ).toBe(uyu.metrics.pendingBalance);
    // aging total = pendiente
    expect(uyu.aging.total).toBe(uyu.metrics.pendingBalance);
    expect(uyu.aging.overdue1To7).toBe(400);
  });

  it("suma de saldos por compañía = saldo global (pending y overdue)", () => {
    const snap = buildCanonicalDebtSnapshot({
      invoices: [
        inv({ id: "a", company_id: "c1", balance_amount: 1000, due_date: "2026-06-16" }), // overdue
        inv({ id: "b", company_id: "c2", balance_amount: 500, due_date: "2026-08-15" }), // al día
      ],
      context: ctx(),
    });
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    const sumPending = snap.byCompany.reduce(
      (s, co) => s + (co.byCurrency.find((b) => b.currency === "UYU")?.metrics.pendingBalance ?? 0),
      0
    );
    const sumOverdue = snap.byCompany.reduce(
      (s, co) => s + (co.byCurrency.find((b) => b.currency === "UYU")?.metrics.overdueBalance ?? 0),
      0
    );
    expect(sumPending).toBe(uyu.metrics.pendingBalance);
    expect(sumOverdue).toBe(uyu.metrics.overdueBalance);
  });

  it("clientes con atraso: regla única (overdueBalance>0), sin duplicar por factura", () => {
    const snap = buildCanonicalDebtSnapshot({
      invoices: [
        inv({ id: "a", company_id: "c1", balance_amount: 100, due_date: "2026-06-16" }),
        inv({ id: "b", company_id: "c1", balance_amount: 200, due_date: "2026-06-10" }), // mismo cliente, 2 facturas atrasadas
        inv({ id: "c", company_id: "c2", balance_amount: 300, due_date: "2026-08-15" }), // al día
      ],
      context: ctx(),
    });
    expect(snap.overdueClientsByCurrency.UYU).toEqual(["c1"]);
    expect(snap.overdueClientsAnyCurrency).toEqual(["c1"]);
  });

  it("cliente multi-moneda: cuenta separado por moneda y unión global", () => {
    const snap = buildCanonicalDebtSnapshot({
      invoices: [
        inv({ id: "u", company_id: "c1", currency_code: "UYU", balance_amount: 100, due_date: "2026-06-16" }),
        inv({ id: "d", company_id: "c1", currency_code: "USD", balance_amount: 50, due_date: "2026-06-16" }),
      ],
      context: ctx(),
    });
    expect(snap.overdueClientsByCurrency.UYU).toEqual(["c1"]);
    expect(snap.overdueClientsByCurrency.USD).toEqual(["c1"]);
    expect(snap.overdueClientsAnyCurrency).toEqual(["c1"]); // unión dedup
  });

  it("cuotas: aging por cuota, snapshot sin doble conteo", () => {
    const installments: CanonicalInstallmentInput[] = [
      { id: "q1", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: "2026-06-10" }, // atrasada
      { id: "q2", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: "2026-08-15" }, // al día
    ];
    const snap = buildCanonicalDebtSnapshot({
      invoices: [inv({ id: "i1", company_id: "c1", balance_amount: 2000, due_date: "2026-06-01" })],
      installments,
      context: ctx(),
    });
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    expect(uyu.metrics.pendingBalance).toBe(2000); // no 4000
    expect(uyu.metrics.overdueBalance).toBe(1000);
    expect(uyu.aging.overdue31Plus).toBe(1000);
  });

  it("diagnósticos: moneda faltante contada, factura excluida de totales", () => {
    const snap = buildCanonicalDebtSnapshot({
      invoices: [
        inv({ id: "bad", currency_code: null, balance_amount: 999, due_date: "2026-06-16" }),
        inv({ id: "ok", currency_code: "UYU", balance_amount: 100, due_date: "2026-08-15" }),
      ],
      context: ctx(),
    });
    expect(snap.diagnosticCounts.missing_currency).toBe(1);
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    expect(uyu.metrics.pendingBalance).toBe(100);
  });
});
