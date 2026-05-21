import { describe, expect, it } from "vitest";

import { buildTodayBusinessPulse } from "@/lib/copilot-today-business-pulse";
import {
  buildHoyCashPositionBlocks,
  buildHoyTreasuryAlerts,
  buildTreasuryBlockExtensionAmounts,
} from "@/lib/copilot-hoy-treasury";
import { projectedCashBalance30d } from "@/lib/treasury/treasury-cash-position";
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
    notes: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    metadata: null,
  };
}

describe("Hoy × Tesorería — caja actual y proyección", () => {
  const asOf = "2026-05-21";

  it("caja proyectada = caja actual + por cobrar − pagos futuros", () => {
    expect(projectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
    const ext = buildTreasuryBlockExtensionAmounts({
      currentCash: 50_000,
      pending: 170_944,
      summary: summarizeScheduledOutflows(
        [makeObligation({ currencyCode: "UYU", amountEstimated: 40_000, dueDate: "2026-06-01" })],
        { asOfDate: asOf, horizonEndDate: "2026-06-20" }
      ).find((s) => s.currency === "UYU") ?? null,
    });
    expect(ext.projectedBalance30d).toBe(180_944);
  });

  it("sin saldo inicial configurado → openingConfigured false en bloques", () => {
    const blocks = buildHoyCashPositionBlocks({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          manualIncome: 1_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          currentCash: 1_000,
          movementsCount: 1,
          lastMovement: { date: "2026-05-01", concept: "Test" },
        },
      ],
      pendingByCurrency: { UYU: 0, USD: 0 },
      treasurySummaries: [],
    });
    expect(blocks[0]?.openingConfigured).toBe(false);
  });

  it("alerta caja inicial no configurada", () => {
    const alerts = buildHoyTreasuryAlerts({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: false,
          openingBalance: 0,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          currentCash: 0,
          movementsCount: 0,
          lastMovement: null,
        },
      ],
      summaries: [],
      pendingByCurrency: { UYU: 0, USD: 0 },
      overdueCritical30: { UYU: 0, USD: 0 },
    });
    expect(alerts.some((a) => a.id === "treasury_opening_missing")).toBe(true);
  });

  it("sin egresos configurados → CTA y sin balance proyectado", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [makeRow()],
      gate: GATE,
      treasuryOutflowSummaries: [],
      treasuryCashPositions: [],
    });
    expect(pulse.treasuryOutflowsConfigured).toBe(false);
    expect(pulse.currencyBlocks[0]?.hasConfiguredOutflows).toBe(false);
    expect(pulse.currencyBlocks[0]?.projectedBalance30d).toBeNull();
    expect(pulse.treasuryAlerts.some((a) => a.id === "treasury_no_outflows")).toBe(true);
  });

  it("caja proyectada negativa → alerta critical", () => {
    const summaries = summarizeScheduledOutflows(
      [makeObligation({ currencyCode: "UYU", amountEstimated: 200_000, dueDate: "2026-06-01" })],
      { asOfDate: asOf, horizonEndDate: "2026-06-20" }
    );
    const alerts = buildHoyTreasuryAlerts({
      cashPositions: [
        {
          currency: "UYU",
          openingConfigured: true,
          openingBalance: 10_000,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          currentCash: 10_000,
          movementsCount: 0,
          lastMovement: null,
        },
      ],
      summaries,
      pendingByCurrency: { UYU: 50_000, USD: 0 },
      overdueCritical30: { UYU: 10_000, USD: 0 },
    });
    expect(alerts.some((a) => a.id === "treasury_deficit_UYU")).toBe(true);
  });

  it("UYU y USD separados en pulse", () => {
    const summaries = summarizeScheduledOutflows(
      [
        makeObligation({ currencyCode: "UYU", amountEstimated: 10_000, dueDate: "2026-06-01" }),
        makeObligation({ currencyCode: "USD", amountEstimated: 500, dueDate: "2026-06-01" }),
      ],
      { asOfDate: asOf, horizonEndDate: "2026-06-20" }
    );
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [makeRow({ debt_uyu: 100_000, debt_usd: 5_000, total_debt: 105_000 })],
      gate: GATE,
      treasuryOutflowSummaries: summaries,
      treasuryCashPositions: [
        {
          currency: "UYU",
          openingConfigured: true,
          openingBalance: 0,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          currentCash: 0,
          movementsCount: 0,
          lastMovement: null,
        },
        {
          currency: "USD",
          openingConfigured: true,
          openingBalance: 1_000,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          currentCash: 1_000,
          movementsCount: 0,
          lastMovement: null,
        },
      ],
    });
    const uyu = pulse.currencyBlocks.find((b) => b.currency === "UYU");
    const usd = pulse.currencyBlocks.find((b) => b.currency === "USD");
    expect(uyu?.scheduledOutflows30d?.currency).toBe("UYU");
    expect(usd?.scheduledOutflows30d?.currency).toBe("USD");
    expect(uyu?.projectedBalance30d?.amount).toBe(90_000);
    expect(usd?.projectedBalance30d?.amount).toBe(5_500);
  });
});
