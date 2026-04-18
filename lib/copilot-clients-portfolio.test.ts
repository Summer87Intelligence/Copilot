import { describe, expect, it } from "vitest";

import {
  buildClientPortfolioSummary,
  clientRiskToCopilotSeverity,
  paymentBehaviorForInvoices,
  paymentBehaviorLabelEs,
  riskForCompany,
  type ClientPortfolioRow,
} from "@/lib/copilot-clients-portfolio";

const TODAY = "2025-06-15";

describe("paymentBehaviorForInvoices", () => {
  it("sin facturas devuelve medio", () => {
    expect(paymentBehaviorForInvoices([], TODAY)).toBe("medio");
  });

  it("cartera mayormente al día y pocas vencidas → bueno", () => {
    const invoices = Array.from({ length: 10 }, (_, i) => ({
      balance_amount: 0,
      status: "paid",
      due_date: "2025-01-01",
    }));
    invoices.push({
      balance_amount: 100,
      status: "issued",
      due_date: "2025-12-31",
    });
    expect(paymentBehaviorForInvoices(invoices, TODAY)).toBe("bueno");
  });

  it("muchas facturas vencidas con saldo → lento", () => {
    const invoices = Array.from({ length: 10 }, () => ({
      balance_amount: 500,
      status: "issued",
      due_date: "2025-01-01",
    }));
    expect(paymentBehaviorForInvoices(invoices, TODAY)).toBe("lento");
  });

  it("combina parciales y vencidas para superar el umbral hacia lento", () => {
    const invoices = [
      { balance_amount: 500, status: "partial", due_date: "2025-12-31" },
      { balance_amount: 500, status: "partial", due_date: "2025-12-31" },
      { balance_amount: 500, status: "partial", due_date: "2025-12-31" },
      { balance_amount: 500, status: "partial", due_date: "2025-12-31" },
      { balance_amount: 500, status: "partial", due_date: "2025-12-31" },
      { balance_amount: 500, status: "issued", due_date: "2025-01-01" },
      { balance_amount: 500, status: "issued", due_date: "2025-01-02" },
    ];
    expect(paymentBehaviorForInvoices(invoices, TODAY)).toBe("lento");
  });

  it("acepta fechas inválidas sin romper (due vacío no cuenta como vencido)", () => {
    expect(
      paymentBehaviorForInvoices(
        [{ balance_amount: 10, status: "issued", due_date: "" }],
        TODAY
      )
    ).toBe("medio");
  });
});

describe("riskForCompany", () => {
  it("sin deuda y baja participación → Bajo", () => {
    expect(riskForCompany(0.05, 0, 0)).toBe("Bajo");
  });

  it("deuda moderada o participación media → Medio", () => {
    expect(riskForCompany(0.2, 50_000, 0)).toBe("Medio");
    expect(riskForCompany(0.05, 0, 10_000)).toBe("Medio");
  });

  it("umbrales altos por concentración, monto vencido o mix deuda/vencido", () => {
    expect(riskForCompany(0.35, 50_000, 0)).toBe("Alto");
    expect(riskForCompany(0.1, 50_000, 300_000)).toBe("Alto");
    expect(riskForCompany(0.1, 150_000, 90_000)).toBe("Alto");
  });
});

describe("buildClientPortfolioSummary", () => {
  it("sin facturación describe cartera vacía", () => {
    const row: ClientPortfolioRow = {
      company_id: "c1",
      name: "ACME",
      industry: "—",
      total_billing: 0,
      total_debt: 0,
      overdue_debt: 0,
      invoices_count: 0,
      receipts_count: 0,
      share_pct: 0,
      payment_behavior: "medio",
      risk: "Bajo",
    };
    const s = buildClientPortfolioSummary([row]);
    expect(s.top_clients_line).toContain("Aún no hay facturación");
    expect(s.debt_clients_line).toContain("Ningún cliente");
    expect(s.concentration_line).toContain("diversificada");
  });

  it("detecta concentración alta por índice HHI", () => {
    const rows: ClientPortfolioRow[] = [
      {
        company_id: "a",
        name: "A",
        industry: "—",
        total_billing: 80,
        total_debt: 0,
        overdue_debt: 0,
        invoices_count: 1,
        receipts_count: 0,
        share_pct: 0.8,
        payment_behavior: "bueno",
        risk: "Alto",
      },
      {
        company_id: "b",
        name: "B",
        industry: "—",
        total_billing: 20,
        total_debt: 0,
        overdue_debt: 0,
        invoices_count: 1,
        receipts_count: 0,
        share_pct: 0.2,
        payment_behavior: "bueno",
        risk: "Medio",
      },
    ];
    const s = buildClientPortfolioSummary(rows);
    expect(s.top_clients_line).toContain("A y B");
    expect(s.concentration_line.toLowerCase()).toContain("concentración alta");
  });
});

describe("mapeos UI auxiliares", () => {
  it("clientRiskToCopilotSeverity alinea severidad", () => {
    expect(clientRiskToCopilotSeverity("Alto")).toBe("high");
    expect(clientRiskToCopilotSeverity("Medio")).toBe("medium");
    expect(clientRiskToCopilotSeverity("Bajo")).toBe("low");
  });

  it("paymentBehaviorLabelEs devuelve etiquetas en español", () => {
    expect(paymentBehaviorLabelEs("bueno")).toBe("Bueno");
    expect(paymentBehaviorLabelEs("lento")).toBe("Lento");
    expect(paymentBehaviorLabelEs("medio")).toBe("Medio");
  });
});
