import { describe, expect, it } from "vitest";

import {
  buildFinancialMonthlyTrends,
  buildFinancialTrendDashboard,
  defaultTrendCurrency,
  filterTrendsByCurrency,
  FINANCIAL_TRENDS_MIN_DATE,
} from "@/lib/copilot-financial-monthly-trends";

describe("copilot-financial-monthly-trends", () => {
  it("agrupa facturas por mes", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-10", total_amount: 1000, currency_code: "UYU", is_active: true },
        { issue_date: "2026-04-15", total_amount: 2000, currency_code: "UYU", is_active: true },
      ],
      receipts: [],
    });
    const uyu = filterTrendsByCurrency(result.trends, "UYU");
    expect(uyu.some((t) => t.month === "2026-05" && t.grossIssued === 1000)).toBe(true);
    expect(uyu.some((t) => t.month === "2026-04" && t.grossIssued === 2000)).toBe(true);
  });

  it("resta NC del neto", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        {
          issue_date: "2026-05-10",
          total_amount: 1000,
          currency_code: "UYU",
          is_active: true,
        },
        {
          issue_date: "2026-05-12",
          total_amount: 200,
          currency_code: "UYU",
          is_active: true,
          zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: 102 } },
        },
      ],
      receipts: [],
    });
    const may = result.trends.find((t) => t.month === "2026-05" && t.currency === "UYU");
    expect(may?.grossIssued).toBe(1000);
    expect(may?.creditNotes).toBe(200);
    expect(may?.netIssued).toBe(800);
  });

  it("agrupa recibos por mes", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [],
      receipts: [
        { receipt_date: "2026-05-20", amount: 500, currency_code: "UYU", is_active: true },
      ],
    });
    const may = result.trends.find((t) => t.month === "2026-05" && t.currency === "UYU");
    expect(may?.collected).toBe(500);
  });

  it("separa UYU/USD", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "UYU", is_active: true },
        { issue_date: "2026-05-01", total_amount: 50, currency_code: "USD", is_active: true },
      ],
      receipts: [],
    });
    expect(result.trends.some((t) => t.currency === "UYU")).toBe(true);
    expect(result.trends.some((t) => t.currency === "USD")).toBe(true);
  });

  it("no mezcla monedas en una fila", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "UYU", is_active: true },
        { issue_date: "2026-05-01", total_amount: 50, currency_code: "USD", is_active: true },
      ],
      receipts: [],
    });
    for (const t of result.trends) {
      expect(["UYU", "USD"]).toContain(t.currency);
    }
    const uyuMay = result.trends.find((t) => t.month === "2026-05" && t.currency === "UYU");
    const usdMay = result.trends.find((t) => t.month === "2026-05" && t.currency === "USD");
    expect(uyuMay?.grossIssued).toBe(100);
    expect(usdMay?.grossIssued).toBe(50);
  });

  it("empty state sin datos", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [],
      receipts: [],
    });
    expect(result.isEmpty).toBe(true);
    expect(defaultTrendCurrency(result.trends)).toBe("UYU");
  });

  it("marca pendiente como snapshot actual", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-05-28",
      invoices: [
        { issue_date: "2026-05-01", total_amount: 100, currency_code: "UYU", is_active: true },
      ],
      receipts: [],
    });
    expect(result.pendingIsCurrentSnapshotOnly).toBe(true);
    expect(result.trends[0]?.pending).toBe(0);
  });
});

// ─── buildFinancialTrendDashboard ─────────────────────────────────────────────

