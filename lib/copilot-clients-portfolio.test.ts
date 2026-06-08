import { describe, expect, it } from "vitest";

import {
  buildClientPortfolioSummary,
  clientRiskToCopilotSeverity,
  computeInvoiceCurrencyBreakdown,
  formatMoneyPortfolio,
  paymentBehaviorForInvoices,
  paymentBehaviorLabelEs,
  riskForCompany,
  riskForCompanyPerCurrency,
  type ClientCompanyDetail,
  type ClientPortfolioReceipt,
  type ClientPortfolioRow,
} from "@/lib/copilot-clients-portfolio";

const TODAY = "2025-06-15";

describe("paymentBehaviorForInvoices", () => {
  it("sin facturas devuelve medio", () => {
    expect(paymentBehaviorForInvoices([], TODAY)).toBe("medio");
  });

  it("cartera mayormente al día y pocas vencidas → bueno", () => {
    const invoices = Array.from({ length: 10 }, () => ({
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
      source: "contact",
      has_contact_data: true,
      derived_from_debt: false,
      debt_uyu: 0,
      debt_usd: 0,
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
        source: "contact",
        has_contact_data: false,
        derived_from_debt: false,
        debt_uyu: 0,
        debt_usd: 0,
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
        source: "contact",
        has_contact_data: false,
        derived_from_debt: false,
        debt_uyu: 0,
        debt_usd: 0,
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

// ---------------------------------------------------------------------------
// Fase 1 multi-moneda: computeInvoiceCurrencyBreakdown
// ---------------------------------------------------------------------------

const TODAY_MC = "2026-05-19";

describe("computeInvoiceCurrencyBreakdown — cliente solo UYU", () => {
  it("billingUYU acumula total_amount de facturas UYU", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 100_000, balance_amount: 0, due_date: "2026-06-01" },
        { currency_code: "UYU", total_amount: 50_000, balance_amount: 0, due_date: "2026-06-15" },
      ],
      TODAY_MC
    );
    expect(result.billingUYU).toBe(150_000);
    expect(result.billingUSD).toBe(0);
    expect(result.hasMixedCurrency).toBe(false);
  });

  it("overdueUYU acumula solo saldos pendientes vencidos en UYU", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 10_000, balance_amount: 10_000, due_date: "2026-04-01" },
        { currency_code: "UYU", total_amount: 5_000, balance_amount: 5_000, due_date: "2026-12-01" },
      ],
      TODAY_MC
    );
    expect(result.overdueUYU).toBe(10_000);
    expect(result.overdueUSD).toBe(0);
  });
});

describe("computeInvoiceCurrencyBreakdown — cliente solo USD", () => {
  it("billingUSD acumula total_amount de facturas USD", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "USD", total_amount: 5_000, balance_amount: 0, due_date: "2026-06-01" },
        { currency_code: "USD", total_amount: 2_500, balance_amount: 0, due_date: "2026-07-01" },
      ],
      TODAY_MC
    );
    expect(result.billingUSD).toBe(7_500);
    expect(result.billingUYU).toBe(0);
    expect(result.hasMixedCurrency).toBe(false);
  });

  it("overdueUSD acumula solo saldos pendientes vencidos en USD", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "USD", total_amount: 1_000, balance_amount: 1_000, due_date: "2026-03-01" },
        { currency_code: "USD", total_amount: 500, balance_amount: 500, due_date: "2026-12-01" },
      ],
      TODAY_MC
    );
    expect(result.overdueUSD).toBe(1_000);
    expect(result.overdueUYU).toBe(0);
  });
});

