import { describe, expect, it } from "vitest";

import type { ClientPortfolioInvoice } from "@/lib/copilot-clients-portfolio";
import { buildDebtBreakdown, fmtDateShort } from "@/lib/hoy-debt-breakdown";

const TODAY = "2026-06-08";

function inv(
  opts: Pick<ClientPortfolioInvoice, "id"> & Partial<ClientPortfolioInvoice>
): ClientPortfolioInvoice {
  return {
    id: opts.id,
    invoice_number: opts.invoice_number ?? `FAC-${opts.id}`,
    issue_date: opts.issue_date ?? "2026-06-01",
    due_date: opts.due_date ?? "2026-07-01",
    total_amount: opts.total_amount ?? 1000,
    balance_amount: opts.balance_amount ?? opts.total_amount ?? 1000,
    status: opts.status ?? "pending",
    currency_code: opts.currency_code ?? "UYU",
    category: opts.category ?? null,
  };
}

// FASE 1B: status a nivel factura mide DÍAS DE ATRASO (due_date).
//  al día → "Con deuda" · 1–30 días de atraso → "Atrasada" · +30 → "Crítica"
describe("buildDebtBreakdown — semántica por días de atraso (due_date)", () => {
  it("2 facturas atrasadas + 1 al día: suma y orden correctos", () => {
    const invoices = [
      // vence 2025-12-22 → +30 días de atraso → Crítica
      inv({ id: "1", due_date: "2025-12-22", balance_amount: 5000, total_amount: 5000 }),
      // vence 2026-05-20 → 19 días de atraso → Atrasada
      inv({ id: "2", due_date: "2026-05-20", balance_amount: 3000, total_amount: 3000 }),
      // vence 2026-07-01 → futuro → Con deuda (al día)
      inv({ id: "3", due_date: "2026-07-01", balance_amount: 2000, total_amount: 2000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 10000, 8000);

    expect(result.summary.invoiceCount).toBe(3);
    expect(result.summary.overdueCount).toBe(2);
    expect(result.summary.totalPending).toBe(10000);
    expect(result.summary.totalOverdue).toBe(8000);
    expect(result.summary.totalCurrent).toBe(2000);

    expect(result.items[0]!.status).toBe("Crítica");
    expect(result.items[1]!.status).toBe("Atrasada");
    expect(result.items[2]!.status).toBe("Con deuda");
  });

  it("cliente con facturas al día (vencen en el futuro): overdueCount=0", () => {
    const invoices = [
      inv({ id: "1", due_date: "2026-07-01", balance_amount: 4000, total_amount: 4000 }),
      inv({ id: "2", due_date: "2026-06-30", balance_amount: 1000, total_amount: 1000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 5000, null);

    expect(result.summary.overdueCount).toBe(0);
    expect(result.summary.totalOverdue).toBe(0);
    expect(result.summary.totalCurrent).toBe(5000);
    expect(result.items.every((i) => i.status === "Con deuda")).toBe(true);
  });

  it("vence exactamente hoy → al día (no atrasada)", () => {
    const invoices = [
      inv({ id: "1", due_date: TODAY, balance_amount: 1000, total_amount: 1000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 1000, null);
    expect(result.items[0]!.status).toBe("Con deuda");
    expect(result.items[0]!.daysOverdue).toBeNull();
  });

  it("factura parcial al día muestra status Parcial", () => {
    const invoices = [
      inv({ id: "1", due_date: "2026-07-01", balance_amount: 300, total_amount: 1000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 300, null);

    expect(result.items[0]!.status).toBe("Parcial");
    expect(result.items[0]!.pendingAmount).toBe(300);
    expect(result.items[0]!.originalAmount).toBe(1000);
  });

  it("factura parcial con +30 días de atraso → Crítica (severidad gana sobre Parcial)", () => {
    const invoices = [
      inv({ id: "1", due_date: "2026-04-09", balance_amount: 300, total_amount: 1000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 300, 300);

    expect(result.items[0]!.status).toBe("Crítica");
    expect(result.items[0]!.overdueAmount).toBe(300);
    expect(result.items[0]!.daysOverdue).toBe(60);
  });

  it("moneda USD no se mezcla con UYU", () => {
    const invoices = [
      inv({ id: "uyu1", currency_code: "UYU", balance_amount: 5000, total_amount: 5000 }),
      inv({ id: "usd1", currency_code: "USD", balance_amount: 200, total_amount: 200 }),
      inv({ id: "usd2", currency_code: "USD", balance_amount: 100, total_amount: 100 }),
    ];

    const usdResult = buildDebtBreakdown(invoices, "USD", TODAY, 300, null);
    expect(usdResult.summary.invoiceCount).toBe(2);
    expect(usdResult.items.every((i) => i.currency === "USD")).toBe(true);
    expect(usdResult.summary.totalPending).toBe(300);

    const uyuResult = buildDebtBreakdown(invoices, "UYU", TODAY, 5000, null);
    expect(uyuResult.summary.invoiceCount).toBe(1);
    expect(uyuResult.items[0]!.currency).toBe("UYU");
  });

  it("el breakdown no duplica shadow Zeta / saldos pendientes", () => {
    const invoices = [
      inv({ id: "real-1", invoice_number: "FAC-001", balance_amount: 5000, total_amount: 5000 }),
      inv({
        id: "shadow-1",
        invoice_number: "ZETA:12345",
        balance_amount: 5000,
        total_amount: 5000,
        category: "Zeta / saldos pendientes",
      }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 5000, null);

    expect(result.summary.invoiceCount).toBe(1);
    expect(result.items[0]!.documentNumber).toBe("FAC-001");
    expect(result.hasReconciliationGap).toBe(false);
  });

  it("factura sin due_date parseable → pendiente pero NO atrasada ('Con deuda')", () => {
    const invoices = [
      inv({ id: "1", due_date: "—", balance_amount: 3000, total_amount: 3000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 3000, null);

    expect(result.items[0]!.status).toBe("Con deuda");
    expect(result.items[0]!.daysOverdue).toBeNull();
    expect(result.summary.totalOverdue).toBe(0);
  });

  it("facturas con balance 0 se excluyen del breakdown", () => {
    const invoices = [
      inv({ id: "paid", balance_amount: 0, total_amount: 500 }),
      inv({ id: "active", balance_amount: 800, total_amount: 1000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 800, null);

    expect(result.summary.invoiceCount).toBe(1);
    expect(result.items[0]!.invoiceId).toBe("active");
  });

  it("detecta gap de conciliación cuando sumas no coinciden", () => {
    const invoices = [
      inv({ id: "1", balance_amount: 3000, total_amount: 3000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 5000, null);

    expect(result.hasReconciliationGap).toBe(true);
    expect(result.reconciliationGap).toBeCloseTo(2000);
  });

  it("ordena: severidad > más días de atraso > mayor saldo", () => {
    const invoices = [
      // al día → Con deuda
      inv({ id: "curr", due_date: "2026-07-01", balance_amount: 9000, total_amount: 9000 }),
      // 19 días de atraso → Atrasada
      inv({ id: "late2", due_date: "2026-05-20", balance_amount: 1000, total_amount: 1000 }),
      // +30 días de atraso → Crítica
      inv({ id: "crit", due_date: "2026-03-01", balance_amount: 2000, total_amount: 2000 }),
    ];
    const result = buildDebtBreakdown(invoices, "UYU", TODAY, 12000, 3000);

    expect(result.items[0]!.invoiceId).toBe("crit"); // Crítica primero
    expect(result.items[1]!.invoiceId).toBe("late2"); // Atrasada
    expect(result.items[2]!.invoiceId).toBe("curr");  // Con deuda último
  });
});

describe("fmtDateShort", () => {
  it("formatea YYYY-MM-DD como DD/MM/YY", () => {
    expect(fmtDateShort("2026-04-15")).toMatch(/^15\/04\/2026$/);
  });

  it("devuelve — para valores vacíos", () => {
    expect(fmtDateShort("—")).toBe("—");
    expect(fmtDateShort("")).toBe("—");
  });
});
