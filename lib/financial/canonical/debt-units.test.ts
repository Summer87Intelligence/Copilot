import { describe, expect, it } from "vitest";

import { buildCanonicalFinancialContext } from "./report-context";
import { buildCanonicalDebtUnits } from "./debt-units";
import {
  buildCanonicalAgingMetricsFromUnits,
  buildCanonicalDebtMetricsFromUnits,
} from "./metrics-from-units";
import type {
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
} from "./types";

const CUTOFF = "2026-07-31";

function ctx() {
  return buildCanonicalFinancialContext({
    workspaceId: "ws-1",
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
    is_credit_note: o.is_credit_note,
    is_active: o.is_active,
    id: o.id,
  };
}

function cuota(o: Partial<CanonicalInstallmentInput> & { invoice_id: string }): CanonicalInstallmentInput {
  return {
    id: o.id,
    invoice_id: o.invoice_id,
    currency_code: "currency_code" in o ? o.currency_code : "UYU",
    cuota_saldo: o.cuota_saldo ?? 0,
    cuota_vencimiento: o.cuota_vencimiento,
    is_active: o.is_active,
  };
}

describe("buildCanonicalDebtUnits — cuotas", () => {
  it("Caso 1 — factura sin cuotas → 1 unidad de factura", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 1000, due_date: "2026-08-15" })],
      context: ctx(),
    });
    expect(units).toHaveLength(1);
    expect(units[0]?.sourceType).toBe("invoice");
    expect(units[0]?.openBalance).toBe(1000);
  });

  it("Caso 2 — 3 cuotas (pagada/al día/atrasada) → 2 unidades, aging por cuota", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 2000, due_date: "2026-06-01" })],
      installments: [
        cuota({ id: "q1", invoice_id: "i1", cuota_saldo: 0, cuota_vencimiento: "2026-06-16" }), // pagada
        cuota({ id: "q2", invoice_id: "i1", cuota_saldo: 1000, cuota_vencimiento: "2026-08-15" }), // al día
        cuota({ id: "q3", invoice_id: "i1", cuota_saldo: 1000, cuota_vencimiento: "2026-07-11" }), // 20d atraso
      ],
      context: ctx(),
    });
    expect(units).toHaveLength(2);
    expect(units.every((u) => u.sourceType === "installment")).toBe(true);
    const aging = buildCanonicalAgingMetricsFromUnits(units, "UYU", CUTOFF);
    expect(aging.current).toBe(1000);
    expect(aging.overdue15To30).toBe(1000);
    expect(aging.total).toBe(2000);
  });

  it("Caso 3 — cuotas que suman el balance → sin mismatch", () => {
    const { diagnosticCounts } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 2000, due_date: "2026-06-01" })],
      installments: [
        cuota({ id: "q1", invoice_id: "i1", cuota_saldo: 1200, cuota_vencimiento: "2026-08-15" }),
        cuota({ id: "q2", invoice_id: "i1", cuota_saldo: 800, cuota_vencimiento: "2026-08-20" }),
      ],
      context: ctx(),
    });
    expect(diagnosticCounts.installment_balance_mismatch).toBe(0);
  });

  it("Caso 4 — mismatch cuotas vs balance → diagnóstico", () => {
    const { diagnosticCounts, units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 2000, due_date: "2026-06-01" })],
      installments: [
        cuota({ id: "q1", invoice_id: "i1", cuota_saldo: 500, cuota_vencimiento: "2026-08-15" }),
      ],
      context: ctx(),
    });
    expect(diagnosticCounts.installment_balance_mismatch).toBe(1);
    // No se corrige el dato: solo se emiten las cuotas reales (no se oculta).
    expect(units.reduce((s, u) => s + u.openBalance, 0)).toBe(500);
  });

  it("Caso 5 — cuotas UYU y USD separadas", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [
        inv({ id: "iu", currency_code: "UYU", balance_amount: 1000, due_date: "2026-06-01" }),
        inv({ id: "id", currency_code: "USD", balance_amount: 300, due_date: "2026-06-01" }),
      ],
      installments: [
        cuota({ id: "qu", invoice_id: "iu", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: "2026-07-11" }),
        cuota({ id: "qd", invoice_id: "id", currency_code: "USD", cuota_saldo: 300, cuota_vencimiento: "2026-07-11" }),
      ],
      context: ctx(),
    });
    const uyu = buildCanonicalDebtMetricsFromUnits(units, "UYU", CUTOFF);
    const usd = buildCanonicalDebtMetricsFromUnits(units, "USD", CUTOFF);
    expect(uyu.pendingBalance).toBe(1000);
    expect(usd.pendingBalance).toBe(300);
  });

  it("Caso 6 — no doble conteo factura + cuotas", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 2000, due_date: "2026-06-01" })],
      installments: [
        cuota({ id: "q1", invoice_id: "i1", cuota_saldo: 1000, cuota_vencimiento: "2026-08-15" }),
        cuota({ id: "q2", invoice_id: "i1", cuota_saldo: 1000, cuota_vencimiento: "2026-08-20" }),
      ],
      context: ctx(),
    });
    const debt = buildCanonicalDebtMetricsFromUnits(units, "UYU", CUTOFF);
    expect(debt.pendingBalance).toBe(2000); // no 4000
    expect(units.every((u) => u.sourceType === "installment")).toBe(true);
  });
});