describe("buildFinancialTrendDashboard", () => {
  const inv = (date: string, amount: number, cur = "UYU") => ({
    issue_date: date,
    total_amount: amount,
    currency_code: cur,
    is_active: true,
  });
  const rec = (date: string, amount: number, cur = "UYU") => ({
    receipt_date: date,
    amount,
    currency_code: cur,
    is_active: true,
  });

  it("calcula totales para período mensual", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [
        inv("2026-03-15", 1000),
        inv("2026-04-15", 2000),
        inv("2026-05-15", 3000),
      ],
      receipts: [rec("2026-05-20", 1500)],
    });
    expect(result.totals.netSales).toBe(6000);
    expect(result.totals.collections).toBe(1500);
    expect(result.totals.collectionRate).toBeCloseTo(0.25);
  });

  it("calcula deltas vs período anterior", () => {
    // asOfYmd in June so previous 3m = [ene, feb, mar 2026] — fully within 2026 cutoff
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-06-30",
      period: "3m",
      currency: "UYU",
      invoices: [
        inv("2026-04-01", 1000),
        inv("2026-05-01", 1000),
        inv("2026-06-01", 1000),
        inv("2026-01-01", 500),
        inv("2026-02-01", 500),
        inv("2026-03-01", 500),
      ],
      receipts: [],
    });
    expect(result.totals.netSales).toBe(3000);
    expect(result.previousTotals?.netSales).toBe(1500);
    expect(result.deltas.netSalesPct).toBeCloseTo(1.0);
  });

  it("identifica mejor período", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [
        inv("2026-03-01", 1000),
        inv("2026-04-01", 3000),
        inv("2026-05-01", 2000),
      ],
      receipts: [],
    });
    expect(result.best.netSalesPeriod?.value).toBe(3000);
  });

  it("brecha positiva cuando ventas > cobros", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [inv("2026-05-01", 5000)],
      receipts: [rec("2026-05-20", 2000)],
    });
    expect(result.gap.salesMinusCollections).toBe(3000);
    expect(result.gap.label).toBe("Faltan cobrar");
  });

  it("brecha negativa cuando cobros > ventas", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [inv("2026-05-01", 1000)],
      receipts: [rec("2026-05-20", 2000)],
    });
    expect(result.gap.salesMinusCollections).toBe(-1000);
    expect(result.gap.label).toContain("Recuperaste");
  });

  it("no divide por cero cuando ventas son cero", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [],
      receipts: [rec("2026-05-20", 500)],
    });
    expect(result.totals.collectionRate).toBeNull();
    expect(result.totals.collections).toBe(500);
  });

  it("no mezcla monedas — USD ignorado al pedir UYU", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [
        inv("2026-05-01", 1000, "UYU"),
        inv("2026-05-01", 5000, "USD"),
      ],
      receipts: [],
    });
    expect(result.totals.netSales).toBe(1000);
  });

  it("7d genera 7 puntos con claves de día", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "7d",
      currency: "UYU",
      invoices: [inv("2026-05-28", 1000)],
      receipts: [],
    });
    expect(result.points.length).toBe(7);
    expect(result.points[0].key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("3m genera 3 puntos con claves de mes", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [],
      receipts: [],
    });
    expect(result.points.length).toBe(3);
    expect(result.points[0].key).toMatch(/^\d{4}-\d{2}$/);
  });

  it("previousTotals es null cuando no hay datos en período anterior", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "12m",
      currency: "UYU",
      invoices: [inv("2026-05-01", 1000)],
      receipts: [],
    });
    expect(result.previousTotals).toBeNull();
    expect(result.deltas.netSalesPct).toBeNull();
  });
});

// ─── FINANCIAL_TRENDS_MIN_DATE cutoff ─────────────────────────────────────────

describe("buildFinancialTrendDashboard — corte min date 2026-01", () => {
  const inv = (date: string, amount: number, cur = "UYU") => ({
    issue_date: date,
    total_amount: amount,
    currency_code: cur,
    is_active: true,
  });

  it("12m desde 2026-05 devuelve solo ene-may 2026", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "12m",
      currency: "UYU",
      invoices: [
        inv("2025-06-01", 5000), // excluido
        inv("2025-12-01", 3000), // excluido
        inv("2026-01-01", 1000), // incluido
        inv("2026-03-01", 2000), // incluido
        inv("2026-05-01", 1500), // incluido
      ],
      receipts: [],
    });
    expect(result.points.every((p) => p.key >= "2026-01")).toBe(true);
    expect(result.points.length).toBe(5);
    expect(result.totals.netSales).toBe(4500);
  });

  it("no incluye jun-dic 2025 en keys de 12 meses", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "12m",
      currency: "UYU",
      invoices: [],
      receipts: [],
    });
    expect(result.points.every((p) => p.key >= "2026-01")).toBe(true);
    expect(result.points.length).toBeLessThanOrEqual(5);
  });

  it("previousTotals es null cuando comparación cae antes de 2026-01", () => {
    // 3m desde may 2026: prevKeys = [2025-12, 2026-01, 2026-02] → cruzó el corte
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [inv("2026-03-01", 1000), inv("2025-12-01", 999)],
      receipts: [],
    });
    expect(result.previousTotals).toBeNull();
    expect(result.deltas.netSalesPct).toBeNull();
  });

  it("3 meses no cruza antes de 2026 en currentKeys", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "3m",
      currency: "UYU",
      invoices: [],
      receipts: [],
    });
    expect(result.points.every((p) => p.key >= "2026-01")).toBe(true);
  });

  it("7 días respeta min date si asOf está cerca de 2026-01-01", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-01-05",
      period: "7d",
      currency: "UYU",
      invoices: [
        inv("2025-12-30", 999), // excluido
        inv("2026-01-02", 500), // incluido
      ],
      receipts: [],
    });
    expect(result.points.every((p) => p.key >= FINANCIAL_TRENDS_MIN_DATE)).toBe(true);
    expect(result.totals.netSales).toBe(500);
    expect(result.previousTotals).toBeNull();
  });

  it("no mezcla monedas con corte activo", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-05-30",
      period: "6m",
      currency: "UYU",
      invoices: [
        inv("2026-03-01", 1000, "UYU"),
        inv("2026-03-01", 9000, "USD"),
        inv("2025-12-01", 5000, "UYU"), // excluido por corte
      ],
      receipts: [],
    });
    expect(result.totals.netSales).toBe(1000);
  });
});

