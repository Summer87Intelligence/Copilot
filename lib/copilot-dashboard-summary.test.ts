import { describe, expect, it } from "vitest";
import {
  extractActiveDebtClientRows,
  extractClientStates,
  extractDashboardCurrencyData,
  extractMonthlyPoint,
  extractRecentMovements,
  extractTopBilling,
  extractTopBillingForCurrency,
  extractTopDebtors,
  extractTopDebtorsForCurrency,
  getLastNMonthRanges,
  getMonthRangesForPeriod,
  determineDashboardState,
  buildExecutiveSummaryMainRiskChip,
  hasExecutiveOverdueDebtForMode,
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
    lastMovement: null, lastIncome: null, lastExpense: null,
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
  it("usa portfolioResolvedAmount (cobrado aplicado) — alineado con Cartera", () => {
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

  it("no usa collectedInPeriod bruto cuando difiere del cobrado aplicado", () => {
    const period = makeReport({
      issuedUYU: 1_303_047.5,
      collectedUYU: 140_166,
      pendingUYU: 599_425,
    });
    const out = extractDashboardCurrencyData({
      periodReport: period,
      outstandingReport: makeReport({ pendingUYU: 599_425 }),
      cashPositions: [],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.facturado).toBe(1_303_047.5);
    expect(uyu?.cobrado).toBe(703_622.5);
    expect(uyu?.pendientePeriodo).toBe(599_425);
    expect(uyu?.facturado! - uyu?.cobrado!).toBeCloseTo(uyu?.pendientePeriodo!, 2);
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

  it("pendiente del período = facturado - cobrado aplicado (= pendingAtCutoff)", () => {
    const period = makeReport({
      issuedUYU: 1000,
      creditNotesUYU: 200,
      collectedUYU: 300,
      pendingUYU: 500,
    });
    const out = extractDashboardCurrencyData({
      periodReport: period,
      outstandingReport: null,
      cashPositions: [],
      outflowSummaries: [],
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.pendientePeriodo).toBe(500);
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

  it("deuda vencida usa portfolio overdue (due_date < hoy), incluye mora 1-30d", () => {
    const outstanding = makeReport({
      pendingUYU: 1000,
      agingUYU: [100, 200, 300, 400],
    });
    const portfolioRows: ClientPortfolioRow[] = [
      makePortfolioRow({ overdue_uyu: 40928, debt_uyu: 50000 }),
    ];
    const out = extractDashboardCurrencyData({
      periodReport: null,
      outstandingReport: outstanding,
      cashPositions: [],
      outflowSummaries: [],
      portfolioRows,
    });
    const uyu = out.find((d) => d.currency === "UYU");
    expect(uyu?.deudaVencida).toBe(40928);
  });

  it("deuda vencida fallback aging 31+ sin portfolio", () => {
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

  it("efectividad usa cobrado aplicado / facturado neto, capped a 1.0", () => {
    const period = makeReport({ issuedUYU: 1000, pendingUYU: 0 });
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
  it("extrae facturado neto y cobrado aplicado por moneda", () => {
    const report = makeReport({
      issuedUYU: 2000,
      pendingUYU: 500,
      issuedUSD: 300,
      pendingUSD: 100,
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

  it("incluye notas de crédito como haber", () => {
    const details = {
      c1: {
        company_name: "Gamma",
        invoices: [
          {
            id: "nc1",
            invoice_number: "NC-001",
            issue_date: "2026-06-03",
            total_amount: 200,
            balance_amount: 0,
            currency_code: "UYU",
            zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: 102 } },
          },
        ],
        receipts: [],
      },
    };
    const movements = extractRecentMovements(details, "2026-06-01", "2026-06-08");
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe("nota_credito");
    expect(movements[0]?.amount).toBe(200);
  });
});

describe("extractActiveDebtClientRows", () => {
  it("expone una fila por moneda con deuda", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Multi", debt_uyu: 1000, debt_usd: 500 }),
    ];
    const result = extractActiveDebtClientRows(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.currency)).toEqual(["UYU", "USD"]);
  });
});

describe("extractTopDebtorsForCurrency", () => {
  it("ordena por deuda de la moneda sin mezclar", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "A", debt_uyu: 100, debt_usd: 900 }),
      makePortfolioRow({ company_id: "c2", name: "B", debt_uyu: 500, debt_usd: 50 }),
    ];
    const uyu = extractTopDebtorsForCurrency(rows, "UYU", 10);
    const usd = extractTopDebtorsForCurrency(rows, "USD", 10);
    expect(uyu.map((r) => r.name)).toEqual(["B", "A"]);
    expect(usd.map((r) => r.name)).toEqual(["A", "B"]);
  });
});

describe("extractTopBillingForCurrency", () => {
  it("ordena facturación neta histórica por moneda", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "A", billing_uyu: 100, billing_usd: 900 }),
      makePortfolioRow({ company_id: "c2", name: "B", billing_uyu: 500, billing_usd: 50 }),
    ];
    const uyu = extractTopBillingForCurrency(rows, "UYU", 10);
    expect(uyu[0]?.name).toBe("B");
  });

  it("excluye clientes con facturación neta <= 0 del top USD", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Dolby", billing_usd: 3_342.04 }),
      makePortfolioRow({ company_id: "c2", name: "NetoCero", billing_usd: 0 }),
      makePortfolioRow({ company_id: "c3", name: "NetoNeg", billing_usd: -500 }),
      makePortfolioRow({ company_id: "c4", name: "Vilcabamba", billing_usd: 8_125.2 }),
    ];
    const usd = extractTopBillingForCurrency(rows, "USD", 10);
    expect(usd.map((r) => r.name)).toEqual(["Vilcabamba", "Dolby"]);
    expect(usd.find((r) => r.name === "NetoCero")).toBeUndefined();
    expect(usd.find((r) => r.name === "NetoNeg")).toBeUndefined();
  });

  it("excluye clientes con facturación neta <= 0 del top UYU", () => {
    const rows: ClientPortfolioRow[] = [
      makePortfolioRow({ company_id: "c1", name: "Positivo", billing_uyu: 1000 }),
      makePortfolioRow({ company_id: "c2", name: "Cero", billing_uyu: 0 }),
    ];
    const uyu = extractTopBillingForCurrency(rows, "UYU", 10);
    expect(uyu).toHaveLength(1);
    expect(uyu[0]?.name).toBe("Positivo");
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

describe("getMonthRangesForPeriod", () => {
  it("genera 7 buckets jun..dic para 01/06/2026..31/12/2026", () => {
    const ranges = getMonthRangesForPeriod("2026-06-01", "2026-12-31");
    expect(ranges).toHaveLength(7);
    expect(ranges.map((r) => r.yearMonth)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);
  });

  it("datos de junio quedan en jun (monthLabel correcto)", () => {
    const ranges = getMonthRangesForPeriod("2026-06-01", "2026-12-31");
    const labels = ranges.map((r) => extractMonthlyPoint(null, r.yearMonth).monthLabel);
    expect(labels).toEqual(["jun", "jul", "ago", "sep", "oct", "nov", "dic"]);
  });

  it("rango de un mes genera un bucket", () => {
    const ranges = getMonthRangesForPeriod("2026-06-01", "2026-06-30");
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.yearMonth).toBe("2026-06");
    expect(ranges[0]!.from).toBe("2026-06-01");
    expect(ranges[0]!.to).toBe("2026-06-30");
  });

  it("respeta maxMonths", () => {
    const ranges = getMonthRangesForPeriod("2026-01-01", "2030-12-31", 6);
    expect(ranges).toHaveLength(6);
  });

  it("maneja cruce de año", () => {
    const ranges = getMonthRangesForPeriod("2025-11-01", "2026-02-28");
    expect(ranges.map((r) => r.yearMonth)).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
  });

  it("el from de cada mes es siempre el día 01", () => {
    const ranges = getMonthRangesForPeriod("2026-03-01", "2026-05-31");
    expect(ranges.every((r) => r.from.endsWith("-01"))).toBe(true);
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

describe("buildExecutiveSummaryMainRiskChip — D-09 multimoneda", () => {
  const baseClients = { riesgoAlto: 0, conDeudaVencida: 0 };

  it("modo UYU + USD separado no suma numéricamente UYU y USD", () => {
    const chip = buildExecutiveSummaryMainRiskChip({
      state: "attention",
      currencyMode: "all",
      deudaVencidaUyu: 100_000,
      deudaVencidaUsd: 500,
      clientStates: baseClients,
    });
    expect(chip).toContain("UYU");
    expect(chip).toContain("USD");
    expect(chip).toMatch(/\$ 100\.000 UYU/);
    expect(chip).toMatch(/U\$S 500 USD/);
    expect(chip).not.toContain("100.500");
    expect(chip).not.toContain("100500");
  });

  it("modo solo USD muestra solo importe USD", () => {
    const chip = buildExecutiveSummaryMainRiskChip({
      state: "attention",
      currencyMode: "USD",
      deudaVencidaUyu: 99_999,
      deudaVencidaUsd: 1_200,
      clientStates: baseClients,
    });
    expect(chip).toMatch(/U\$S 1\.200 USD/);
    expect(chip).not.toContain("UYU");
    expect(chip).not.toContain("99");
  });

  it("modo solo UYU muestra solo importe UYU", () => {
    const chip = buildExecutiveSummaryMainRiskChip({
      state: "attention",
      currencyMode: "UYU",
      deudaVencidaUyu: 45_000,
      deudaVencidaUsd: 9_999,
      clientStates: baseClients,
    });
    expect(chip).toMatch(/\$ 45\.000 UYU/);
    expect(chip).not.toContain("USD");
    expect(chip).not.toContain("9");
  });

  it("modo USD consolidado usa TC y marca (cons.)", () => {
    const chip = buildExecutiveSummaryMainRiskChip({
      state: "attention",
      currencyMode: "USD_consolidated",
      deudaVencidaUyu: 40_000,
      deudaVencidaUsd: 500,
      exchangeRate: 40,
      clientStates: baseClients,
    });
    expect(chip).toBe("Vencido: U$S 1.500 USD (cons.)");
  });

  it("hasExecutiveOverdueDebtForMode en modo all usa OR, no suma", () => {
    expect(
      hasExecutiveOverdueDebtForMode({
        currencyMode: "all",
        deudaVencidaUyu: 0,
        deudaVencidaUsd: 100,
      })
    ).toBe(true);
    expect(
      hasExecutiveOverdueDebtForMode({
        currencyMode: "all",
        deudaVencidaUyu: 0,
        deudaVencidaUsd: 0,
      })
    ).toBe(false);
  });
});
