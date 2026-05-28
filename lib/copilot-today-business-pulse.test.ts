import { describe, expect, it } from "vitest";
import { sumCarteraAgingOverdue } from "./copilot-cartera-aging-totals";
import type { AgingBucket } from "./copilot-financial-reconciliation";
import {
  buildTodayBusinessPulse,
  buildBreakdown,
  carteraCollectedToDateFromReport,
  carteraPeriodMetricsFromReport,
  fmtCurrencyAmount,
  resolveOverdueDisplaySemantics,
  type BusinessPulseInput,
  type TodayBusinessPulse,
} from "./copilot-today-business-pulse";

function blockFor(pulse: TodayBusinessPulse, currency: "UYU" | "USD") {
  return pulse.currencyBlocks.find((b) => b.currency === currency);
}
import type { ClientPortfolioRow } from "./copilot-clients-portfolio";
import {
  CURRENCY_METRIC_LABELS,
  CURRENCY_METRIC_TONES,
  COLLECTION_EXCEEDS_BILLING_NOTE,
  HOY_COPY,
  HOY_PAGE,
  HOY_UI,
  shouldShowCollectionExceedsBillingNote,
} from "./copilot-hoy-ui-contract";

// ─── Snapshot mocks ───────────────────────────────────────────────────────────

const SNAPSHOT_HEALTHY = {
  available_cash: 500_000,
  expected_inflows: 300_000,
  expected_outflows: 80_000,
  projected_balance: 720_000,
  coverage_ratio: 3.75,
  risk_level: "low",
  realized: { cash_net: 500_000, receipts_gross: 800_000, payments_gross: 300_000, tax_paid_ltd: 0 },
  expected: {
    receivables_open_balance: 350_000,
    receivables_risk_weighted: 300_000,
    outflows_operational_scheduled: 60_000,
    outflows_fiscal_due: 20_000,
  },
  projected: { liquidity_balance: 720_000, coverage_ratio: 3.75, risk_band: "low" },
  diagnostics: { dataset_caps: { isTruncated: false, tables_at_cap: [] } },
} as unknown as Parameters<typeof buildTodayBusinessPulse>[0]["snapshot"];

const SNAPSHOT_ATTENTION = {
  available_cash: 100_000,
  expected_inflows: 150_000,
  expected_outflows: 200_000,
  projected_balance: 50_000,
  coverage_ratio: 0.75,
  risk_level: "high",
  realized: { cash_net: 100_000, receipts_gross: 200_000, payments_gross: 100_000, tax_paid_ltd: 0 },
  expected: {
    receivables_open_balance: 200_000,
    receivables_risk_weighted: 150_000,
    outflows_operational_scheduled: 150_000,
    outflows_fiscal_due: 50_000,
  },
  projected: { liquidity_balance: 50_000, coverage_ratio: 0.75, risk_band: "high" },
  diagnostics: { dataset_caps: { isTruncated: false, tables_at_cap: [] } },
} as unknown as Parameters<typeof buildTodayBusinessPulse>[0]["snapshot"];

const SNAPSHOT_CRITICAL = {
  available_cash: -50_000,
  expected_inflows: 100_000,
  expected_outflows: 500_000,
  projected_balance: -400_000,
  coverage_ratio: 0.2,
  risk_level: "critical",
  realized: { cash_net: -50_000, receipts_gross: 50_000, payments_gross: 100_000, tax_paid_ltd: 0 },
  expected: {
    receivables_open_balance: 100_000,
    receivables_risk_weighted: 100_000,
    outflows_operational_scheduled: 400_000,
    outflows_fiscal_due: 100_000,
  },
  projected: { liquidity_balance: -400_000, coverage_ratio: 0.2, risk_band: "critical" },
  diagnostics: { dataset_caps: { isTruncated: false, tables_at_cap: [] } },
} as unknown as Parameters<typeof buildTodayBusinessPulse>[0]["snapshot"];

// ─── Portfolio row factory ────────────────────────────────────────────────────

function makeRow(overrides: Partial<ClientPortfolioRow>): ClientPortfolioRow {
  const base: ClientPortfolioRow = {
    company_id: "c1",
    name: "Cliente Ejemplo",
    industry: "Comercio",
    total_billing: 0,
    total_debt: 0,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "bueno",
    risk: "Bajo",
    source: "zeta_invoice",
    has_contact_data: true,
    derived_from_debt: false,
    debt_uyu: 0,
    debt_usd: 0,
    ...overrides,
  };
  // When per-currency fields aren't explicitly set but total_debt is, default to UYU
  if (!overrides.debt_uyu && !overrides.debt_usd && base.total_debt > 0) {
    base.debt_uyu = base.total_debt;
  }
  return base;
}

// ─── Base gates ───────────────────────────────────────────────────────────────

const GATE_HIGH: BusinessPulseInput["gate"] = {
  confidence: "high",
  coverage: "full",
  recommendations_enabled: true,
};

const GATE_MEDIUM: BusinessPulseInput["gate"] = {
  confidence: "medium",
  coverage: "partial",
  recommendations_enabled: true,
};

