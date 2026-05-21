import { describe, expect, it } from "vitest";
import { sumCarteraAgingOverdue } from "./copilot-cartera-aging-totals";
import type { AgingBucket } from "./copilot-financial-reconciliation";
import {
  buildTodayBusinessPulse,
  buildBreakdown,
  fmtCurrencyAmount,
  resolveOverdueDisplaySemantics,
  type BusinessPulseInput,
} from "./copilot-today-business-pulse";
import type { ClientPortfolioRow } from "./copilot-clients-portfolio";

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

    it("headline menciona deuda vencida", () => {
      const { headline } = buildTodayBusinessPulse(input);
      expect(headline.toLowerCase()).toContain("vencida");
    });

    it("indicador de deuda vencida tiene tone warning o critical", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const overdue = keyIndicators.find((i) => i.id === "overdue");
      expect(["warning", "critical"]).toContain(overdue?.tone);
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

    it("indicador de flujo tiene tone critical cuando es negativo", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const cash = keyIndicators.find((i) => i.id === "cash_flow");
      expect(cash?.tone).toBe("critical");
    });

    it("indicador de capacidad de pago tone critical cuando < 0.5", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const cov = keyIndicators.find((i) => i.id === "coverage");
      expect(cov?.tone).toBe("critical");
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

    it("accion del cliente alto riesgo con vencido menciona urgencia", () => {
      const { priorityCollections } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      expect(priorityCollections[0]!.accion.toLowerCase()).toContain("urgente");
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

    it("keyIndicators no contiene términos técnicos en label/helperText", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      for (const ind of keyIndicators) {
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

    it("siempre hay exactamente 6 keyIndicators", () => {
      expect(buildTodayBusinessPulse(input).keyIndicators).toHaveLength(6);
    });

    it("indicador de clientes se llama 'Clientes con atención', no 'Clientes activos'", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const clients = keyIndicators.find((i) => i.id === "clients");
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

    it("Capacidad de pago muestra 'Sin señales críticas' cuando no hay datos", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      const cov = keyIndicators.find((i) => i.id === "coverage");
      expect(cov?.value).toBe("Sin señales críticas");
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

    it("indicador cobranza pendiente tiene currencyValues con solo UYU", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const coll = keyIndicators.find((i) => i.id === "collections");
      expect(coll?.currencyValues).toHaveLength(1);
      expect(coll?.currencyValues?.[0]?.currency).toBe("UYU");
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

    it("indicador cobranza pendiente tiene currencyValues con solo USD", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const coll = keyIndicators.find((i) => i.id === "collections");
      expect(coll?.currencyValues).toHaveLength(1);
      expect(coll?.currencyValues?.[0]?.currency).toBe("USD");
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

    it("indicador cobranza pendiente tiene currencyValues con UYU y USD", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const coll = keyIndicators.find((i) => i.id === "collections");
      expect(coll?.currencyValues?.some((m) => m.currency === "UYU")).toBe(true);
      expect(coll?.currencyValues?.some((m) => m.currency === "USD")).toBe(true);
    });

    it("UYU y USD no se suman en currencyValues del indicador", () => {
      const { keyIndicators } = buildTodayBusinessPulse(input);
      const coll = keyIndicators.find((i) => i.id === "collections");
      // 2 entries: UYU 130_000 and USD 30_000 (total from both rows)
      expect(coll?.currencyValues).toHaveLength(2);
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
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const clients = keyIndicators.find((i) => i.id === "clients");
      // Only c1 has overdue → 1 client needs attention, not 3
      expect(clients?.value).toBe("1");
    });

    it("muestra 'Sin señales' cuando ningún cliente requiere atención", () => {
      const rows = [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 0, risk: "Bajo" }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const clients = keyIndicators.find((i) => i.id === "clients");
      expect(clients?.value).toBe("Sin señales");
    });

    it("tono ok cuando no hay clientes en atención", () => {
      const rows = [
        makeRow({ company_id: "c1", name: "A", total_debt: 100_000, overdue_debt: 0, risk: "Bajo" }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const clients = keyIndicators.find((i) => i.id === "clients");
      expect(clients?.tone).toBe("ok");
    });
  });

  // ─ Capacidad de pago ────────────────────────────────────────────────────────
  describe("capacidad de pago", () => {
    it("muestra ratio cuando hay datos", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: SNAPSHOT_HEALTHY, portfolioRows: [], gate: GATE_HIGH });
      const cov = keyIndicators.find((i) => i.id === "coverage");
      expect(cov?.value).toMatch(/×$/);
    });

    it("muestra 'Sin señales críticas' cuando no hay snapshot", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      const cov = keyIndicators.find((i) => i.id === "coverage");
      expect(cov?.value).toBe("Sin señales críticas");
    });

    it("tono neutral cuando no hay datos de coverage", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      const cov = keyIndicators.find((i) => i.id === "coverage");
      expect(cov?.tone).toBe("neutral");
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
    } as const;
  }

  describe("alineación Hoy ↔ Cartera", () => {
    it("cobranza pendiente UYU es la suma exacta de debt_uyu de los clientes", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 0, total_debt: 100_000 }),
        makeRow({ company_id: "c2", debt_uyu: 50_000, debt_usd: 0, total_debt: 50_000 }),
        makeRow({ company_id: "c3", debt_uyu: 0, debt_usd: 0, total_debt: 0 }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const coll = keyIndicators.find((i) => i.id === "collections")!;
      const uyuAmount = coll.currencyValues?.find((m) => m.currency === "UYU")?.amount;
      expect(uyuAmount).toBe(150_000); // 100k + 50k (c3 excluida: debt=0)
    });

    it("cobranza pendiente USD es la suma exacta de debt_usd de los clientes", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 0, debt_usd: 5_000, total_debt: 5_000 }),
        makeRow({ company_id: "c2", debt_uyu: 0, debt_usd: 3_000, total_debt: 3_000 }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const coll = keyIndicators.find((i) => i.id === "collections")!;
      const usdAmount = coll.currencyValues?.find((m) => m.currency === "USD")?.amount;
      expect(usdAmount).toBe(8_000); // 5k + 3k
    });

    it("sin Aging de Cartera: deuda vencida UYU = Σ overdue_uyu del portfolio", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 0, overdue_uyu: 60_000, overdue_usd: 0, total_debt: 100_000, overdue_debt: 60_000, risk: "Medio" }),
        makeRow({ company_id: "c2", debt_uyu: 80_000, debt_usd: 0, overdue_uyu: 40_000, overdue_usd: 0, total_debt: 80_000, overdue_debt: 40_000, risk: "Bajo" }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const overdue = keyIndicators.find((i) => i.id === "overdue")!;
      const uyuAmount = overdue.currencyValues?.find((m) => m.currency === "UYU")?.amount;
      expect(uyuAmount).toBe(100_000);
      expect(overdue.label).toBe("Deuda vencida");
    });

    it("con Aging de Cartera: card Deuda crítica +30 días UYU = buckets 31+ (no Σ overdue_uyu)", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 0, overdue_uyu: 60_000, overdue_usd: 0, total_debt: 100_000, overdue_debt: 60_000, risk: "Medio" }),
        makeRow({ company_id: "c2", debt_uyu: 80_000, debt_usd: 0, overdue_uyu: 40_000, overdue_usd: 0, total_debt: 80_000, overdue_debt: 40_000, risk: "Bajo" }),
      ];
      const aging = mockAgingBuckets(65_469, 0);
      const carteraAgingOverdue = sumCarteraAgingOverdue(aging);
      const { keyIndicators } = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: rows,
        gate: GATE_HIGH,
        carteraAgingOverdue,
      });
      const overdue = keyIndicators.find((i) => i.id === "overdue")!;
      const uyuAmount = overdue.currencyValues?.find((m) => m.currency === "UYU")?.amount;
      expect(uyuAmount).toBe(65_469);
      expect(uyuAmount).not.toBe(100_000);
      expect(overdue.label).toBe("Deuda crítica +30 días");
      expect(overdue.helperText.toLowerCase()).toContain("30");
      expect(overdue.helperText.toLowerCase()).toContain("atraso");
    });

    it("con Aging de Cartera: Deuda crítica +30 días USD = buckets 31+ por moneda", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 0, debt_usd: 10_000, overdue_uyu: 0, overdue_usd: 7_000, total_debt: 10_000, overdue_debt: 7_000, risk: "Alto" }),
        makeRow({ company_id: "c2", debt_uyu: 0, debt_usd: 5_000, overdue_uyu: 0, overdue_usd: 2_000, total_debt: 5_000, overdue_debt: 2_000, risk: "Bajo" }),
      ];
      const aging = mockAgingBuckets(0, 3_181);
      const { keyIndicators } = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: rows,
        gate: GATE_HIGH,
        carteraAgingOverdue: sumCarteraAgingOverdue(aging),
      });
      const overdue = keyIndicators.find((i) => i.id === "overdue")!;
      const usdAmount = overdue.currencyValues?.find((m) => m.currency === "USD")?.amount;
      expect(usdAmount).toBe(3_181);
      expect(usdAmount).not.toBe(9_000);
      expect(overdue.label).toBe("Deuda crítica +30 días");
    });

    it("si portfolio overdue ≈ saldo anterior: label Deuda arrastrada (no vencida)", () => {
      const rows = [
        makeRow({
          company_id: "c1",
          debt_uyu: 65_469,
          debt_usd: 3_181,
          overdue_uyu: 65_469,
          overdue_usd: 3_181,
          total_debt: 68_650,
          overdue_debt: 68_650,
          risk: "Medio",
        }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({
        snapshot: null,
        portfolioRows: rows,
        gate: GATE_HIGH,
        carteraOpeningByCurrency: { UYU: 65_469, USD: 3_181 },
      });
      const overdue = keyIndicators.find((i) => i.id === "overdue")!;
      expect(overdue.label).toBe("Deuda arrastrada");
      expect(overdue.label.toLowerCase()).not.toContain("vencida");
      expect(overdue.helperText.toLowerCase()).toContain("anterior");
    });

    it("UYU y USD en cobranza pendiente no se suman (2 entradas separadas)", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 5_000, total_debt: 105_000 }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const coll = keyIndicators.find((i) => i.id === "collections")!;
      // Must be 2 separate entries, never summed
      expect(coll.currencyValues).toHaveLength(2);
      const uyu = coll.currencyValues!.find((m) => m.currency === "UYU");
      const usd = coll.currencyValues!.find((m) => m.currency === "USD");
      expect(uyu?.amount).toBe(100_000);
      expect(usd?.amount).toBe(5_000);
    });

    it("indicador 'cash_flow' ya no se llama 'Flujo de caja' (renombrado a Cobros netos)", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: SNAPSHOT_HEALTHY, portfolioRows: [], gate: GATE_HIGH });
      const cashFlow = keyIndicators.find((i) => i.id === "cash_flow")!;
      expect(cashFlow.label).not.toBe("Flujo de caja");
      expect(cashFlow.label.toLowerCase()).toContain("cobros");
    });

    it("helperText de cobranza pendiente menciona 'hoy'", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: [], gate: GATE_HIGH });
      const coll = keyIndicators.find((i) => i.id === "collections")!;
      expect(coll.helperText.toLowerCase()).toContain("hoy");
    });

    it("helperText de deuda vencida (portfolio) menciona vencimiento", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 10_000, overdue_uyu: 5_000, total_debt: 10_000, overdue_debt: 5_000, risk: "Medio" }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      const overdue = keyIndicators.find((i) => i.id === "overdue")!;
      expect(overdue.helperText.toLowerCase()).toMatch(/vencim|hoy/);
    });

    it("helperText de cobros netos NO dice 'del período' (fuente es acumulada histórica)", () => {
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: SNAPSHOT_HEALTHY, portfolioRows: [], gate: GATE_HIGH });
      const cashFlow = keyIndicators.find((i) => i.id === "cash_flow")!;
      expect(cashFlow.helperText.toLowerCase()).not.toContain("del período");
    });

    it("todos los montos en currencyValues tienen formatted con moneda explícita (nunca $ solo)", () => {
      const rows = [
        makeRow({ company_id: "c1", debt_uyu: 100_000, debt_usd: 5_000, total_debt: 105_000, overdue_uyu: 50_000, overdue_usd: 2_000, overdue_debt: 52_000, risk: "Medio" }),
      ];
      const { keyIndicators } = buildTodayBusinessPulse({ snapshot: null, portfolioRows: rows, gate: GATE_HIGH });
      for (const ind of keyIndicators) {
        for (const m of ind.currencyValues ?? []) {
          // Must start with "UYU $" or "USD U$S", never bare "$"
          expect(m.formatted).toMatch(/^(UYU \$|USD U\$S)/);
        }
      }
    });
  });

  // ─ Tono cappado ────────────────────────────────────────────────────────────
  describe("capping de tono en estado healthy", () => {
    it("ningún indicador puede ser critical cuando el estado es healthy", () => {
      const { keyIndicators, overallStatus } = buildTodayBusinessPulse({
        snapshot: SNAPSHOT_HEALTHY,
        portfolioRows: [makeRow({ company_id: "c1", total_debt: 10_000, overdue_debt: 0, risk: "Bajo" })],
        gate: GATE_HIGH,
      });
      expect(overallStatus).toBe("healthy");
      for (const ind of keyIndicators) {
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

    it("card Aging usa label Deuda crítica +30 días; headline sigue deuda vencida", () => {
      const input: BusinessPulseInput = {
        snapshot: SNAPSHOT_ATTENTION,
        portfolioRows: [
          makeRow({
            company_id: "c1",
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
      const overdue = pulse.keyIndicators.find((i) => i.id === "overdue")!;
      expect(overdue.label).toBe("Deuda crítica +30 días");
      expect(overdue.currencyValues?.find((m) => m.currency === "UYU")?.amount).toBe(17_080);
      expect(pulse.headline.toLowerCase()).toContain("deuda vencida");
      expect(pulse.priorityCollections[0]!.vencido_breakdown[0]!.amount).toBe(58_560);
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
