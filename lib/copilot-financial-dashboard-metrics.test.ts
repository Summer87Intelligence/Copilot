import { describe, expect, it } from "vitest";

import { buildFinancialDashboardMetrics } from "./copilot-financial-dashboard-metrics";
import type { DataRow } from "./copilot-data";

function company(id: string, name: string): DataRow {
  return { id, name };
}

function invoice(opts: {
  id: string;
  companyId: string;
  total: number;
  balance?: number | null;
  currency?: "USD" | "UYU" | null;
  issueDate?: string;
  status?: string;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    company_id: opts.companyId,
    invoice_number: `INV-${opts.id}`,
    issue_date: opts.issueDate ?? "2026-05-01",
    total_amount: opts.total,
    balance_amount: opts.balance ?? 0,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    status: opts.status ?? "issued",
    is_active: opts.active ?? true,
  };
}

describe("buildFinancialDashboardMetrics", () => {
  it("calcula métricas base multi-moneda usando balance_amount", () => {
    const out = buildFinancialDashboardMetrics({
      today: "2026-05-31",
      companies: [
        company("c1", "Alpha S.A."),
        company("c2", "Beta S.R.L."),
        company("c3", "Gamma Ltda."),
        company("c4", "Delta S.A.S."),
      ],
      invoices: [
        invoice({ id: "u1", companyId: "c1", total: 100, balance: 0, currency: "USD" }),
        invoice({
          id: "u2",
          companyId: "c1",
          total: 1000,
          balance: 400,
          currency: "USD",
        }),
        invoice({ id: "u3", companyId: "c2", total: 300, balance: 300, currency: "USD" }),
        invoice({ id: "u4", companyId: "c3", total: 200, balance: 200, currency: "USD" }),
        invoice({ id: "p1", companyId: "c4", total: 500, balance: 0, currency: "UYU" }),
        invoice({ id: "p2", companyId: "c4", total: 1000, balance: 1000, currency: "UYU" }),
      ],
    });

    expect(out.currencies.map((c) => c.currencyCode)).toEqual(["USD", "UYU"]);

    const usd = out.currencies.find((c) => c.currencyCode === "USD");
    expect(usd).toMatchObject({
      totalInvoiced: 1600,
      totalPending: 900,
      totalCollected: 700,
      invoiceCount: 4,
      paidInvoiceCount: 1,
      partialInvoiceCount: 1,
      pendingInvoiceCount: 2,
      debtorClientsCount: 3,
      collectionEffectiveness: 43.75,
    });

    const uyu = out.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu).toMatchObject({
      totalInvoiced: 1500,
      totalPending: 1000,
      totalCollected: 500,
      invoiceCount: 2,
      paidInvoiceCount: 1,
      partialInvoiceCount: 0,
      pendingInvoiceCount: 1,
      debtorClientsCount: 1,
      collectionEffectiveness: 33.33,
    });
  });

  it("arma aging por issue_date sólo con balance pendiente", () => {
    const out = buildFinancialDashboardMetrics({
      today: "2026-05-31",
      invoices: [
        invoice({
          id: "a1",
          companyId: "c1",
          total: 100,
          balance: 100,
          currency: "USD",
          issueDate: "2026-05-10",
        }),
        invoice({
          id: "a2",
          companyId: "c1",
          total: 200,
          balance: 200,
          currency: "USD",
          issueDate: "2026-04-15",
        }),
        invoice({
          id: "a3",
          companyId: "c2",
          total: 300,
          balance: 300,
          currency: "USD",
          issueDate: "2026-03-15",
        }),
        invoice({
          id: "a4",
          companyId: "c3",
          total: 400,
          balance: 400,
          currency: "USD",
          issueDate: "2026-01-01",
        }),
        invoice({
          id: "paid",
          companyId: "c4",
          total: 999,
          balance: 0,
          currency: "USD",
          issueDate: "2026-01-01",
        }),
      ],
    });

    const usd = out.currencies[0];
    expect(usd.aging).toEqual([
      { label: "0-30", amount: 100, invoiceCount: 1 },
      { label: "31-60", amount: 200, invoiceCount: 1 },
      { label: "61-90", amount: 300, invoiceCount: 1 },
      { label: "90+", amount: 400, invoiceCount: 1 },
    ]);
  });

  it("top deudores ordena DESC por SUM(balance_amount) y limita a 5 por moneda", () => {
    const out = buildFinancialDashboardMetrics({
      today: "2026-05-31",
      companies: [
        company("c1", "Alpha"),
        company("c2", "Beta"),
        company("c3", "Gamma"),
        company("c4", "Delta"),
        company("c5", "Epsilon"),
        company("c6", "Zeta"),
      ],
      invoices: [
        invoice({ id: "i1", companyId: "c1", total: 100, balance: 100, currency: "USD" }),
        invoice({ id: "i2", companyId: "c2", total: 600, balance: 600, currency: "USD" }),
        invoice({ id: "i3", companyId: "c3", total: 300, balance: 300, currency: "USD" }),
        invoice({ id: "i4", companyId: "c4", total: 500, balance: 500, currency: "USD" }),
        invoice({ id: "i5", companyId: "c5", total: 200, balance: 200, currency: "USD" }),
        invoice({ id: "i6", companyId: "c6", total: 400, balance: 400, currency: "USD" }),
      ],
    });

    const usd = out.currencies[0];
    expect(usd.topDebtors.map((d) => [d.companyName, d.pendingAmount])).toEqual([
      ["Beta", 600],
      ["Delta", 500],
      ["Zeta", 400],
      ["Gamma", 300],
      ["Epsilon", 200],
    ]);
    expect(usd.debtorClientsCount).toBe(6);
  });

  it("excluye anuladas, canceladas, moneda desconocida y totales corruptos", () => {
    const out = buildFinancialDashboardMetrics({
      today: "2026-05-31",
      invoices: [
        invoice({ id: "ok", companyId: "c1", total: 100, balance: 100, currency: "USD" }),
        invoice({
          id: "void",
          companyId: "c1",
          total: 900,
          balance: 900,
          currency: "USD",
          status: "voided",
        }),
        invoice({
          id: "cancel",
          companyId: "c1",
          total: 800,
          balance: 800,
          currency: "USD",
          status: "Cancelled",
        }),
        invoice({ id: "unknown", companyId: "c1", total: 700, balance: 700, currency: null }),
        invoice({ id: "zero", companyId: "c1", total: 0, balance: 0, currency: "USD" }),
        invoice({ id: "negative", companyId: "c1", total: -10, balance: 0, currency: "USD" }),
      ],
    });

    expect(out.currencies).toHaveLength(1);
    expect(out.currencies[0]).toMatchObject({
      totalInvoiced: 100,
      totalPending: 100,
      invoiceCount: 1,
      pendingInvoiceCount: 1,
    });
  });

  it("incluye archivadas históricas válidas", () => {
    const out = buildFinancialDashboardMetrics({
      today: "2026-05-31",
      invoices: [
        invoice({
          id: "archived",
          companyId: "c1",
          total: 366,
          balance: 0,
          currency: "USD",
          active: false,
        }),
        invoice({
          id: "archived-pending",
          companyId: "c1",
          total: 1000,
          balance: 250,
          currency: "USD",
          active: false,
        }),
      ],
    });

    const usd = out.currencies[0];
    expect(usd.invoiceCount).toBe(2);
    expect(usd.totalInvoiced).toBe(1366);
    expect(usd.totalPending).toBe(250);
    expect(usd.paidInvoiceCount).toBe(1);
    expect(usd.partialInvoiceCount).toBe(1);
  });

  it("collectionEffectiveness queda en 0 si no hay facturas válidas", () => {
    const out = buildFinancialDashboardMetrics({
      today: "2026-05-31",
      invoices: [invoice({ id: "bad", companyId: "c1", total: 0, balance: 0, currency: "USD" })],
    });
    expect(out.currencies).toEqual([]);
  });

  it("no muta inputs", () => {
    const inv = invoice({ id: "i1", companyId: "c1", total: 100, balance: 25, currency: "UYU" });
    const comp = company("c1", "Cliente");
    const beforeInv = JSON.stringify(inv);
    const beforeComp = JSON.stringify(comp);
    buildFinancialDashboardMetrics({ invoices: [inv], companies: [comp], today: "2026-05-31" });
    expect(JSON.stringify(inv)).toBe(beforeInv);
    expect(JSON.stringify(comp)).toBe(beforeComp);
  });
});