describe("buildCanonicalDebtUnits — fechas", () => {
  it("Caso 7 — vence exactamente en cutoff → al día", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 1000, due_date: CUTOFF })],
      context: ctx(),
    });
    const aging = buildCanonicalAgingMetricsFromUnits(units, "UYU", CUTOFF);
    expect(aging.current).toBe(1000);
    expect(aging.overdue1To7).toBe(0);
  });

  it("Caso 8 — venció un día antes → bucket 1–7", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 1000, due_date: "2026-07-30" })],
      context: ctx(),
    });
    const aging = buildCanonicalAgingMetricsFromUnits(units, "UYU", CUTOFF);
    expect(aging.overdue1To7).toBe(1000);
  });

  it("Caso 9 — vencimiento inválido → diagnóstico + pending sin aging", () => {
    const { units, diagnosticCounts } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 1000, due_date: "not-a-date" })],
      context: ctx(),
    });
    expect(diagnosticCounts.invalid_due_date).toBe(1);
    const debt = buildCanonicalDebtMetricsFromUnits(units, "UYU", CUTOFF);
    expect(debt.pendingBalance).toBe(1000);
    expect(debt.overdueBalance).toBe(0);
    expect(debt.balanceWithoutDueDate).toBe(1000);
  });

  it("Caso 10 — vencimiento ausente → pending sin aging", () => {
    const { units, diagnosticCounts } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: 1000, due_date: undefined })],
      context: ctx(),
    });
    expect(diagnosticCounts.missing_due_date).toBe(1);
    const aging = buildCanonicalAgingMetricsFromUnits(units, "UYU", CUTOFF);
    expect(aging.current).toBe(1000);
    expect(aging.overdue31Plus).toBe(0);
  });
});

describe("buildCanonicalDebtUnits — diagnósticos y regresión", () => {
  it("missing_currency: excluida de totales + diagnóstico", () => {
    const { units, diagnosticCounts } = buildCanonicalDebtUnits({
      invoices: [
        inv({ id: "bad", currency_code: null, balance_amount: 1000 }),
        inv({ id: "ok", currency_code: "UYU", balance_amount: 500, due_date: "2026-08-15" }),
      ],
      context: ctx(),
    });
    expect(diagnosticCounts.missing_currency).toBe(1);
    const debt = buildCanonicalDebtMetricsFromUnits(units, "UYU", CUTOFF);
    expect(debt.pendingBalance).toBe(500);
  });

  it("invoice_without_company: se incluye en saldo pero se diagnostica", () => {
    const { diagnosticCounts, units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", company_id: null, balance_amount: 1000, due_date: "2026-08-15" })],
      context: ctx(),
    });
    expect(diagnosticCounts.invoice_without_company).toBe(1);
    expect(buildCanonicalDebtMetricsFromUnits(units, "UYU", CUTOFF).pendingBalance).toBe(1000);
  });

  it("negative_open_balance: diagnóstico, sin unidad negativa", () => {
    const { diagnosticCounts, units } = buildCanonicalDebtUnits({
      invoices: [inv({ id: "i1", balance_amount: -50, due_date: "2026-08-15" })],
      context: ctx(),
    });
    expect(diagnosticCounts.negative_open_balance).toBe(1);
    expect(units).toHaveLength(0); // saldo <= 0 no genera unidad
  });

  it("regresión: pre-2026, void y pagadas excluidas; parcial solo balance abierto", () => {
    const { units } = buildCanonicalDebtUnits({
      invoices: [
        inv({ id: "old", issue_date: "2025-12-20", balance_amount: 9999, due_date: "2025-12-30" }),
        inv({ id: "void", status: "cancelled", balance_amount: 1000, due_date: "2026-08-15" }),
        inv({ id: "paid", balance_amount: 0, due_date: "2026-08-15" }),
        inv({ id: "partial", total_amount: 1000, balance_amount: 400, due_date: "2026-08-15" }),
      ],
      context: ctx(),
    });
    expect(units).toHaveLength(1);
    expect(units[0]?.invoiceId).toBe("partial");
    expect(units[0]?.openBalance).toBe(400);
  });
});
