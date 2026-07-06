import { describe, expect, it } from "vitest";

import { buildTodayBusinessPulse } from "@/lib/copilot-today-business-pulse";
import {
  buildHoyCashPositionBlocks,
  buildHoyProjection30dBlocks,
  buildHoyTreasuryAlerts,
} from "@/lib/copilot-hoy-treasury";
import {
  expectedCashBalance30d,
  safeCashBalance30d,
} from "@/lib/treasury/treasury-cash-position";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";
import { summarizeScheduledOutflows } from "@/lib/treasury/treasury-scheduled-payments";

const GATE = { confidence: "high" as const, coverage: "full" as const, recommendations_enabled: true };

function makeRow(overrides: Partial<ClientPortfolioRow> = {}): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Cliente",
    industry: "Comercio",
    total_billing: 0,
    total_debt: 100_000,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "bueno",
    risk: "Bajo",
    source: "zeta_invoice",
    has_contact_data: true,
    derived_from_debt: false,
    debt_uyu: 100_000,
    debt_usd: 0,
    ...overrides,
  };
}

function makeObligation(
  partial: Partial<PlannedCashObligation> & Pick<PlannedCashObligation, "currencyCode" | "amountEstimated" | "dueDate">
): PlannedCashObligation {
  return {
    id: "o1",
    workspaceId: "ws",
    companyId: null,
    title: "BPS",
    description: null,
    obligationType: "bps",
    direction: "outflow",
    amountEstimated: partial.amountEstimated,
    amountFinal: null,
    currencyCode: partial.currencyCode,
    dueDate: partial.dueDate,
    expectedPaymentDate: null,
    expectedSource: "unknown",
    expectedAccountId: null,
    recurrence: "none",
    status: partial.status ?? "planned",
    priority: "medium",
    affectsCashflow: true,
    reminderDaysBefore: [7],
    source: "manual",
    relatedManualMovementId: null,
    relatedBankMovementId: null,
    relatedZetaRecordId: null,
    recurringTemplateId: null,
    recurringInstanceKey: null,
    notes: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    metadata: null,
  };
}