const GATE_LOW: BusinessPulseInput["gate"] = {
  confidence: "low",
  coverage: "insufficient",
  recommendations_enabled: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildTodayBusinessPulse", () => {
  // ─ Negocio saludable ────────────────────────────────────────────────────────
  describe("negocio saludable", () => {
    const input: BusinessPulseInput = {
      snapshot: SNAPSHOT_HEALTHY,
      portfolioRows: [
        makeRow({ company_id: "c1", name: "Empresa A", total_debt: 50_000, risk: "Bajo" }),
        makeRow({ company_id: "c2", name: "Empresa B", total_debt: 30_000, risk: "Bajo" }),
      ],
      gate: GATE_HIGH,
    };

    it("devuelve status healthy", () => {
      expect(buildTodayBusinessPulse(input).overallStatus).toBe("healthy");
    });

    it("headline no contiene términos técnicos", () => {
      const { headline } = buildTodayBusinessPulse(input);
      const forbidden = ["sync", "pipeline", "workflow", "reconciliation", "bootstrap", "snapshot", "metadata", "orphan", "stale"];
      for (const word of forbidden) {
        expect(headline.toLowerCase()).not.toContain(word);
      }
    });

    it("no hay pendientes urgentes", () => {
      const { importantPendingItems } = buildTodayBusinessPulse(input);
      expect(importantPendingItems.filter((i) => i.urgency === "alta")).toHaveLength(0);
    });

    it("priorityCollections muestra clientes con deuda", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      expect(priorityCollections.length).toBeGreaterThan(0);
      expect(priorityCollections[0]!.deuda).toBeGreaterThan(0);
    });

    it("no hay dataWarning con gate high", () => {
      expect(buildTodayBusinessPulse(input).dataWarning).toBeNull();
    });

    it("deuda_breakdown tiene montos UYU por separado", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const first = priorityCollections[0]!;
      expect(first.deuda_breakdown.length).toBeGreaterThan(0);
      expect(first.deuda_breakdown[0]!.currency).toBe("UYU");
    });
  });

  // ─ Cobranza en atención ─────────────────────────────────────────────────────
  describe("cobranza en atención", () => {
    const input: BusinessPulseInput = {
      snapshot: SNAPSHOT_ATTENTION,
      portfolioRows: [
        makeRow({ company_id: "c1", name: "Empresa X", total_debt: 120_000, overdue_debt: 80_000, risk: "Medio" }),
        makeRow({ company_id: "c2", name: "Empresa Y", total_debt: 60_000, overdue_debt: 40_000, risk: "Bajo" }),
      ],
      gate: GATE_HIGH,
    };

    it("devuelve status attention", () => {
      expect(buildTodayBusinessPulse(input).overallStatus).toBe("attention");
    });

    it("headline distingue deudores activos de señales de demora", () => {
      const { headline, clientCounts } = buildTodayBusinessPulse(input);
      expect(headline.toLowerCase()).toContain("deuda activa");
      expect(headline.toLowerCase()).toContain("atraso o señales de demora");
      expect(headline.toLowerCase()).not.toContain("prioritario");
      expect(clientCounts.debtorClients).toBe(2);
      expect(clientCounts.attentionClients).toBeGreaterThan(0);
    });

    it("bloque UYU con mora tiene status attention o critical", () => {
      const pulse = buildTodayBusinessPulse(input);
      const uyu = blockFor(pulse, "UYU");
      expect(uyu).toBeDefined();
      expect(["attention", "critical"]).toContain(uyu?.status);
    });

    it("priorityCollections ordena por vencido descendente", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      expect(priorityCollections[0]!.vencido).toBeGreaterThanOrEqual(priorityCollections[1]!.vencido);
    });

    it("pendientes incluyen clientes con deuda vencida", () => {
      const { importantPendingItems } = buildTodayBusinessPulse(input);
      expect(importantPendingItems.some((i) => i.title.toLowerCase().includes("vencid"))).toBe(true);
    });

    it("no supera 4 acciones recomendadas", () => {
      expect(buildTodayBusinessPulse(input).recommendedActions.length).toBeLessThanOrEqual(4);
    });
  });

  // ─ Situación crítica ────────────────────────────────────────────────────────
  describe("situación crítica", () => {
    const rows = [
      makeRow({ company_id: "c1", name: "A", total_debt: 200_000, overdue_debt: 150_000, risk: "Alto" }),
      makeRow({ company_id: "c2", name: "B", total_debt: 150_000, overdue_debt: 100_000, risk: "Alto" }),
      makeRow({ company_id: "c3", name: "C", total_debt: 100_000, overdue_debt: 80_000, risk: "Alto" }),
    ];

    const input: BusinessPulseInput = {
      snapshot: SNAPSHOT_CRITICAL,
      portfolioRows: rows,
      gate: GATE_HIGH,
    };

    it("devuelve status critical", () => {
      expect(buildTodayBusinessPulse(input).overallStatus).toBe("critical");
    });

    it("hay pendientes de urgencia alta", () => {
      const { importantPendingItems } = buildTodayBusinessPulse(input);
      expect(importantPendingItems.some((i) => i.urgency === "alta")).toBe(true);
    });

    it("no expone card Capacidad de pago en indicadores operativos", () => {
      const { operationalIndicators } = buildTodayBusinessPulse(input);
      expect(operationalIndicators.find((i) => i.id === "coverage")).toBeUndefined();
    });
  });

  // ─ Cliente prioritario en colecciones ────────────────────────────────────────
  describe("cliente prioritario en colecciones", () => {
    const rows = [
      makeRow({ company_id: "c1", name: "Cliente Grande", total_debt: 500_000, overdue_debt: 300_000, risk: "Alto" }),
      makeRow({ company_id: "c2", name: "Cliente Chico", total_debt: 50_000, overdue_debt: 10_000, risk: "Bajo" }),
    ];

    it("el cliente con más vencido aparece primero", () => {
      const { priorityCollections } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      expect(priorityCollections[0]!.company_id).toBe("c1");
    });

    it("accion del cliente con vencido indica contacto por saldo vencido", () => {
      const { priorityCollections } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      expect(priorityCollections[0]!.accion.toLowerCase()).toContain("contactar por saldo vencido");
    });

    it("deepLink apunta a ficha del cliente", () => {
      const { priorityCollections } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      expect(priorityCollections[0]!.deepLink).toContain("c1");
    });
  });

  // ─ Pendientes importantes ────────────────────────────────────────────────────
  describe("pendientes importantes", () => {
    it("agrega item de datos atrasados cuando gate es low", () => {
      const { importantPendingItems } = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [],
        gate: GATE_LOW,
      });
      expect(importantPendingItems.some((i) => i.id === "data_quality")).toBe(true);
    });

    it("no supera 6 pendientes", () => {
      const manyRows = Array.from({ length: 10 }, (_, i) =>
        makeRow({ company_id: `c${i}`, name: `Cliente ${i}`, total_debt: 100_000, overdue_debt: 50_000, risk: "Alto", has_contact_data: false })
      );
      const { importantPendingItems } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: manyRows, gate: GATE_HIGH });
      expect(importantPendingItems.length).toBeLessThanOrEqual(6);
    });

    it("impacto en pendientes contiene moneda explícita (no símbolo genérico)", () => {
      const rows = [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 80_000, risk: "Alto" }),
      ];
      const { importantPendingItems } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const item = importantPendingItems.find((i) => i.id.startsWith("overdue_high_"));
      expect(item).toBeDefined();
      // Debe mostrar "UYU $" o "USD U$S", nunca solo "$"
      expect(item!.impacto).toMatch(/UYU \$|USD U\$S/);
    });
  });

  // ─ Labels sin palabras técnicas ──────────────────────────────────────────────
  describe("labels sin palabras técnicas", () => {
    const forbiddenWords = ["sync", "pipeline", "workflow", "reconciliation", "orphan", "stale", "bootstrap", "metadata", "snapshot", "drift"];

    const input: BusinessPulseInput = {
      snapshot: SNAPSHOT_ATTENTION,
      portfolioRows: [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 60_000, risk: "Alto" }),
      ],
      gate: { confidence: "medium", coverage: "partial", recommendations_enabled: true },
    };

    it("operationalIndicators no contiene términos técnicos en label/helperText", () => {
      const { operationalIndicators } = buildTodayBusinessPulse(input);
      for (const ind of operationalIndicators) {
        for (const word of forbiddenWords) {
          expect(ind.label.toLowerCase()).not.toContain(word);
          expect(ind.helperText.toLowerCase()).not.toContain(word);
        }
      }
    });

    it("recommendedActions no contiene términos técnicos", () => {
      const { recommendedActions } = buildTodayBusinessPulse(input);
      for (const a of recommendedActions) {
        for (const word of forbiddenWords) {
          expect(a.label.toLowerCase()).not.toContain(word);
        }
      }
    });

    it("importantPendingItems no contiene términos técnicos en title/accion", () => {
      const { importantPendingItems } = buildTodayBusinessPulse(input);
      for (const item of importantPendingItems) {
        for (const word of forbiddenWords) {
          expect(item.title.toLowerCase()).not.toContain(word);
          expect(item.accion.toLowerCase()).not.toContain(word);
        }
      }
    });

    it("hay un solo indicador operativo (atención); estado de datos va al hero", () => {
      const { operationalIndicators } = buildTodayBusinessPulse(input);
      expect(operationalIndicators).toHaveLength(1);
      expect(operationalIndicators.map((i) => i.id)).toEqual(["clients"]);
      expect(operationalIndicators.some((i) => i.id === "data_status")).toBe(false);
    });

    it("no aparece Capacidad de pago ni Cobros netos en operationalIndicators", () => {
      const { operationalIndicators } = buildTodayBusinessPulse(input);
      const ids = operationalIndicators.map((i) => i.id);
      expect(ids).not.toContain("coverage");
      expect(ids).not.toContain("cash_flow");
      expect(ids).not.toContain("collections");
      expect(ids).not.toContain("overdue");
    });

    it("indicador de clientes se llama 'Clientes con atención', no 'Clientes activos'", () => {
      const { operationalIndicators } = buildTodayBusinessPulse(input);
      const clients = operationalIndicators.find((i) => i.id === "clients");
      expect(clients?.label).toContain("atención");
      expect(clients?.label.toLowerCase()).not.toContain("activos");
    });
  });

  // ─ Sin datos ─────────────────────────────────────────────────────────────────
  describe("sin datos", () => {
    it("status healthy sin datos de portfolio", () => {
      const { overallStatus } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      expect(overallStatus).toBe("healthy");
    });

    it("last30DaysSummary vacío sin snapshot", () => {
      const { last30DaysSummary } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      expect(last30DaysSummary).toHaveLength(0);
    });

    it("dataWarning presente con gate insufficient", () => {
      const { dataWarning } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_LOW });
      expect(dataWarning).not.toBeNull();
    });

    it("NO hay dataWarning con gate medium", () => {
      const { dataWarning } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_MEDIUM });
      expect(dataWarning).toBeNull();
    });

    it("sin portfolio no genera bloques por moneda", () => {
      const { currencyBlocks } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      expect(currencyBlocks).toHaveLength(0);
    });
  });

  // ─ Multi-moneda: solo UYU ────────────────────────────────────────────────────
  describe("multi-moneda — solo UYU", () => {
    const rows = [
      makeRow({ company_id: "c1", name: "Cliente UYU", total_debt: 100_000, overdue_debt: 60_000, risk: "Alto",
        debt_uyu: 100_000, debt_usd: 0, overdue_uyu: 60_000, overdue_usd: 0 }),
    ];
    const input: BusinessPulseInput = { snapshot: null, portfolioRows: rows, gate: GATE_HIGH };

    it("deuda_breakdown solo contiene UYU", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.deuda_breakdown).toHaveLength(1);
      expect(c.deuda_breakdown[0]!.currency).toBe("UYU");
    });

    it("vencido_breakdown solo contiene UYU", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.vencido_breakdown).toHaveLength(1);
      expect(c.vencido_breakdown[0]!.currency).toBe("UYU");
    });

    it("deuda_breakdown no contiene USD", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.deuda_breakdown.some((m) => m.currency === "USD")).toBe(false);
    });

    it("formato de monto UYU es 'UYU $ X'", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.deuda_breakdown[0]!.formatted).toMatch(/^UYU \$/);
    });

    it("bloque UYU: pendiente coincide con debt_uyu", () => {
      const pulse = buildTodayBusinessPulse(input);
      expect(blockFor(pulse, "UYU")?.pendingCurrent?.amount).toBe(100_000);
      expect(blockFor(pulse, "USD")).toBeUndefined();
    });
  });

  // ─ Multi-moneda: solo USD ────────────────────────────────────────────────────
  describe("multi-moneda — solo USD", () => {
    const rows = [
      makeRow({ company_id: "c1", name: "Cliente USD", total_debt: 10_000, overdue_debt: 6_000, risk: "Alto",
        debt_uyu: 0, debt_usd: 10_000, overdue_uyu: 0, overdue_usd: 6_000 }),
    ];
    const input: BusinessPulseInput = { snapshot: null, portfolioRows: rows, gate: GATE_HIGH };

    it("deuda_breakdown solo contiene USD", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.deuda_breakdown).toHaveLength(1);
      expect(c.deuda_breakdown[0]!.currency).toBe("USD");
    });

    it("vencido_breakdown solo contiene USD", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.vencido_breakdown).toHaveLength(1);
      expect(c.vencido_breakdown[0]!.currency).toBe("USD");
    });

    it("formato de monto USD es 'USD U$S X'", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.deuda_breakdown[0]!.formatted).toMatch(/^USD U\$S/);
    });

    it("bloque USD: pendiente coincide con debt_usd", () => {
      const pulse = buildTodayBusinessPulse(input);
      expect(blockFor(pulse, "USD")?.pendingCurrent?.amount).toBe(10_000);
    });
  });

  // ─ Multi-moneda: UYU + USD ───────────────────────────────────────────────────
  describe("multi-moneda — UYU + USD mezclados", () => {
    const rows = [
      makeRow({ company_id: "c1", name: "A", total_debt: 110_000, overdue_debt: 70_000, risk: "Alto",
        debt_uyu: 100_000, debt_usd: 10_000, overdue_uyu: 60_000, overdue_usd: 10_000 }),
      makeRow({ company_id: "c2", name: "B", total_debt: 50_000, overdue_debt: 0, risk: "Bajo",
        debt_uyu: 30_000, debt_usd: 20_000 }),
    ];
    const input: BusinessPulseInput = { snapshot: null, portfolioRows: rows, gate: GATE_HIGH };

    it("deuda_breakdown de c1 contiene UYU y USD por separado", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.deuda_breakdown.some((m) => m.currency === "UYU")).toBe(true);
      expect(c.deuda_breakdown.some((m) => m.currency === "USD")).toBe(true);
    });

    it("vencido_breakdown contiene UYU y USD por separado", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      expect(c.vencido_breakdown.some((m) => m.currency === "UYU")).toBe(true);
      expect(c.vencido_breakdown.some((m) => m.currency === "USD")).toBe(true);
    });

    it("UYU y USD NO se suman en deuda_breakdown", () => {
      const { priorityCollections } = buildTodayBusinessPulse(input);
      const c = priorityCollections[0]!;
      // There should be 2 separate entries, not 1 with the sum
      expect(c.deuda_breakdown).toHaveLength(2);
    });

    it("genera dos bloques UYU y USD separados", () => {
      const pulse = buildTodayBusinessPulse(input);
      expect(pulse.currencyBlocks).toHaveLength(2);
      expect(blockFor(pulse, "UYU")?.pendingCurrent?.amount).toBe(130_000);
      expect(blockFor(pulse, "USD")?.pendingCurrent?.amount).toBe(30_000);
    });
  });

  // ─ Clientes con atención ─────────────────────────────────────────────────────
  describe("clientes con atención", () => {
    it("muestra solo clientes con vencido o riesgo alto, no el total", () => {
      const rows = [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 50_000, risk: "Bajo" }),
        makeRow({ company_id: "c2", name: "B", total_debt: 80_000, overdue_debt: 0, risk: "Bajo" }),
        makeRow({ company_id: "c3", name: "C", total_debt: 60_000, overdue_debt: 0, risk: "Bajo" }),
      ];
      const { operationalIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const clients = operationalIndicators.find((i) => i.id === "clients");
      // Only c1 has overdue → 1 client needs attention, not 3
      expect(clients?.value).toBe("1");
    });

    it("muestra 'Sin señales' cuando ningún cliente requiere atención", () => {
      const rows = [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 0, risk: "Bajo" }),
      ];
      const { operationalIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const clients = operationalIndicators.find((i) => i.id === "clients");
      expect(clients?.value).toBe("Sin señales");
    });

    it("tono ok cuando no hay clientes en atención", () => {
      const rows = [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 0, risk: "Bajo" }),
      ];
      const { operationalIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const clients = operationalIndicators.find((i) => i.id === "clients");
      expect(clients?.tone).toBe("ok");
    });
  });

  // ─ Bloques ejecutivos por moneda ───────────────────────────────────────────
  describe("currencyBlocks ejecutivos", () => {
    it("facturado y cobrado UYU separados de USD con carteraPeriodMetrics", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", debt_uyu: 50_000, debt_usd: 1_000, total_debt: 51_000 }),
        ],
        gate: GATE_HIGH,
        carteraPeriodMetrics: {
          billed: { UYU: 200_000, USD: 10_000 },
          collected: { UYU: 80_000, USD: 4_000 },
          pending: { UYU: 50_000, USD: 1_000 },
        },
        carteraAgingOverdue: { UYU: 5_000, USD: 500 },
        carteraAgingCurrent: { UYU: 45_000, USD: 500 },
      });
      expect(blockFor(pulse, "UYU")?.billedPeriod?.amount).toBe(200_000);
      expect(blockFor(pulse, "USD")?.billedPeriod?.amount).toBe(10_000);
      expect(blockFor(pulse, "UYU")?.collectedPeriod?.amount).toBe(80_000);
      expect(blockFor(pulse, "USD")?.collectedPeriod?.amount).toBe(4_000);
    });

    it("crítico +30 usa aging cartera por moneda", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [makeRow({ company_id: "c1", debt_uyu: 100_000, total_debt: 100_000 })],
        gate: GATE_HIGH,
        carteraAgingOverdue: { UYU: 17_080, USD: 1_887 },
      });
      expect(blockFor(pulse, "UYU")?.overdueCritical30?.amount).toBe(17_080);
      expect(blockFor(pulse, "USD")?.overdueCritical30?.amount).toBe(1_887);
    });

    it("ingresos esperados = pendiente; separa al día vs en riesgo", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [makeRow({ company_id: "c1", debt_uyu: 100_000, total_debt: 100_000 })],
        gate: GATE_HIGH,
        carteraAgingOverdue: { UYU: 20_000, USD: 0 },
        carteraAgingCurrent: { UYU: 80_000, USD: 0 },
      });
      const uyu = blockFor(pulse, "UYU")!;
      expect(uyu.expectedIncome?.amount).toBe(100_000);
      expect(uyu.expectedIncomeCurrent?.amount).toBe(80_000);
      expect(uyu.expectedIncomeAtRisk?.amount).toBe(20_000);
    });

    it("allDebtorRows lista UYU y USD en filas separadas para un mismo cliente", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({
            company_id: "c1",
            name: "Mixto",
            debt_uyu: 50_000,
            debt_usd: 3_000,
            total_debt: 53_000,
          }),
        ],
        gate: GATE_HIGH,
      });
      expect(pulse.allDebtorRows).toHaveLength(2);
      expect(pulse.allDebtorRows.map((r) => r.currency).sort()).toEqual(["USD", "UYU"]);
    });

    it("allDebtorRows incluye todos los deudores; UI muestra 8 al inicio", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: Array.from({ length: 12 }, (_, i) =>
          makeRow({ company_id: `c${i}`, name: `C${i}`, debt_uyu: 10_000 * (i + 1), total_debt: 10_000 * (i + 1) })
        ),
        gate: GATE_HIGH,
      });
      expect(pulse.priorityCollections.length).toBeLessThanOrEqual(8);
      expect(pulse.allDebtorRows.length).toBe(12);
      expect(pulse.clientCounts.debtorClients).toBe(12);
      expect(pulse.clientCounts.debtorRows).toBe(12);
      expect(HOY_UI.initialDebtorTableRows).toBe(8);
    });

    it("debtorClients y attentionClients son conceptos distintos", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", debt_uyu: 5_000, overdue_debt: 0, risk: "Bajo" }),
          makeRow({
            company_id: "c2",
            debt_uyu: 10_000,
            overdue_uyu: 3_000,
            overdue_debt: 3_000,
            risk: "Medio",
          }),
        ],
        gate: GATE_HIGH,
      });
      expect(pulse.clientCounts.debtorClients).toBe(2);
      expect(pulse.clientCounts.attentionClients).toBe(1);
      expect(pulse.headline).toContain("Hay 2 clientes con deuda activa");
      expect(pulse.headline).toContain("atraso o señales de demora");
    });

    it("attentionClients incluye motivos y montos por moneda", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({
            company_id: "c1",
            name: "El País",
            debt_uyu: 58_560,
            overdue_uyu: 58_560,
            overdue_debt: 58_560,
            risk: "Alto",
            has_contact_data: false,
          }),
        ],
        gate: GATE_HIGH,
      });
      expect(pulse.attentionClients.total).toBe(1);
      expect(pulse.attentionClients.clients[0]!.motivos).toContain("Deuda vencida");
      expect(pulse.attentionClients.clients[0]!.motivos).toContain("Cobro lento");
      expect(pulse.attentionClients.clients[0]!.deuda_uyu?.amount).toBe(58_560);
    });

    it("labels de bloques sin términos técnicos prohibidos", () => {
      const forbidden = ["reconciliation", "pipeline", "sync", "orphan", "stale", "workflow", "aging"];
      const pulse = buildTodayBusinessPulse({
        snapshot: SNAPSHOT_ATTENTION,
        portfolioRows: [makeRow({ company_id: "c1", debt_uyu: 10_000, total_debt: 10_000 })],
        gate: GATE_HIGH,
        carteraPeriodMetrics: {
          billed: { UYU: 1, USD: 0 },
          collected: { UYU: 1, USD: 0 },
          pending: { UYU: 10_000, USD: 0 },
        },
      });
      const text = JSON.stringify(pulse.currencyBlocks).toLowerCase();
      for (const w of forbidden) {
        expect(text).not.toContain(w);
      }
    });
  });

  // ─ Data warning ────────────────────────────────────────────────────────────
  describe("data warning", () => {
    it("NO muestra warning con confidence medium (no es alarmista)", () => {
      const { dataWarning } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_MEDIUM });
      expect(dataWarning).toBeNull();
    });

    it("muestra warning con confidence low", () => {
      const { dataWarning } = buildTodayBusinessPulse({
        snapshot: null, portfolioRows: [],
        gate: { confidence: "low", coverage: "partial", recommendations_enabled: false },
      });
      expect(dataWarning).not.toBeNull();
    });

    it("warning no usa lenguaje técnico alarmista", () => {
      const { dataWarning } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_LOW });
      const alarmist = ["insuficientes", "error", "fallo", "crítico"];
      for (const word of alarmist) {
        expect(dataWarning?.toLowerCase()).not.toContain(word);
      }
    });
  });

  // ─ Alineación Hoy ↔ Cartera ────────────────────────────────────────────────
  //
  // Mapeo semántico validado:
  //   today.cobranzaPendiente.UYU ← Σ debt_uyu portfolio ≈ cartera pendingAtCutoff
  //   today.cobranzaPendiente.USD ← Σ debt_usd portfolio
  //   today.deudaVencida (Opción B) ← sumCarteraAgingOverdue(agingByCurrency) buckets 31_60+61_90+90_plus
  //   today.deudaArrastrada (Opción A) ← portfolio overdue cuando ≈ openingBalance (Anterior)
  //   today.cobrosNetos ← snapshot.realized.cash_net (acumulado histórico)
  //
  function mockAgingBuckets(uyuOverdue: number, usdOverdue: number) {
    const bucket = (amount: number): AgingBucket => ({
      range: "31_60",
      amount,
      invoiceCount: amount > 0 ? 1 : 0,
      clientCount: amount > 0 ? 1 : 0,
      percentage: 0,
      realDueDateCount: 0,
      syntheticDueDateCount: 0,
    });
    return {
      UYU: [bucket(uyuOverdue)],
      USD: [bucket(usdOverdue)],
    };
  }

  describe("alineación Hoy ↔ Cartera", () => {
    it("pendiente UYU en bloque = Σ debt_uyu portfolio", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 0, total_debt: 100_000 }),
        makeRow({ company_id: "c2", debt_uyu: 50_000, debt_usd: 0, total_debt: 50_000 }),
      ];
      const pulse = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      expect(blockFor(pulse, "UYU")?.pendingCurrent?.amount).toBe(150_000);
    });

    it("pendiente USD en bloque = Σ debt_usd portfolio", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 0, debt_usd: 5_000, total_debt: 5_000 }),
        makeRow({ company_id: "c2", debt_uyu: 0, debt_usd: 3_000, total_debt: 3_000 }),
      ];
      const pulse = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      expect(blockFor(pulse, "USD")?.pendingCurrent?.amount).toBe(8_000);
    });

    it("crítico +30 UYU = buckets 31+ (no Σ overdue_uyu)", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, overdue_uyu: 60_000, total_debt: 100_000, overdue_debt: 60_000 }),
      ];
      const aging = mockAgingBuckets(65_469, 0);
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: rows,
        gate: GATE_HIGH,
        carteraAgingOverdue: sumCarteraAgingOverdue(aging),
      });
      expect(blockFor(pulse, "UYU")?.overdueCritical30?.amount).toBe(65_469);
      expect(blockFor(pulse, "UYU")?.overdueCritical30?.amount).not.toBe(60_000);
    });

    it("caja actual usa tesorería real, no cobrado acumulado de cartera", () => {
      // carteraCollectedToDate (900_000) must NOT inflate availableCash.
      // Dinero disponible = pure treasury: openingBalance + manualIncome - manualExpense.
      const currencies = [
        {
          currencyCode: "UYU",
          issuedInPeriod: 500_000,
          collectedInPeriod: 900_000,
          pendingAtCutoff: 80_000,
        },
      ];
      const period = carteraPeriodMetricsFromReport(currencies);
      const toDate = carteraCollectedToDateFromReport(currencies);
      expect(period.collected.UYU).toBe(420_000);
      expect(toDate.UYU).toBe(900_000);

      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", debt_uyu: 80_000, debt_usd: 0, total_debt: 80_000 }),
        ],
        gate: GATE_HIGH,
        carteraPeriodMetrics: period,
        carteraCollectedToDate: toDate,
        treasuryCashPositions: [
          {
            currency: "UYU",
            openingConfigured: false,
            openingBalance: 0,
            collectedFromClients: 0,
            manualIncome: 10_000,
            manualExpense: 0,
            adjustments: 0,
            transfersNet: 0,
            availableCash: 10_000,
            currentCash: 10_000,
            movementsCount: 1,
            lastMovement: null,
          },
        ],
      });
      const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
      // carteraCollectedToDate must NOT be merged into availableCash
      expect(cash?.collectedFromClients).toBe(0);
      expect(cash?.availableCash).toBe(10_000);
    });

    it("cobrado aplicado alineado con Cartera (portfolioResolved, no collectedInPeriod bruto)", () => {
      const metrics = carteraPeriodMetricsFromReport([
        {
          currencyCode: "UYU",
          issuedInPeriod: 3_524_219.54,
          creditNoteAmount: 156_614.11,
          collectedInPeriod: 3_407_298,
          pendingAtCutoff: 170_944,
        },
        {
          currencyCode: "USD",
          issuedInPeriod: 82_944.2,
          creditNoteAmount: 19_214.6,
          collectedInPeriod: 57_151,
          pendingAtCutoff: 6_725.21,
        },
      ]);
      expect(metrics.billed.UYU).toBeCloseTo(3_367_605.43, 0);
      expect(metrics.billed.USD).toBeCloseTo(63_729.6, 0);
      expect(metrics.collected.UYU).toBeCloseTo(3_196_661.43, 0);
      expect(metrics.collected.USD).toBeCloseTo(57_004.39, 0);
      expect(metrics.pending.UYU).toBeCloseTo(170_944, 0);
      expect(metrics.pending.USD).toBeCloseTo(6_725.21, 0);

      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", debt_uyu: 170_944, debt_usd: 6_725.21, total_debt: 177_669.21 }),
        ],
        gate: GATE_HIGH,
        carteraPeriodMetrics: metrics,
      });
      const uyu = blockFor(pulse, "UYU");
      const usd = blockFor(pulse, "USD");
      expect(uyu?.collectedPeriod?.amount).toBeCloseTo(3_196_661.43, 0);
      expect(usd?.collectedPeriod?.amount).toBeCloseTo(57_004.39, 0);
      expect(uyu?.collectionRate).toBeCloseTo(0.949, 2);
      expect(usd?.collectionRate).toBeCloseTo(0.894, 2);
      expect(shouldShowCollectionExceedsBillingNote(uyu?.billedPeriod?.amount, uyu?.collectedPeriod?.amount)).toBe(
        false
      );
      expect(shouldShowCollectionExceedsBillingNote(usd?.billedPeriod?.amount, usd?.collectedPeriod?.amount)).toBe(
        false
      );
    });

    it("facturado/cobrado del período vienen de carteraPeriodMetrics (cobrado aplicado)", () => {
      const metrics = carteraPeriodMetricsFromReport([
        { currencyCode: "UYU", issuedInPeriod: 500_000, collectedInPeriod: 120_000, pendingAtCutoff: 80_000 },
        { currencyCode: "USD", issuedInPeriod: 20_000, collectedInPeriod: 8_000, pendingAtCutoff: 5_000 },
      ]);
      expect(metrics.collected.UYU).toBe(420_000);
      expect(metrics.collected.USD).toBe(15_000);
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", debt_uyu: 80_000, debt_usd: 5_000, total_debt: 85_000 }),
        ],
        gate: GATE_HIGH,
        carteraPeriodMetrics: metrics,
      });
      expect(blockFor(pulse, "UYU")?.billedPeriod?.amount).toBe(500_000);
      expect(blockFor(pulse, "UYU")?.collectedPeriod?.amount).toBe(420_000);
      expect(blockFor(pulse, "USD")?.collectedPeriod?.amount).toBe(15_000);
    });

    it("montos formateados con prefijo de moneda explícito", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 5_000, total_debt: 105_000 })],
        gate: GATE_HIGH,
      });
      for (const block of pulse.currencyBlocks) {
        for (const field of [
          block.pendingCurrent,
          block.overdueCritical30,
          block.expectedIncome,
        ]) {
          if (field) expect(field.formatted).toMatch(/^(UYU \$|USD U\$S)/);
        }
      }
    });
  });

  describe("contrato UI /copilot/hoy", () => {
    it("situación financiera no se muestra en hoy (evita duplicar bloques UYU/USD)", () => {
      expect(HOY_UI.showFinancialSituation).toBe(false);
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [makeRow({ company_id: "c1", debt_uyu: 50_000, total_debt: 50_000 })],
        gate: GATE_HIGH,
        carteraPeriodMetrics: {
          billed: { UYU: 100_000, USD: 0 },
          collected: { UYU: 80_000, USD: 0 },
          pending: { UYU: 50_000, USD: 0 },
        },
      });
      expect(pulse.financialSituation.length).toBeGreaterThan(0);
      expect(pulse.currencyBlocks.length).toBeGreaterThan(0);
    });

    it("label principal es Facturado neto del período, no bruto", () => {
      expect(CURRENCY_METRIC_LABELS.billed).toBe("Facturado neto del período");
      expect(CURRENCY_METRIC_LABELS.billed.toLowerCase()).not.toContain("bruto");
    });

    it("labels: período, Por cobrar, Atrasado +30 (no Crítico ni prioritario)", () => {
      expect(CURRENCY_METRIC_LABELS.billed).toBe("Facturado neto del período");
      expect(CURRENCY_METRIC_LABELS.collected).toBe("Cobrado en el período");
      expect(CURRENCY_METRIC_LABELS.pending).toBe("Por cobrar");
      expect(CURRENCY_METRIC_LABELS.overdue30).toBe("Saldo vencido >30 días");
      expect(CURRENCY_METRIC_LABELS.billed).not.toMatch(/bruto/i);
      expect(HOY_COPY.debtorsSectionTitle).toBe("Clientes con deuda");
      expect(HOY_COPY.debtorsSectionTitle.toLowerCase()).not.toContain("prioritario");
      expect(HOY_PAGE.title).toBe("Copilot · Hoy");
      expect(HOY_PAGE.title).not.toMatch(/pulso/i);
      expect(HOY_UI.showRecommendedActions).toBe(false);
      expect(HOY_UI.showPendingSection).toBe(false);
      expect(HOY_UI.initialDebtorTableRows).toBe(8);
    });

    it("cobrado mayor que facturado: nota explicativa, no error", () => {
      expect(shouldShowCollectionExceedsBillingNote(100, 150)).toBe(true);
      expect(shouldShowCollectionExceedsBillingNote(100, 80)).toBe(false);
      expect(COLLECTION_EXCEEDS_BILLING_NOTE).toContain("facturas anteriores");
    });

    it("semántica de color: facturado neutral, cobrado positive, pendiente warning, +30 danger", () => {
      expect(CURRENCY_METRIC_TONES.billed).toBe("neutral");
      expect(CURRENCY_METRIC_TONES.collected).toBe("positive");
      expect(CURRENCY_METRIC_TONES.pending).toBe("warning");
      expect(CURRENCY_METRIC_TONES.overdue30).toBe("danger");
    });

    it("aviso de datos usa copy informativo, no Actualización pendiente protagonista", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [],
        gate: { confidence: "low", coverage: "partial", recommendations_enabled: false },
      });
      expect(pulse.dataWarning).toContain("datos secundarios");
      expect(pulse.dataWarning).toContain("saldos principales");
      expect(pulse.dataWarning?.toLowerCase()).not.toMatch(/^actualización pendiente —/);
    });

    it("UYU y USD siguen en bloques separados sin mezclar", () => {
      const pulse = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", debt_uyu: 10_000, debt_usd: 1_000, total_debt: 11_000 }),
        ],
        gate: GATE_HIGH,
        carteraPeriodMetrics: {
          billed: { UYU: 100, USD: 200 },
          collected: { UYU: 50, USD: 100 },
          pending: { UYU: 10_000, USD: 1_000 },
        },
      });
      const currencies = pulse.currencyBlocks.map((b) => b.currency).sort();
      expect(currencies).toEqual(["USD", "UYU"]);
      for (const block of pulse.currencyBlocks) {
        expect(block.pendingCurrent?.currency).toBe(block.currency);
      }
    });
  });

  // ─ Tono cappado ────────────────────────────────────────────────────────────
  describe("capping de tono en estado healthy", () => {
    it("ningún indicador puede ser critical cuando el estado es healthy", () => {
      const { operationalIndicators, overallStatus } = buildTodayBusinessPulse({
        snapshot: SNAPSHOT_HEALTHY,
        portfolioRows: [makeRow({ company_id: "c1", total_debt: 10_000, overdue_debt: 0, risk: "Bajo" })],
        gate: GATE_HIGH,
      });
      expect(overallStatus).toBe("healthy");
      for (const ind of operationalIndicators) {
        expect(ind.tone).not.toBe("critical");
      }
    });
  });

  // ─ Helpers ────────────────────────────────────────────────────────────────
  describe("fmtCurrencyAmount", () => {
    it("formatea UYU con prefijo 'UYU $'", () => {
      expect(fmtCurrencyAmount(68_650, "UYU")).toMatch(/^UYU \$/);
    });

    it("formatea USD con prefijo 'USD U$S'", () => {
      expect(fmtCurrencyAmount(6_735, "USD")).toMatch(/^USD U\$S/);
    });
  });

  describe("resolveOverdueDisplaySemantics", () => {
    it("prioriza Aging de Cartera cuando carteraAgingOverdue está definido", () => {
      const sem = resolveOverdueDisplaySemantics({
        snapshot: null,
        portfolioRows: [
          makeRow({ company_id: "c1", overdue_uyu: 99_999, overdue_usd: 0, overdue_debt: 99_999, total_debt: 99_999 }),
        ],
        gate: GATE_HIGH,
        carteraAgingOverdue: { UYU: 12_000, USD: 0 },
      });
      expect(sem.mode).toBe("cartera_aging");
      expect(sem.debtLabel).toBe("deuda vencida");
      expect(sem.breakdown.find((m) => m.currency === "UYU")?.amount).toBe(12_000);
    });

    it("crítico +30 en bloque ≠ vencido por cliente; headline usa deuda activa", () => {
      const input: BusinessPulseInput = {
        snapshot: SNAPSHOT_ATTENTION,
        portfolioRows: [
          makeRow({
            company_id: "c1",
            name: "El País",
            debt_uyu: 58_560,
            overdue_uyu: 58_560,
            total_debt: 58_560,
            overdue_debt: 58_560,
            risk: "Medio",
          }),
        ],
        gate: GATE_HIGH,
        carteraAgingOverdue: { UYU: 17_080, USD: 1_887 },
      };
      const pulse = buildTodayBusinessPulse(input);
      expect(blockFor(pulse, "UYU")?.overdueCritical30?.amount).toBe(17_080);
      expect(pulse.headline.toLowerCase()).toContain("deuda activa");
      expect(pulse.allDebtorRows.find((r) => r.currency === "UYU")?.vencido?.amount).toBe(58_560);
      expect(pulse.allDebtorRows.every((r) => r.motivo.length > 0)).toBe(true);
    });

    it("no usa label vencida cuando el monto coincide con saldo anterior", () => {
      const sem = resolveOverdueDisplaySemantics({
        snapshot: null,
        portfolioRows: [
          makeRow({
            company_id: "c1",
            overdue_uyu: 65_469,
            overdue_usd: 3_181,
            overdue_debt: 68_650,
            total_debt: 68_650,
          }),
        ],
        gate: GATE_HIGH,
        carteraOpeningByCurrency: { UYU: 65_469, USD: 3_181 },
      });
      expect(sem.mode).toBe("opening_carry");
      expect(sem.debtLabel).toBe("deuda arrastrada");
    });

    it("UYU y USD en breakdown no se suman", () => {
      const sem = resolveOverdueDisplaySemantics({
        snapshot: null,
        portfolioRows: [],
        gate: GATE_HIGH,
        carteraAgingOverdue: { UYU: 100, USD: 200 },
      });
      expect(sem.breakdown).toHaveLength(2);
      expect(sem.breakdown[0]!.currency).toBe("UYU");
      expect(sem.breakdown[1]!.currency).toBe("USD");
    });
  });

  describe("buildBreakdown", () => {
    it("solo incluye monedas con monto > 0", () => {
      expect(buildBreakdown(100, 0)).toHaveLength(1);
      expect(buildBreakdown(0, 100)).toHaveLength(1);
      expect(buildBreakdown(100, 200)).toHaveLength(2);
      expect(buildBreakdown(0, 0)).toHaveLength(0);
    });

    it("UYU aparece antes que USD", () => {
      const bd = buildBreakdown(100, 200);
      expect(bd[0]!.currency).toBe("UYU");
      expect(bd[1]!.currency).toBe("USD");
    });
  });
});
