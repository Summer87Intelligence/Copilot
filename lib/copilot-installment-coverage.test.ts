import { describe, expect, it } from "vitest";

import { buildInstallmentCoverageDiagnostics } from "./copilot-installment-coverage";

const NOW = "2026-05-15T12:00:00.000Z";

describe("buildInstallmentCoverageDiagnostics", () => {
  it("coverage y synthetic pct sobre pendientes", () => {
    const d = buildInstallmentCoverageDiagnostics({
      now: NOW,
      invoices: [
        { id: "a", company_id: "c1", balance_amount: 100, due_date_source: "zeta_cuotas_v1", due_date: "2026-06-01", status: "issued" },
        { id: "b", company_id: "c1", balance_amount: 50, due_date_source: "synthetic_30d", due_date: "2026-06-01", status: "issued" },
        { id: "c", company_id: "c2", balance_amount: 0, due_date_source: null, due_date: null, status: "paid" },
      ],
      installments: [],
    });
    expect(d.pendingInvoiceCount).toBe(2);
    expect(d.coveragePct).toBe(50);
    expect(d.syntheticPct).toBe(50);
  });

  it("orphanCount cuenta cuotas sin invoice_id", () => {
    const d = buildInstallmentCoverageDiagnostics({
      now: NOW,
      invoices: [],
      installments: [
        { invoice_id: null, currency_code: "UYU", cuota_saldo: 10, cuota_vencimiento: "2026-01-01" },
        { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 5, cuota_vencimiento: "2026-01-01" },
      ],
    });
    expect(d.orphanCount).toBe(1);
    expect(d.linkedInstallmentCount).toBe(1);
  });

  it("minDateTrapCount cuando hay vencida y futura", () => {
    const d = buildInstallmentCoverageDiagnostics({
      now: NOW,
      invoices: [
        { id: "inv-trap", company_id: "c1", balance_amount: 500, due_date_source: "zeta_cuotas_v1", due_date: "2026-09-01", status: "partial" },
      ],
      installments: [
        { invoice_id: "inv-trap", currency_code: "USD", cuota_saldo: 50, cuota_vencimiento: "2026-04-01" },
        { invoice_id: "inv-trap", currency_code: "USD", cuota_saldo: 450, cuota_vencimiento: "2026-09-01" },
      ],
    });
    expect(d.minDateTrapCount).toBe(1);
    expect(d.partialWithOverdueCount).toBe(1);
    expect(d.installmentAging.hasMixedAging).toBe(true);
  });

  it("balanceMismatchCount cuando Σ cuotas ≠ balance", () => {
    const d = buildInstallmentCoverageDiagnostics({
      now: NOW,
      invoices: [
        { id: "inv-m", company_id: "c1", balance_amount: 1000, due_date_source: "zeta_cuotas_v1", due_date: "2026-05-01", status: "issued" },
      ],
      installments: [
        { invoice_id: "inv-m", currency_code: "UYU", cuota_saldo: 400, cuota_vencimiento: "2026-05-01" },
        { invoice_id: "inv-m", currency_code: "UYU", cuota_saldo: 100, cuota_vencimiento: "2026-06-01" },
      ],
    });
    expect(d.balanceMismatchCount).toBe(1);
  });

  it("underestimatedClientCount cuando rollup due no vencido pero cuotas sí", () => {
    const d = buildInstallmentCoverageDiagnostics({
      now: NOW,
      invoices: [
        {
          id: "inv-u",
          company_id: "client-under",
          balance_amount: 500,
          due_date_source: "zeta_cuotas_v1",
          due_date: "2026-09-01",
          status: "issued",
        },
      ],
      installments: [
        { invoice_id: "inv-u", currency_code: "UYU", cuota_saldo: 80, cuota_vencimiento: "2026-04-01" },
        { invoice_id: "inv-u", currency_code: "UYU", cuota_saldo: 420, cuota_vencimiento: "2026-09-01" },
      ],
    });
    expect(d.underestimatedClientCount).toBe(1);
    expect(d.minDateTrapCount).toBe(1);
  });
});