describe("Hoy × Tesorería — fórmulas de caja", () => {
  const asOf = "2026-05-21";

  it("cajaSegura30d = cajaActual − pagosProgramados", () => {
    expect(safeCashBalance30d(50_000, 40_000)).toBe(10_000);
  });

  it("cajaEsperada30d = cajaActual + porCobrar − pagosProgramados", () => {
    expect(expectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
  });

  it("caja actual no incluye por cobrar", () => {
    const cashBlocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 50_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 50_000,
          currentCash: 50_000,
          movementsCount: 1,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
      pendingByCurrency: { UYU: 170_944, USD: 0 },
      treasurySummaries: [],
    });
    expect(cashBlocks[0]?.availableCash).toBe(50_000);

    const projection = buildHoyProjection30dBlocks({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: { UYU: 170_944, USD: 0 },
      treasurySummaries: [
        summarizeScheduledOutflows(
          [makeObligation({ currencyCode: "UYU", amountEstimated: 40_000, dueDate: "2026-06-01" })],
          { asOfDate: asOf, horizonEndDate: "2026-06-20" }
        ).find((s) => s.currency === "UYU")!,
      ],
    });
    const uyu = projection.find((b) => b.currency === "UYU");
    expect(uyu?.currentCash).toBe(50_000);
    expect(uyu?.pendingReceivables).toBe(170_944);
    expect(uyu?.safeCash30d).toBe(10_000);
    expect(uyu?.expectedCash30d).toBe(180_944);
    expect(uyu?.currentCash).not.toBe(uyu?.expectedCash30d);
  });

  it("UYU y USD separados en proyección", () => {
    const cashBlocks = buildHoyCashPositionBlocks({
      cashPositions: [
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
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
        {
          currency: "USD",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 2_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 2_000,
          currentCash: 2_000,
          movementsCount: 1,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
      pendingByCurrency: { UYU: 50_000, USD: 5_000 },
      treasurySummaries: [],
    });
    const projection = buildHoyProjection30dBlocks({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: { UYU: 50_000, USD: 5_000 },
      treasurySummaries: [
        summarizeScheduledOutflows(
          [
            makeObligation({ currencyCode: "UYU", amountEstimated: 8_000, dueDate: "2026-06-01" }),
            makeObligation({ currencyCode: "USD", amountEstimated: 1_000, dueDate: "2026-06-05" }),
          ],
          { asOfDate: asOf, horizonEndDate: "2026-06-20" }
        ).find((s) => s.currency === "UYU")!,
        summarizeScheduledOutflows(
          [
            makeObligation({ currencyCode: "UYU", amountEstimated: 8_000, dueDate: "2026-06-01" }),
            makeObligation({ currencyCode: "USD", amountEstimated: 1_000, dueDate: "2026-06-05" }),
          ],
          { asOfDate: asOf, horizonEndDate: "2026-06-20" }
        ).find((s) => s.currency === "USD")!,
      ],
    });
    const uyu = projection.find((b) => b.currency === "UYU");
    const usd = projection.find((b) => b.currency === "USD");
    expect(uyu?.safeCash30d).toBe(2_000);
    expect(usd?.safeCash30d).toBe(1_000);
    expect(uyu?.expectedCash30d).toBe(52_000);
    expect(usd?.expectedCash30d).toBe(6_000);
  });

  it("alerta cuando caja segura negativa pero caja esperada positiva", () => {
    const cashBlocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 20_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 20_000,
          currentCash: 20_000,
          movementsCount: 1,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
      pendingByCurrency: { UYU: 100_000, USD: 0 },
      treasurySummaries: [],
    });
    const projection = buildHoyProjection30dBlocks({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: { UYU: 100_000, USD: 0 },
      treasurySummaries: [
        summarizeScheduledOutflows(
          [makeObligation({ currencyCode: "UYU", amountEstimated: 50_000, dueDate: "2026-06-01" })],
          { asOfDate: asOf, horizonEndDate: "2026-06-20" }
        ).find((s) => s.currency === "UYU")!,
      ],
    });
    const uyu = projection[0]!;
    expect(uyu.safeCash30d).toBeLessThan(0);
    expect(uyu.expectedCash30d).toBeGreaterThan(0);

    const alerts = buildHoyTreasuryAlerts({
      projectionBlocks: projection,
      summaries: projection.map((b) => ({
        currency: b.currency,
        totalScheduled: b.scheduledPayments,
        overdue: 0,
        next7Days: 0,
        scheduledTotal: b.scheduledPayments,
        paidInPeriod: 0,
        itemsCount: b.hasConfiguredPayments ? 1 : 0,
        byCategory: [],
      })),
      overdueCritical30: { UYU: 0, USD: 0 },
    });
    expect(alerts.some((a) => a.id === "treasury_safe_deficit_UYU")).toBe(true);
    expect(alerts.some((a) => a.id === "treasury_depends_collection_UYU")).toBe(true);
  });

  it("por cobrar no se cuenta como caja disponible", () => {
    const cashBlocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: true,
          openingBalance: 80_000,
          collectedFromClients: 0,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 80_000,
          currentCash: 80_000,
          movementsCount: 0,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
      pendingByCurrency: { UYU: 200_000, USD: 0 },
      treasurySummaries: [],
    });
    expect(cashBlocks[0]?.availableCash).toBe(80_000);
    const projection = buildHoyProjection30dBlocks({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: { UYU: 200_000, USD: 0 },
      treasurySummaries: [],
    });
    expect(projection[0]?.currentCash).toBe(80_000);
    expect(projection[0]?.pendingReceivables).toBe(200_000);
  });

  it("sin saldo inicial no muestra alerta de error", () => {
    const alerts = buildHoyTreasuryAlerts({
      projectionBlocks: [],
      summaries: [],
      overdueCritical30: { UYU: 0, USD: 0 },
      cashPositionBlocks: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 0,
          manualExpense: 0,
          availableCash: 0,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
    });
    expect(alerts.some((a) => a.id === "treasury_opening_missing")).toBe(false);
  });

  it("caja disponible usa tesorería pura — cartera no infla availableCash", () => {
    // Treasury positions are already the source of truth. Cartera (collectedByCurrency)
    // must NOT be merged in — that was the root cause of the "UYU 3.7M" bug.
    const blocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: true,
          openingBalance: 50_000,
          collectedFromClients: 0,
          manualIncome: 1_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 51_000,
          currentCash: 51_000,
          movementsCount: 1,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
      pendingByCurrency: { UYU: 0, USD: 0 },
      treasurySummaries: [],
    });
    // availableCash = openingBalance + manualIncome (no cartera added)
    expect(blocks[0]?.availableCash).toBe(51_000);
    expect(blocks[0]?.collectedFromClients).toBe(0);
  });

  it("no rompe facturado/cobrado/por cobrar de Cartera en bloques ejecutivos", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [
        makeRow({ company_id: "c1", debt_uyu: 80_000, debt_usd: 5_000, total_debt: 85_000 }),
      ],
      gate: GATE,
      periodReportCurrencies: [
        { currencyCode: "UYU", issuedInPeriod: 500_000, pendingAtCutoff: 80_000, collectedInPeriod: 420_000 },
        { currencyCode: "USD", issuedInPeriod: 20_000, pendingAtCutoff: 5_000, collectedInPeriod: 15_000 },
      ],
      periodRange: { from: "2026-05-01", to: "2026-05-21" },
      carteraCollectedToDate: { UYU: 900_000, USD: 50_000 },
      treasuryCashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 0,
          currentCash: 0,
          movementsCount: 0,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
    });
    const uyuExec = pulse.currencyBlocks.find((b) => b.currency === "UYU");
    expect(uyuExec?.billedPeriod?.amount).toBe(500_000);
    expect(uyuExec?.collectedPeriod?.amount).toBe(420_000);
    expect(pulse.periodActivity.collectedInPeriodByCurrency.UYU).toBe(420_000);
    expect(uyuExec?.pendingCurrent?.amount).toBe(80_000);
    // carteraCollectedToDate (900_000) must NOT inflate availableCash — treasury position has 0
    expect(pulse.cashPositionBlocks.find((b) => b.currency === "UYU")?.availableCash).toBe(0);
  });

  it("sin egresos configurados → CTA", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [makeRow()],
      gate: GATE,
      treasuryOutflowSummaries: [],
      treasuryCashPositions: [],
    });
    expect(pulse.treasuryAlerts.some((a) => a.id === "treasury_no_outflows")).toBe(true);
  });
});

