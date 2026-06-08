import { describe, expect, it } from "vitest";
import {
  extractClientStates,
  extractDashboardCurrencyData,
  extractMonthlyPoint,
  extractRecentMovements,
  extractTopBilling,
  extractTopDebtors,
  getLastNMonthRanges,
  determineDashboardState,
} from "./copilot-dashboard-summary";
import type { ClientPortfolioRow } from "./copilot-clients-portfolio";
import type {
  AgingBucket,
  FinancialConsistencyReport,
} from "./copilot-financial-reconciliation";
import type { CashPositionByCurrency } from "./treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "./treasury/treasury-scheduled-payments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBuckets(amounts: [number, number, number, number]): AgingBucket[] {
  const ranges = ["0_30", "31_60", "61_90", "90_plus"] as const;
  const total = amounts.reduce((s, a) => s + a, 0);
  return ranges.map((range, i) => ({
    range,
    amount: amounts[i],
    invoiceCount: amounts[i] > 0 ? 1 : 0,
    clientCount: amounts[i] > 0 ? 1 : 0,
    percentage: total > 0 ? amounts[i] / total : 0,
    realDueDateCount: amounts[i] > 0 ? 1 : 0,
    syntheticDueDateCount: 0,
  }));
}

function makeReport(
  opts: {
    issuedUYU?: number;
    collectedUYU?: number;
    creditNotesUYU?: number;
    pendingUYU?: number;
    issuedUSD?: number;
    collectedUSD?: number;
    pendingUSD?: number;
    agingUYU?: [number, number, number, number];
    agingUSD?: [number, number, number, number];
  } = {}
): FinancialConsistencyReport {
  const uyuEntry = {
    currencyCode: "UYU" as const,
    totalInvoiced: opts.issuedUYU ?? 0,
    issuedInPeriod: opts.issuedUYU ?? 0,
    totalPending: opts.pendingUYU ?? 0,
    pendingAtCutoff: opts.pendingUYU ?? 0,
    previousPending: 0,
    totalCollected: opts.collectedUYU ?? 0,
    collectedInPeriod: opts.collectedUYU ?? 0,
    collectedReceiptCount: opts.collectedUYU ? 1 : 0,
    openingBalance: 0,
    invoiceCount: opts.issuedUYU ? 1 : 0,
    creditNoteCount: 0,
    creditNoteAmount: opts.creditNotesUYU ?? 0,
    pendingInvoiceCount: opts.pendingUYU ? 1 : 0,
    collectionEffectiveness:
      opts.issuedUYU && opts.issuedUYU > 0
        ? Math.min(1, (opts.collectedUYU ?? 0) / opts.issuedUYU)
        : null,
    agingSource: "real" as const,
  };
  const usdEntry = opts.issuedUSD !== undefined
    ? {
        currencyCode: "USD" as const,
        totalInvoiced: opts.issuedUSD,
        issuedInPeriod: opts.issuedUSD,
        totalPending: opts.pendingUSD ?? 0,
        pendingAtCutoff: opts.pendingUSD ?? 0,
        previousPending: 0,
        totalCollected: opts.collectedUSD ?? 0,
        collectedInPeriod: opts.collectedUSD ?? 0,
        collectedReceiptCount: opts.collectedUSD ? 1 : 0,
        openingBalance: 0,
        invoiceCount: opts.issuedUSD ? 1 : 0,
        creditNoteCount: 0,
        creditNoteAmount: 0,
        pendingInvoiceCount: opts.pendingUSD ? 1 : 0,
        collectionEffectiveness:
          opts.issuedUSD > 0
            ? Math.min(1, (opts.collectedUSD ?? 0) / opts.issuedUSD)
            : null,
        agingSource: "real" as const,
      }
    : null;
  return {
    currencies: usdEntry ? [uyuEntry, usdEntry] : [uyuEntry],
    agingByCurrency: {
      UYU: opts.agingUYU ? makeBuckets(opts.agingUYU) : undefined,
      USD: opts.agingUSD ? makeBuckets(opts.agingUSD) : undefined,
    },
    staleClients: [],
    invoicesWithoutCurrency: 0,
    totalActiveInvoices: 0,
    syncFreshness: { status: "ok", maxHoursSinceUpdate: 0, staleClientCount: 0 },
    rowCapHit: false,
    orphanedBalanceTotal: 0,
    orphanedBalanceCount: 0,
    hasOrphanedBalances: false,
  } as unknown as FinancialConsistencyReport;
}