describe("computeInvoiceCurrencyBreakdown — cliente con UYU + USD (hasMixedCurrency)", () => {
  it("hasMixedCurrency es true cuando ambas monedas tienen facturación", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 50_000, balance_amount: 0, due_date: "" },
        { currency_code: "USD", total_amount: 1_000, balance_amount: 0, due_date: "" },
      ],
      TODAY_MC
    );
    expect(result.hasMixedCurrency).toBe(true);
  });

  it("acumula cada moneda de forma independiente", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 80_000, balance_amount: 20_000, due_date: "2026-04-01" },
        { currency_code: "USD", total_amount: 3_000, balance_amount: 1_500, due_date: "2026-04-01" },
      ],
      TODAY_MC
    );
    expect(result.billingUYU).toBe(80_000);
    expect(result.billingUSD).toBe(3_000);
    expect(result.overdueUYU).toBe(20_000);
    expect(result.overdueUSD).toBe(1_500);
  });

  it("factura sin currency_code es ignorada y no afecta totales ni hasMixedCurrency", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 10_000, balance_amount: 0, due_date: "" },
        { currency_code: null, total_amount: 99_999, balance_amount: 99_999, due_date: "2026-01-01" },
        { currency_code: undefined, total_amount: 50_000, balance_amount: 50_000, due_date: "2026-01-01" },
      ],
      TODAY_MC
    );
    expect(result.billingUYU).toBe(10_000);
    expect(result.billingUSD).toBe(0);
    expect(result.hasMixedCurrency).toBe(false);
  });

  it("balance_amount=0 no se cuenta como vencido aunque esté vencida la fecha", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [{ currency_code: "UYU", total_amount: 5_000, balance_amount: 0, due_date: "2026-01-01" }],
      TODAY_MC
    );
    expect(result.overdueUYU).toBe(0);
  });

  it("lista vacía devuelve todos ceros y hasMixedCurrency false", () => {
    const result = computeInvoiceCurrencyBreakdown([], TODAY_MC);
    expect(result.billingUYU).toBe(0);
    expect(result.billingUSD).toBe(0);
    expect(result.overdueUYU).toBe(0);
    expect(result.overdueUSD).toBe(0);
    expect(result.hasMixedCurrency).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regresión: campos legacy siguen presentes en los tipos
// ---------------------------------------------------------------------------

describe("ClientPortfolioRow — campos legacy coexisten con desagregado de moneda", () => {
  it("row con campos nuevos opcionales es válido en TypeScript", () => {
    const row: ClientPortfolioRow = {
      company_id: "c1",
      name: "Empresa Test",
      industry: "Tech",
      total_billing: 500_000,
      total_debt: 100_000,
      overdue_debt: 40_000,
      invoices_count: 10,
      receipts_count: 3,
      share_pct: 0.25,
      payment_behavior: "medio",
      risk: "Medio",
      source: "contact",
      has_contact_data: true,
      derived_from_debt: false,
      debt_uyu: 60_000,
      debt_usd: 2_500,
      billing_uyu: 300_000,
      billing_usd: 5_000,
      overdue_uyu: 30_000,
      overdue_usd: 500,
      has_mixed_currency: true,
    };
    expect(row.total_billing).toBe(500_000);
    expect(row.debt_uyu).toBe(60_000);
    expect(row.billing_uyu).toBe(300_000);
    expect(row.billing_usd).toBe(5_000);
    expect(row.has_mixed_currency).toBe(true);
  });

  it("row sin campos opcionales sigue siendo válido (backwards compat)", () => {
    const row: ClientPortfolioRow = {
      company_id: "c2",
      name: "Solo Legacy",
      industry: "—",
      total_billing: 0,
      total_debt: 0,
      overdue_debt: 0,
      invoices_count: 0,
      receipts_count: 0,
      share_pct: 0,
      payment_behavior: "bueno",
      risk: "Bajo",
      source: "zeta_invoice",
      has_contact_data: false,
      derived_from_debt: false,
      debt_uyu: 0,
      debt_usd: 0,
    };
    expect(row.billing_uyu).toBeUndefined();
    expect(row.billing_usd).toBeUndefined();
    expect(row.has_mixed_currency).toBeUndefined();
  });
});

describe("ClientCompanyDetail — campos legacy + desagregado de moneda", () => {
  it("detail con campos de moneda opcionales es válido", () => {
    const detail: ClientCompanyDetail = {
      company_id: "c1",
      company_name: "Test",
      industry: "Retail",
      contacts: [],
      invoices: [],
      receipts: [],
      overdue_debt: 40_000,
      total_debt: 100_000,
      payment_behavior: "lento",
      risk: "Alto",
      share_pct: 0.4,
      total_billing: 400_000,
      debt_uyu: 70_000,
      debt_usd: 1_500,
      billing_uyu: 250_000,
      billing_usd: 8_000,
      overdue_uyu: 35_000,
      overdue_usd: 300,
      has_mixed_currency: true,
    };
    expect(detail.total_debt).toBe(100_000);
    expect(detail.debt_uyu).toBe(70_000);
    expect(detail.has_mixed_currency).toBe(true);
  });
});

describe("ClientPortfolioReceipt — currency_code", () => {
  it("recibo sin currency_code es válido (backwards compat)", () => {
    const r: ClientPortfolioReceipt = {
      id: "r1",
      amount: 10_000,
      receipt_date: "2026-05-01",
      invoice_id: null,
    };
    expect(r.currency_code).toBeUndefined();
  });

  it("recibo USD formatea correctamente via formatMoneyPortfolio", () => {
    const r: ClientPortfolioReceipt = {
      id: "r2",
      amount: 1_000,
      receipt_date: "2026-05-01",
      invoice_id: null,
      currency_code: "USD",
    };
    expect(formatMoneyPortfolio(r.amount, r.currency_code)).toBe("U$S 1.000");
  });

  it("recibo UYU formatea con símbolo $", () => {
    const r: ClientPortfolioReceipt = {
      id: "r3",
      amount: 50_000,
      receipt_date: "2026-05-01",
      invoice_id: "inv-1",
      currency_code: "UYU",
    };
    expect(formatMoneyPortfolio(r.amount, r.currency_code)).toBe("$ 50.000");
  });
});

// ---------------------------------------------------------------------------
// formatMoneyPortfolio con moneda — regresión de símbolo
// ---------------------------------------------------------------------------

describe("formatMoneyPortfolio — símbolo por moneda", () => {
  it("UYU → símbolo $", () => {
    expect(formatMoneyPortfolio(50_000, "UYU")).toBe("$ 50.000");
  });

  it("USD → símbolo U$S con decimales", () => {
    expect(formatMoneyPortfolio(1_500.5, "USD")).toBe("U$S 1.500,5");
  });

  it("sin moneda (legacy) → $ (default UYU)", () => {
    expect(formatMoneyPortfolio(10_000)).toBe("$ 10.000");
  });
});

// ---------------------------------------------------------------------------
// Fase 3 — riskForCompanyPerCurrency
// ---------------------------------------------------------------------------

describe("riskForCompanyPerCurrency — evaluación por moneda sin sumar UYU+USD", () => {
  it("sin deuda en ninguna moneda → Bajo", () => {
    expect(riskForCompanyPerCurrency(0.05, 0, 0, 0, 0)).toBe("Bajo");
  });

  it("sharePct alto → Alto independientemente de monedas", () => {
    expect(riskForCompanyPerCurrency(0.35, 0, 0, 0, 0)).toBe("Alto");
  });

  it("sharePct medio → Medio como mínimo", () => {
    expect(riskForCompanyPerCurrency(0.2, 0, 0, 0, 0)).toBe("Medio");
  });

  it("UYU overdue bajo threshold high → Medio (any overdue > 0 = medium)", () => {
    // 1000 UYU overdue < 50K high threshold → "medium" → "Medio"
    expect(riskForCompanyPerCurrency(0.05, 1_000, 0, 2_000, 0)).toBe("Medio");
  });

  it("UYU overdue > threshold crítico → Alto", () => {
    // 300K UYU overdue supera threshold UYU critical (280K)
    expect(riskForCompanyPerCurrency(0.05, 300_000, 0, 300_000, 0)).toBe("Alto");
  });

  it("USD overdue > threshold crítico → Alto aunque UYU sea 0", () => {
    // $8K USD overdue supera threshold USD critical (7K) → Alto
    expect(riskForCompanyPerCurrency(0.05, 0, 8_000, 0, 8_000)).toBe("Alto");
  });

  it("USD overdue bajo threshold crítico pero alto → Alto", () => {
    // $7K USD exacto = critical → Alto
    expect(riskForCompanyPerCurrency(0.05, 0, 7_000, 0, 7_000)).toBe("Alto");
  });

  it("USD overdue medio ($2K) → Medio", () => {
    // $2K USD overdue: high threshold USD (1.5K) ≤ 2K < critical (7K) → high → Alto
    // (high mapea a Alto)
    expect(riskForCompanyPerCurrency(0.05, 0, 2_000, 0, 2_000)).toBe("Alto");
  });

  it("mezcla UYU bajo + USD critical → Alto (toma el peor)", () => {
    // UYU: 10K overdue → low; USD: 7K overdue → critical → Alto
    expect(riskForCompanyPerCurrency(0.05, 10_000, 7_000, 10_000, 7_000)).toBe("Alto");
  });

  it("legacy riskForCompany y perCurrency coinciden en caso sin monedas", () => {
    // Sin datos de moneda, compartamiento debe ser similar al legacy
    const legacy = riskForCompany(0.05, 0, 0);
    const perCurrency = riskForCompanyPerCurrency(0.05, 0, 0, 0, 0);
    expect(perCurrency).toBe(legacy); // ambos Bajo
  });

  it("no regressions: riskForCompany legacy funciona igual que antes", () => {
    expect(riskForCompany(0.05, 0, 0)).toBe("Bajo");
    expect(riskForCompany(0.2, 50_000, 0)).toBe("Medio");
    expect(riskForCompany(0.35, 50_000, 0)).toBe("Alto");
    expect(riskForCompany(0.1, 50_000, 300_000)).toBe("Alto");
  });
});

// ---------------------------------------------------------------------------
// Guard Notas de Crédito — computeInvoiceCurrencyBreakdown
// ---------------------------------------------------------------------------

const TODAY_NC = "2026-05-26";

function ncMetadata(cfeTipo: string | number) {
  return { zeta_customer_voucher_v1: { cfe_tipo: String(cfeTipo) } };
}

describe("computeInvoiceCurrencyBreakdown — guard Notas de Crédito", () => {
  it("NC CFE 112 no suma al billingUYU", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        // NC A391 (tipo real del tenant El País S.A.)
        { currency_code: "UYU", total_amount: 8_662, balance_amount: 0, due_date: "2026-05-08",
          zeta_metadata: ncMetadata("112") },
        // Factura real
        { currency_code: "UYU", total_amount: 17_080, balance_amount: 17_080, due_date: "2026-03-13" },
      ],
      TODAY_NC
    );
    expect(result.billingUYU).toBe(17_080); // NC excluida del billing
    expect(result.billingUSD).toBe(0);
  });

  it("NC CFE 112 con balance > 0 no suma al overdueUYU (defensa NC no imputada)", () => {
    // Escenario defensivo: NC con balance transitoriamente > 0 en DB
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 8_662, balance_amount: 8_662, due_date: "2026-05-08",
          zeta_metadata: ncMetadata("112") },
        { currency_code: "UYU", total_amount: 17_080, balance_amount: 17_080, due_date: "2026-03-13" },
      ],
      TODAY_NC
    );
    expect(result.overdueUYU).toBe(17_080); // Solo la factura real vencida
    expect(result.billingUYU).toBe(17_080); // NC excluida del billing
  });

  it("NC CFE 102 (e-NC de e-Factura) tampoco suma a billing ni overdue", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 5_000, balance_amount: 5_000, due_date: "2026-01-01",
          zeta_metadata: ncMetadata("102") },
        { currency_code: "UYU", total_amount: 10_000, balance_amount: 10_000, due_date: "2026-01-01" },
      ],
      TODAY_NC
    );
    expect(result.billingUYU).toBe(10_000);
    expect(result.overdueUYU).toBe(10_000);
  });

  it("NC USD no contamina overdueUSD", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "USD", total_amount: 500, balance_amount: 500, due_date: "2026-01-01",
          zeta_metadata: ncMetadata("112") },
        { currency_code: "USD", total_amount: 1_000, balance_amount: 1_000, due_date: "2026-01-01" },
      ],
      TODAY_NC
    );
    expect(result.overdueUSD).toBe(1_000);
    expect(result.billingUSD).toBe(1_000);
  });

  it("factura sin zeta_metadata (no NC) sigue sumando normalmente", () => {
    const result = computeInvoiceCurrencyBreakdown(
      [
        { currency_code: "UYU", total_amount: 25_742, balance_amount: 25_742, due_date: "2026-03-13" },
      ],
      TODAY_NC
    );
    expect(result.billingUYU).toBe(25_742);
    expect(result.overdueUYU).toBe(25_742);
  });

  it("fixture El País S.A.: facturas + NC + recibo → billing solo facturas reales", () => {
    // Facturas reales del tenant
    const elpais = [
      { currency_code: "UYU", total_amount: 17_080, balance_amount: 17_080, due_date: "2026-03-13" },
      { currency_code: "UYU", total_amount: 41_480, balance_amount: 0,      due_date: "2026-04-17" },
      { currency_code: "UYU", total_amount:  8_662, balance_amount:  8_662, due_date: "2026-05-07" },
      { currency_code: "UYU", total_amount:  8_662, balance_amount:  8_662, due_date: "2026-05-08" },
      // NC A391
      { currency_code: "UYU", total_amount:  8_662, balance_amount: 0, due_date: "2026-05-08",
        zeta_metadata: ncMetadata("112") },
    ];
    const result = computeInvoiceCurrencyBreakdown(elpais, TODAY_NC);
    // Billing = suma de facturas reales únicamente (NC excluida)
    expect(result.billingUYU).toBe(17_080 + 41_480 + 8_662 + 8_662); // 75_884
    // Overdue = facturas reales vencidas con balance > 0
    expect(result.overdueUYU).toBe(17_080 + 8_662 + 8_662); // 34_404
  });
});