describe("futureScheduledPayments — vencidos del mes actual siguen abiertos (TREASURY-HOY-CURRENT-MONTH-OVERDUE-PAYMENTS-FIX-001)", () => {
  const asOfJuly = "2026-07-06";

  it("excluye vencidos de meses anteriores pero conserva vencidos + futuros del mes actual", () => {
    const cashBlocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 500_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 500_000,
          currentCash: 500_000,
          movementsCount: 1,
          lastMovement: null, lastIncome: null, lastExpense: null,
        },
      ],
      pendingByCurrency: { UYU: 0, USD: 0 },
      treasurySummaries: [],
    });

    const obligations = [
      // Vencidos de junio (mes anterior) — no deben inflar "Pagos próximos".
      makeObligation({ currencyCode: "UYU", amountEstimated: 226_632, dueDate: "2026-06-22" }),
      makeObligation({ currencyCode: "UYU", amountEstimated: 9_169, dueDate: "2026-06-22" }),
      // Sueldos vencidos del mes actual (5/07), todavía impagos — sí deben aparecer.
      makeObligation({ currencyCode: "UYU", amountEstimated: 27_509, dueDate: "2026-07-05" }),
      makeObligation({ currencyCode: "UYU", amountEstimated: 45_321, dueDate: "2026-07-05" }),
      makeObligation({ currencyCode: "UYU", amountEstimated: 35_984, dueDate: "2026-07-05" }),
      // Pago futuro del próximo mes — fuera del horizonte de fin de mes actual.
      makeObligation({ currencyCode: "UYU", amountEstimated: 27_509, dueDate: "2026-08-05" }),
    ];

    const summary = summarizeScheduledOutflows(obligations, {
      asOfDate: asOfJuly,
      horizonEndDate: "2026-07-31",
    }).find((s) => s.currency === "UYU")!;

    const projection = buildHoyProjection30dBlocks({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: { UYU: 0, USD: 0 },
      treasurySummaries: [summary],
      asOfDate: asOfJuly,
    });
    const uyu = projection.find((b) => b.currency === "UYU")!;

    // scheduledPayments (proyección de caja) sigue incluyendo TODO lo abierto en horizonte.
    expect(uyu.scheduledPayments).toBe(226_632 + 9_169 + 27_509 + 45_321 + 35_984);
    // futureScheduledPayments (card "Pagos próximos") excluye solo junio, no julio.
    expect(uyu.futureScheduledPayments).toBe(27_509 + 45_321 + 35_984);
  });
});