function makeCash(currency: "UYU" | "USD", available: number): CashPositionByCurrency {
  return {
    currency,
    openingConfigured: true,
    openingBalance: available,
    collectedFromClients: 0,
    manualIncome: 0,
    manualExpense: 0,
    adjustments: 0,
    transfersNet: 0,
    availableCash: available,
    currentCash: available,
    movementsCount: 0,
    lastMovement: null,
  };
}

function makeOutflow(currency: "UYU" | "USD", next30Days: number): TreasuryOutflowSummary {
  return {
    currency,
    totalScheduled: next30Days,
    overdue: 0,
    next7Days: 0,
    next30Days,
    paidInPeriod: 0,
    itemsCount: 1,
    byCategory: [],
  };
}

function makePortfolioRow(
  overrides: Partial<ClientPortfolioRow>
): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Cliente Test",
    industry: "",
    total_billing: 0,
    total_debt: 0,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "medio",
    risk: "Bajo",
    source: "zeta_invoice",
    has_contact_data: false,
    derived_from_debt: false,
    debt_uyu: 0,
    debt_usd: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractDashboardCurrencyData", () => {
  it("usa collectedInPeriod como cobrado — no totalCollected", () => {
    const period = makeReport({ issuedUYU: 1000, collectedUYU: 800, pendingUYU: 200 });
    const out = extractDashboardCurrencyData({
      periodReport: period,
      outstandingReport: makeReport({ pendingUYU: 200 }),
      cashPositions: [makeCash("UYU", 5000)],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.cobrado).toBe(800);
  });

  it("facturado del período es neto de notas de crédito", () => {
    const period = makeReport({ issuedUYU: 1000, creditNotesUYU: 200 });
    const out = extractDashboardCurrencyData({
      periodReport: period,
      outstandingReport: null,
      cashPositions: [],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.facturado).toBe(800);
  });

  it("deuda activa viene del all_outstanding report (no del período)", () => {
    const period = makeReport({ issuedUYU: 500, pendingUYU: 100 });
    const outstanding = makeReport({ pendingUYU: 9000 });
    const out = extractDashboardCurrencyData({
      periodReport: period,
      outstandingReport: outstanding,
      cashPositions: [],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.deudaActiva).toBe(9000);
  });

  it("deuda vencida es la suma de buckets 31_60 + 61_90 + 90_plus (due_date)", () => {
    const outstanding = makeReport({
      pendingUYU: 1000,
      agingUYU: [100, 200, 300, 400],
    });
    const out = extractDashboardCurrencyData({
      periodReport: null,
      outstandingReport: outstanding,
      cashPositions: [],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    // 200 + 300 + 400 = 900 (excluye bucket 0_30)
    expect(uyu?.deudaVencida).toBe(900);
  });

  it("caja después de pagos = disponible − outflows.next30Days", () => {
    const out = extractDashboardCurrencyData({
      periodReport: makeReport({ issuedUYU: 100 }),
      outstandingReport: null,
      cashPositions: [makeCash("UYU", 10000)],
      outflowSummaries: [makeOutflow("UYU", 3000)],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.cajaDespPagos).toBe(7000);
  });

  it("UYU y USD se mantienen separados — no se suman", () => {
    const out = extractDashboardCurrencyData({
      periodReport: makeReport({ issuedUYU: 1000, issuedUSD: 500 }),
      outstandingReport: null,
      cashPositions: [],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    const usd = out.find((d) => d.currency === "USD");
    expect(uyu?.facturado).toBe(1000);
    expect(usd?.facturado).toBe(500);
    expect(out).toHaveLength(2);
  });

  it("excluye moneda si no hay datos relevantes", () => {
    const out = extractDashboardCurrencyData({
      periodReport: makeReport({ issuedUYU: 100 }), // no USD data
      outstandingReport: null,
      cashPositions: [],
      outflowSummaries: [],
    });
    expect(out.every((d) => d.currency === "UYU")).toBe(true);
  });

  it("efectividad usa collectedInPeriod / facturado neto, capped a 1.0", () => {
    // collected > issued → should cap at 1.0
    const period = makeReport({ issuedUYU: 1000, collectedUYU: 1500 });
    const out = extractDashboardCurrencyData({
      periodReport: period,
      outstandingReport: null,
      cashPositions: [],
      outflowSummaries: [],
    });
    expect(out[0]?.efectividad).toBe(1);
  });
});

describe("extractTopDebtors", () => {
  it("ordena por deuda total DESC y limita a N", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Alpha", debt_uyu: 100, debt_usd: 0 }),
      makePortfolioRow({ company_id: "c2", name: "Beta", debt_uyu: 500, debt_usd: 0 }),
      makePortfolioRow({ company_id: "c3", name: "Gamma", debt_uyu: 300, debt_usd: 0 }),
    ];
    const result = extractTopDebtors(rows, 2);
    expect(result.map((r) => r.name)).toEqual(["Beta", "Gamma"]);
  });

  it("excluye clientes sin deuda", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Sin deuda", debt_uyu: 0, debt_usd: 0 }),
      makePortfolioRow({ company_id: "c2", name: "Con deuda", debt_uyu: 500, debt_usd: 0 }),
    ];
    const result = extractTopDebtors(rows);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Con deuda");
  });

  it("no mezcla UYU y USD — expone ambos por separado", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Multi", debt_uyu: 1000, debt_usd: 500 }),
    ];
    const result = extractTopDebtors(rows);
    expect(result[0].debtUYU).toBe(1000);
    expect(result[0].debtUSD).toBe(500);
  });
});

