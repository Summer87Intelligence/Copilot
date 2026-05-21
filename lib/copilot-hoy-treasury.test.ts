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
    recurringTemplateId: null,
    recurringInstanceKey: null,
    notes: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    metadata: null,
  };
}

describe("Hoy × Tesorería — caja disponible estimada", () => {
  const asOf = "2026-05-21";

  it("caja proyectada = available + por cobrar - pagos futuros", () => {
    expect(projectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
    const ext = buildTreasuryBlockExtensionAmounts({
      availableCash: 50_000,
      pending: 170_944,
      summary: summarizeScheduledOutflows(
        [makeObligation({ currencyCode: "UYU", amountEstimated: 40_000, dueDate: "2026-06-01" })],
        { asOfDate: asOf, horizonEndDate: "2026-06-20" }
      ).find((s) => s.currency === "UYU") ?? null,
    });
    expect(ext.projectedBalance30d).toBe(180_944);
  });

  it("sin saldo inicial no muestra alerta de error", () => {
    const alerts = buildHoyTreasuryAlerts({
      cashPositions: [
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
      summaries: [],
      pendingByCurrency: { UYU: 0, USD: 0 },
      overdueCritical30: { UYU: 0, USD: 0 },
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
