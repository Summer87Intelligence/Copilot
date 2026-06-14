import { describe, expect, it } from "vitest";

import {
  CLIENT_DEBT_STATUS_LABEL,
  deriveClientDebtStatus,
  derivePortfolioDebtStatus,
  type OpenInvoiceForStatus,
} from "@/lib/copilot-client-debt-status";

const TODAY = "2026-06-14";

function invoice(
  overrides: Partial<OpenInvoiceForStatus> = {}
): OpenInvoiceForStatus {
  return {
    id: "inv-1",
    issueDate: "2026-06-14",
    balanceAmount: 1000,
    currencyCode: "UYU",
    ...overrides,
  };
}

describe("deriveClientDebtStatus", () => {
  it("1. sin deuda → Al día", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0,
      debtUsd: 0,
      openInvoices: [],
      today: TODAY,
    });
    expect(r.status).toBe("current");
    expect(r.label).toBe(CLIENT_DEBT_STATUS_LABEL.current);
    expect(r.label).toBe("Al día");
    expect(r.openInvoicesCount).toBe(0);
    expect(r.maxDaysSinceIssue).toBe(0);
    expect(r.oldestOpenInvoiceIssueDate).toBeNull();
    expect(r.reason).toMatch(/sin deuda/i);
  });

  it("2. deuda UYU emitida hoy → Con deuda, 0 días", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 30000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: TODAY, balanceAmount: 30000 })],
      today: TODAY,
    });
    expect(r.status).toBe("with_debt");
    expect(r.label).toBe("Con deuda");
    expect(r.maxDaysSinceIssue).toBe(0);
    expect(r.oldestOpenInvoiceIssueDate).toBe(TODAY);
    expect(r.totalDebtByCurrency).toEqual({ UYU: 30000, USD: 0 });
  });

  it("3. deuda USD emitida ayer → Con deuda, 1 día", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0,
      debtUsd: 500,
      openInvoices: [
        invoice({ issueDate: "2026-06-13", balanceAmount: 500, currencyCode: "USD" }),
      ],
      today: TODAY,
    });
    expect(r.status).toBe("with_debt");
    expect(r.maxDaysSinceIssue).toBe(1);
    expect(r.oldestOpenInvoiceIssueDate).toBe("2026-06-13");
  });

  it("4. deuda con 30 días → Con deuda (frontera inferior)", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 1000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "2026-05-15", balanceAmount: 1000 })],
      today: TODAY,
    });
    expect(r.maxDaysSinceIssue).toBe(30);
    expect(r.status).toBe("with_debt");
  });

  it("5. deuda con 31 días → Atrasado", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 1000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "2026-05-14", balanceAmount: 1000 })],
      today: TODAY,
    });
    expect(r.maxDaysSinceIssue).toBe(31);
    expect(r.status).toBe("delayed");
    expect(r.label).toBe("Atrasado");
  });

  it("6. deuda con 90 días → Atrasado (frontera superior)", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 1000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "2026-03-16", balanceAmount: 1000 })],
      today: TODAY,
    });
    expect(r.maxDaysSinceIssue).toBe(90);
    expect(r.status).toBe("delayed");
  });

  it("7. deuda con 91 días → Crítico", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 1000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "2026-03-15", balanceAmount: 1000 })],
      today: TODAY,
    });
    expect(r.maxDaysSinceIssue).toBe(91);
    expect(r.status).toBe("critical");
    expect(r.label).toBe("Crítico");
  });

  it("8. deuda USD aunque UYU = 0 → NO Al día", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0,
      debtUsd: 1200,
      openInvoices: [
        invoice({ issueDate: "2026-06-10", balanceAmount: 1200, currencyCode: "USD" }),
      ],
      today: TODAY,
    });
    expect(r.status).not.toBe("current");
    expect(r.status).toBe("with_debt");
    expect(r.totalDebtByCurrency).toEqual({ UYU: 0, USD: 1200 });
  });

  it("9. factura con balance 0 no cuenta como deuda abierta", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "2026-01-01", balanceAmount: 0 })],
      today: TODAY,
    });
    expect(r.status).toBe("current");
    expect(r.openInvoicesCount).toBe(0);
  });

  it("10. varias facturas: usa la más antigua impaga para max días y oldest", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 8000,
      debtUsd: 0,
      openInvoices: [
        invoice({ id: "new", issueDate: "2026-06-10", balanceAmount: 5000 }),
        invoice({ id: "old", issueDate: "2026-03-01", balanceAmount: 3000 }),
      ],
      today: TODAY,
    });
    expect(r.maxDaysSinceIssue).toBe(105);
    expect(r.oldestOpenInvoiceIssueDate).toBe("2026-03-01");
    expect(r.status).toBe("critical");
    expect(r.openInvoicesCount).toBe(2);
  });

  it("11. deuda sin issueDate parseable → Con deuda, no Al día", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 4000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "", balanceAmount: 4000 })],
      today: TODAY,
    });
    expect(r.status).toBe("with_debt");
    expect(r.maxDaysSinceIssue).toBe(0);
    expect(r.oldestOpenInvoiceIssueDate).toBeNull();
    expect(r.reason).toMatch(/sin fecha/i);
    expect(r.openInvoicesCount).toBe(1);
  });

  it("12. deuda por totales pero openInvoices vacío → Con deuda", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 2000,
      debtUsd: 0,
      openInvoices: [],
      today: TODAY,
    });
    expect(r.status).toBe("with_debt");
    expect(r.reason).toMatch(/sin facturas/i);
    expect(r.openInvoicesCount).toBe(0);
  });

  it("13. monto negativo no genera deuda (totales ni facturas)", () => {
    const r = deriveClientDebtStatus({
      debtUyu: -500,
      debtUsd: -10,
      openInvoices: [invoice({ issueDate: "2026-01-01", balanceAmount: -100 })],
      today: TODAY,
    });
    expect(r.status).toBe("current");
    expect(r.openInvoicesCount).toBe(0);
    expect(r.totalDebtByCurrency).toEqual({ UYU: 0, USD: 0 });
  });

  it("14. NaN no genera deuda", () => {
    const r = deriveClientDebtStatus({
      debtUyu: Number.NaN,
      debtUsd: Number.NaN,
      openInvoices: [invoice({ balanceAmount: Number.NaN })],
      today: TODAY,
    });
    expect(r.status).toBe("current");
    expect(r.openInvoicesCount).toBe(0);
  });

  it("15. epsilon ≤ 0.005 no genera deuda", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0.004,
      debtUsd: 0.005,
      openInvoices: [invoice({ balanceAmount: 0.003 })],
      today: TODAY,
    });
    expect(r.status).toBe("current");
    expect(r.openInvoicesCount).toBe(0);
    expect(r.totalDebtByCurrency).toEqual({ UYU: 0, USD: 0 });
  });

  it("16. fecha de emisión futura por error → 0 días, Con deuda", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 2000,
      debtUsd: 0,
      openInvoices: [invoice({ issueDate: "2026-07-01", balanceAmount: 2000 })],
      today: TODAY,
    });
    expect(r.maxDaysSinceIssue).toBe(0);
    expect(r.status).toBe("with_debt");
    expect(r.oldestOpenInvoiceIssueDate).toBe("2026-07-01");
  });

  it("default today: usa UTC sin lanzar cuando no se pasa today", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0,
      debtUsd: 0,
      openInvoices: [],
    });
    expect(r.status).toBe("current");
  });

  it("today inválido cae al default UTC", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 0,
      debtUsd: 0,
      openInvoices: [],
      today: "bad-date",
    });
    expect(r.status).toBe("current");
  });

  it("totalDebtByCurrency refleja los montos normalizados", () => {
    const r = deriveClientDebtStatus({
      debtUyu: 1500.25,
      debtUsd: 0,
      openInvoices: [invoice({ balanceAmount: 1500.25 })],
      today: TODAY,
    });
    expect(r.totalDebtByCurrency).toEqual({ UYU: 1500.25, USD: 0 });
    expect(r.openInvoicesCount).toBe(1);
  });
});