describe("extractClientStates", () => {
  it("clasifica correctamente en 4 estados", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ debt_uyu: 0, debt_usd: 0 }),
      makePortfolioRow({ debt_uyu: 500, debt_usd: 0, overdue_uyu: 0, overdue_usd: 0, risk: "Bajo" }),
      makePortfolioRow({ debt_uyu: 300, debt_usd: 0, overdue_uyu: 100, overdue_usd: 0, risk: "Medio" }),
      makePortfolioRow({ debt_uyu: 1000, debt_usd: 0, overdue_uyu: 1000, risk: "Alto" }),
    ];
    const result = extractClientStates(rows);
    expect(result.sinDeuda).toBe(1);
    expect(result.conDeudaAlDia).toBe(1);
    expect(result.conDeudaVencida).toBe(1);
    expect(result.riesgoAlto).toBe(1);
    expect(result.total).toBe(4);
  });
});

describe("extractMonthlyPoint", () => {
  it("extrae issuedInPeriod y collectedInPeriod por moneda", () => {
    const report = makeReport({
      issuedUYU: 2000,
      collectedUYU: 1500,
      issuedUSD: 300,
      collectedUSD: 200,
    });
    const point = extractMonthlyPoint(report, "2026-03");
    expect(point.issuedUYU).toBe(2000);
    expect(point.collectedUYU).toBe(1500);
    expect(point.issuedUSD).toBe(300);
    expect(point.collectedUSD).toBe(200);
    expect(point.monthLabel).toBe("mar");
  });

  it("devuelve 0 para moneda sin datos", () => {
    const point = extractMonthlyPoint(null, "2026-01");
    expect(point.issuedUYU).toBe(0);
    expect(point.collectedUYU).toBe(0);
  });
});

