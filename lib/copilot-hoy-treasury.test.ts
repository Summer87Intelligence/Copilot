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
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";
import { summarizeScheduledOutflows } from "@/lib/treasury/treasury-scheduled-payments";

const GATE = { confidence: "high" as const, coverage: "full" as const, recommendations_enabled: true };

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    company_id: "c1",
    name: "Cliente",
    total_debt: 100_000,
    overdue_debt: 0,
    risk: "Bajo" as const,
    payment_behavior: "normal" as const,
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
          lastMovement: null,
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
          lastMovement: null,
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
          lastMovement: null,
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
          lastMovement: null,
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
        next30Days: b.scheduledPayments,
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
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 80_000,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 80_000,
          currentCash: 80_000,
          movementsCount: 0,
          lastMovement: null,
        },
      ],
      collectedByCurrency: { UYU: 80_000, USD: 0 },
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
          lastMovement: null,
        },
      ],
    });
    expect(alerts.some((a) => a.id === "treasury_opening_missing")).toBe(false);
  });

  it("muestra cobrado por clientes en bloques de caja", () => {
    const blocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          collectedFromClients: 0,
          manualIncome: 1_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          availableCash: 1_000,
          currentCash: 1_000,
          movementsCount: 1,
          lastMovement: null,
        },
      ],
      collectedByCurrency: { UYU: 80_000, USD: 0 },
      pendingByCurrency: { UYU: 0, USD: 0 },
      treasurySummaries: [],
    });
    expect(blocks[0]?.collectedFromClients).toBe(80_000);
    expect(blocks[0]?.availableCash).toBe(81_000);
  });

  it("no rompe facturado/cobrado/por cobrar de Cartera en bloques ejecutivos", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [
        makeRow({ company_id: "c1", debt_uyu: 80_000, debt_usd: 5_000, total_debt: 85_000 }),
      ],
      gate: GATE,
      periodReportCurrencies: [
        { currencyCode: "UYU", issuedInPeriod: 500_000, collectedInPeriod: 420_000 },
        { currencyCode: "USD", issuedInPeriod: 20_000, collectedInPeriod: 15_000 },
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
          lastMovement: null,
        },
      ],
    });
    const uyuExec = pulse.currencyBlocks.find((b) => b.currency === "UYU");
    expect(uyuExec?.billedPeriod?.amount).toBe(500_000);
    expect(uyuExec?.collectedPeriod?.amount).toBe(420_000);
    expect(pulse.periodActivity.collectedInPeriodByCurrency.UYU).toBe(420_000);
    expect(uyuExec?.pendingCurrent?.amount).toBe(80_000);
    expect(pulse.cashPositionBlocks.find((b) => b.currency === "UYU")?.availableCash).toBe(900_000);
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