describe("derivePortfolioDebtStatus — adaptador para ClientPortfolioRow", () => {
  it("row sin deuda → current", () => {
    const r = derivePortfolioDebtStatus(
      {
        debt_uyu: 0,
        debt_usd: 0,
        oldest_open_invoice_issue_date: null,
        open_invoices_count: 0,
      },
      { today: TODAY }
    );
    expect(r.status).toBe("current");
  });

  it("row con deuda 0–30d → with_debt", () => {
    const r = derivePortfolioDebtStatus(
      {
        debt_uyu: 5000,
        debt_usd: 0,
        oldest_open_invoice_issue_date: "2026-06-01", // 13 días antes de TODAY
        open_invoices_count: 1,
      },
      { today: TODAY }
    );
    expect(r.status).toBe("with_debt");
    expect(r.maxDaysSinceIssue).toBe(13);
  });

  it("row con deuda 31–90d → delayed", () => {
    const r = derivePortfolioDebtStatus(
      {
        debt_uyu: 5000,
        debt_usd: 0,
        oldest_open_invoice_issue_date: "2026-05-01", // 44 días
        open_invoices_count: 2,
      },
      { today: TODAY }
    );
    expect(r.status).toBe("delayed");
    expect(r.label).toBe("Atrasado");
  });

  it("row con deuda > 90d → critical", () => {
    const r = derivePortfolioDebtStatus(
      {
        debt_uyu: 0,
        debt_usd: 100,
        oldest_open_invoice_issue_date: "2026-02-01", // 133 días
        open_invoices_count: 3,
      },
      { today: TODAY }
    );
    expect(r.status).toBe("critical");
    expect(r.label).toBe("Crítico");
  });

  it("row con deuda USD aunque UYU=0 → NO current", () => {
    const r = derivePortfolioDebtStatus(
      {
        debt_uyu: 0,
        debt_usd: 1200,
        oldest_open_invoice_issue_date: "2026-06-13",
        open_invoices_count: 1,
      },
      { today: TODAY }
    );
    expect(r.status).not.toBe("current");
    expect(r.status).toBe("with_debt");
  });

  it("row con deuda pero sin fecha de emisión derivada → with_debt", () => {
    const r = derivePortfolioDebtStatus(
      {
        debt_uyu: 2000,
        debt_usd: 0,
        oldest_open_invoice_issue_date: null,
        open_invoices_count: 1,
      },
      { today: TODAY }
    );
    expect(r.status).toBe("with_debt");
    expect(r.reason).toMatch(/sin fecha/i);
  });

  it("row con campos undefined cae a 0 sin lanzar", () => {
    const r = derivePortfolioDebtStatus({}, { today: TODAY });
    expect(r.status).toBe("current");
  });
});