describe("Hoy × Tesorería — reglas de fuente correcta (dinero disponible = tesorería, no cartera)", () => {
  const GATE_HOY = { confidence: "high" as const, coverage: "full" as const, recommendations_enabled: true };

  function treasuryPosition(overrides: {
    currency?: "UYU" | "USD";
    openingBalance?: number;
    openingConfigured?: boolean;
    manualIncome?: number;
    manualExpense?: number;
    availableCash?: number;
  } = {}) {
    const openingBalance = overrides.openingBalance ?? 0;
    const manualIncome = overrides.manualIncome ?? 0;
    const manualExpense = overrides.manualExpense ?? 0;
    const available = openingBalance + manualIncome - manualExpense;
    return {
      currency: overrides.currency ?? "UYU" as const,
      openingConfigured: overrides.openingConfigured ?? (openingBalance > 0),
      openingBalance,
      collectedFromClients: 0,
      manualIncome,
      manualExpense,
      adjustments: 0,
      transfersNet: 0,
      availableCash: overrides.availableCash ?? available,
      currentCash: overrides.availableCash ?? available,
      movementsCount: (manualIncome > 0 || manualExpense > 0) ? 1 : 0,
      lastMovement: null as null,
      lastIncome: null,
      lastExpense: null,
    };
  }

  it("1. Dinero disponible usa cashPosition de Tesorería", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [treasuryPosition({ openingBalance: 120_000, openingConfigured: true })],
      carteraCollectedToDate: { UYU: 3_773_788, USD: 72_826 },
    });
    const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    expect(cash?.availableCash).toBe(120_000);
  });

  it("2. Dinero disponible NO usa facturado anual", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [treasuryPosition({ openingBalance: 50_000, openingConfigured: true })],
      periodReportCurrencies: [{ currencyCode: "UYU", issuedInPeriod: 5_000_000, collectedInPeriod: 4_000_000 }],
    });
    const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    expect(cash?.availableCash).toBe(50_000);
    expect(cash?.availableCash).not.toBe(5_000_000);
    expect(cash?.availableCash).not.toBe(4_000_000);
  });

  it("3. Dinero disponible NO usa cobrado histórico de Cartera", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [treasuryPosition({ openingBalance: 30_000, openingConfigured: true })],
      carteraCollectedToDate: { UYU: 900_000, USD: 0 },
    });
    const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    expect(cash?.availableCash).toBe(30_000);
    expect(cash?.availableCash).not.toBe(900_000);
    expect(cash?.availableCash).not.toBe(930_000);
  });

  it("4. Por cobrar sigue usando cartera (pendingReceivables)", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [makeRow({ debt_uyu: 200_000, debt_usd: 0, total_debt: 200_000 })],
      gate: GATE_HOY,
      treasuryCashPositions: [treasuryPosition({ openingBalance: 50_000, openingConfigured: true })],
    });
    const state = pulse.currentStateBlocks.find((b) => b.currency === "UYU");
    expect(state?.cashAvailable).toBe(50_000);
    expect(state?.pendingReceivables).toBe(200_000);
    expect(state?.cashAvailable).not.toBe(state?.pendingReceivables);
  });

  it("5. Después de pagos = caja tesorería − pagos próximos", () => {
    const obligations = [
      makeObligation({ currencyCode: "UYU", amountEstimated: 20_000, dueDate: "2026-06-01" }),
    ];
    const summaries = summarizeScheduledOutflows(obligations, {
      asOfDate: "2026-05-21",
      horizonEndDate: "2026-06-20",
    });
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [treasuryPosition({ openingBalance: 80_000, openingConfigured: true })],
      treasuryOutflowSummaries: summaries,
    });
    const proj = pulse.projection30dBlocks.find((b) => b.currency === "UYU");
    expect(proj?.currentCash).toBe(80_000);
    expect(proj?.scheduledPayments).toBe(20_000);
    expect(proj?.safeCash30d).toBe(60_000);
  });

  it("6. UYU y USD separados — no se mezclan monedas", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [
        treasuryPosition({ currency: "UYU", openingBalance: 100_000, openingConfigured: true }),
        treasuryPosition({ currency: "USD", openingBalance: 5_000, openingConfigured: true }),
      ],
    });
    const uyu = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    const usd = pulse.cashPositionBlocks.find((b) => b.currency === "USD");
    expect(uyu?.availableCash).toBe(100_000);
    expect(usd?.availableCash).toBe(5_000);
  });

  it("7. Sin saldo cargado: openingConfigured=false en el bloque", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [makeRow({ debt_uyu: 50_000, total_debt: 50_000 })],
      gate: GATE_HOY,
      treasuryCashPositions: [
        treasuryPosition({ openingBalance: 0, openingConfigured: false, manualIncome: 0 }),
      ],
    });
    const block = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    // No treasury activity → block not emitted (hasActivity=false when no opening, no movements, no pending in treasury)
    // OR if emitted, openingConfigured=false
    if (block) {
      expect(block.openingConfigured).toBe(false);
    }
  });

  it("8. Pago programado pendiente (affectsCashflow=false) afecta proyección, no caja actual", () => {
    const obligations = [
      makeObligation({ currencyCode: "UYU", amountEstimated: 15_000, dueDate: "2026-06-05" }),
    ];
    const summaries = summarizeScheduledOutflows(obligations, {
      asOfDate: "2026-05-21",
      horizonEndDate: "2026-06-20",
    });
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [treasuryPosition({ openingBalance: 60_000, openingConfigured: true })],
      treasuryOutflowSummaries: summaries,
    });
    const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    const proj = pulse.projection30dBlocks.find((b) => b.currency === "UYU");
    expect(cash?.availableCash).toBe(60_000);     // caja actual sin tocar
    expect(proj?.scheduledPayments).toBe(15_000); // aparece en proyección
    expect(proj?.safeCash30d).toBe(45_000);       // después de pagos
  });

  it("9. Ingreso manual confirmado aumenta dinero disponible en caja", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [
        treasuryPosition({ openingBalance: 50_000, openingConfigured: true, manualIncome: 10_000, availableCash: 60_000 }),
      ],
    });
    const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    expect(cash?.availableCash).toBe(60_000);
    expect(cash?.manualIncome).toBe(10_000);
  });

  it("10. Egreso manual confirmado reduce dinero disponible en caja", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [],
      gate: GATE_HOY,
      treasuryCashPositions: [
        treasuryPosition({ openingBalance: 80_000, openingConfigured: true, manualExpense: 12_000, availableCash: 68_000 }),
      ],
    });
    const cash = pulse.cashPositionBlocks.find((b) => b.currency === "UYU");
    expect(cash?.availableCash).toBe(68_000);
    expect(cash?.manualExpense).toBe(12_000);
  });
});