// ─── Shadow dedup: buildFinancialMonthlyTrends ────────────────────────────────

describe("buildFinancialMonthlyTrends — shadow dedup", () => {
  it("CCV1 + shadow mismo cliente/fecha/importe: solo cuenta CCV1", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-06-30",
      invoices: [
        {
          id: "ccv1-1",
          invoice_number: "ZETA:CCV1:100",
          company_id: "c1",
          issue_date: "2026-06-10",
          total_amount: 5000,
          currency_code: "UYU",
          is_active: true,
        },
        {
          id: "shadow-1",
          invoice_number: "ZETA:2850",
          company_id: "c1",
          issue_date: "2026-06-10",
          total_amount: 5000,
          currency_code: "UYU",
          is_active: true,
        },
      ],
      receipts: [],
    });
    const jun = result.trends.find((t) => t.month === "2026-06" && t.currency === "UYU");
    expect(jun?.grossIssued).toBe(5000);
  });

  it("shadow sin par CCV1 (orphan): sigue contando", () => {
    const result = buildFinancialMonthlyTrends({
      asOfYmd: "2026-06-30",
      invoices: [
        {
          id: "orphan-1",
          invoice_number: "ZETA:9999",
          company_id: "c1",
          issue_date: "2026-06-10",
          total_amount: 3000,
          currency_code: "UYU",
          is_active: true,
        },
      ],
      receipts: [],
    });
    const jun = result.trends.find((t) => t.month === "2026-06" && t.currency === "UYU");
    expect(jun?.grossIssued).toBe(3000);
  });
});

// ─── Shadow dedup: buildFinancialTrendDashboard ────────────────────────────────

describe("buildFinancialTrendDashboard — shadow dedup", () => {
  it("CCV1 + shadow mismo cliente/fecha/importe: solo cuenta CCV1", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-06-30",
      period: "3m",
      currency: "UYU",
      invoices: [
        {
          id: "ccv1-2",
          invoice_number: "ZETA:CCV1:200",
          company_id: "c1",
          issue_date: "2026-06-10",
          total_amount: 5000,
          currency_code: "UYU",
          is_active: true,
        },
        {
          id: "shadow-2",
          invoice_number: "ZETA:2850",
          company_id: "c1",
          issue_date: "2026-06-10",
          total_amount: 5000,
          currency_code: "UYU",
          is_active: true,
        },
      ],
      receipts: [],
    });
    expect(result.totals.netSales).toBe(5000);
  });

  it("shadow sin par CCV1 (orphan): sigue contando en dashboard", () => {
    const result = buildFinancialTrendDashboard({
      asOfYmd: "2026-06-30",
      period: "3m",
      currency: "UYU",
      invoices: [
        {
          id: "orphan-2",
          invoice_number: "ZETA:9999",
          company_id: "c1",
          issue_date: "2026-06-10",
          total_amount: 3000,
          currency_code: "UYU",
          is_active: true,
        },
      ],
      receipts: [],
    });
    expect(result.totals.netSales).toBe(3000);
  });
});