describe("determineDashboardState", () => {
  it("ok cuando no hay deuda vencida ni riesgo alto", () => {
    const currData = [
      { currency: "UYU" as const, deudaVencida: 0, cajaDisponible: 1000, cajaDespPagos: 500 } as ReturnType<typeof extractDashboardCurrencyData>[number],
    ];
    const states = { sinDeuda: 5, conDeudaAlDia: 3, conDeudaVencida: 0, riesgoAlto: 0, total: 8 };
    expect(determineDashboardState(currData, states)).toBe("ok");
  });

  it("attention cuando hay deuda vencida", () => {
    const currData = [
      { currency: "UYU" as const, deudaVencida: 100, cajaDisponible: 1000, cajaDespPagos: 500 } as ReturnType<typeof extractDashboardCurrencyData>[number],
    ];
    const states = { sinDeuda: 3, conDeudaAlDia: 2, conDeudaVencida: 1, riesgoAlto: 0, total: 6 };
    expect(determineDashboardState(currData, states)).toBe("attention");
  });

  it("critical cuando caja después de pagos es negativa", () => {
    const currData = [
      { currency: "UYU" as const, deudaVencida: 0, cajaDisponible: 1000, cajaDespPagos: -500 } as ReturnType<typeof extractDashboardCurrencyData>[number],
    ];
    const states = { sinDeuda: 5, conDeudaAlDia: 3, conDeudaVencida: 0, riesgoAlto: 0, total: 8 };
    expect(determineDashboardState(currData, states)).toBe("critical");
  });
});

describe("extractRecentMovements", () => {
  it("incluye facturas y recibos del período, ordena por fecha DESC", () => {
    const details = {
      c1: {
        company_name: "Alpha S.A.",
        invoices: [
          { id: "i1", invoice_number: "INV-001", issue_date: "2026-06-05", total_amount: 1000, balance_amount: 1000, currency_code: "UYU" },
          { id: "i2", invoice_number: "INV-002", issue_date: "2026-05-20", total_amount: 500, balance_amount: 0, currency_code: "USD" },
        ],
        receipts: [
          { id: "r1", amount: 800, receipt_date: "2026-06-07", currency_code: "UYU" },
        ],
      },
    };
    const movements = extractRecentMovements(details, "2026-06-01", "2026-06-08", 10);
    expect(movements).toHaveLength(2); // i2 is outside period
    expect(movements[0].date).toBe("2026-06-07"); // receipt first (latest)
    expect(movements[0].type).toBe("recibo");
    expect(movements[1].type).toBe("factura");
  });

  it("excluye movimientos fuera del período", () => {
    const details = {
      c1: {
        company_name: "Beta",
        invoices: [
          { id: "i1", invoice_number: "INV-001", issue_date: "2026-05-15", total_amount: 1000, balance_amount: 1000, currency_code: "UYU" },
        ],
        receipts: [],
      },
    };
    const movements = extractRecentMovements(details, "2026-06-01", "2026-06-08");
    expect(movements).toHaveLength(0);
  });
});

describe("getLastNMonthRanges", () => {
  it("devuelve N meses completos en orden ascendente", () => {
    const ranges = getLastNMonthRanges("2026-06-08", 3);
    expect(ranges).toHaveLength(3);
    expect(ranges[0].yearMonth).toBe("2026-03");
    expect(ranges[1].yearMonth).toBe("2026-04");
    expect(ranges[2].yearMonth).toBe("2026-05");
  });

  it("maneja cruce de año", () => {
    const ranges = getLastNMonthRanges("2026-02-15", 3);
    expect(ranges[0].yearMonth).toBe("2025-11");
    expect(ranges[1].yearMonth).toBe("2025-12");
    expect(ranges[2].yearMonth).toBe("2026-01");
  });

  it("los rangos tienen from y to correctos", () => {
    const ranges = getLastNMonthRanges("2026-06-08", 1);
    expect(ranges[0].from).toBe("2026-05-01");
    expect(ranges[0].to).toBe("2026-05-31");
  });
});

describe("extractTopBilling (all-time histórico, no período)", () => {
  it("ordena por facturación total DESC y muestra UYU+USD separados", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Alpha", billing_uyu: 10000, billing_usd: 0 }),
      makePortfolioRow({ company_id: "c2", name: "Beta", billing_uyu: 0, billing_usd: 5000 }),
      makePortfolioRow({ company_id: "c3", name: "Gamma", billing_uyu: 3000, billing_usd: 1000 }),
    ];
    const result = extractTopBilling(rows, 3);
    expect(result[0].name).toBe("Alpha");
    expect(result[0].billingUYU).toBe(10000);
    expect(result[1].name).toBe("Beta");
    expect(result[2].name).toBe("Gamma");
  });
});
