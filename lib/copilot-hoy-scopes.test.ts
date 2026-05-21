import { describe, expect, it } from "vitest";

import { buildTodayBusinessPulse } from "@/lib/copilot-today-business-pulse";
import { buildHoyPeriodActivity, operatingResultByCurrency } from "@/lib/copilot-hoy-scopes";
import { buildHoyCashPositionBlocks, buildHoyProjection30dBlocks as buildProj } from "@/lib/copilot-hoy-treasury";
import {
  expectedCashBalance30d,
  safeCashBalance30d,
} from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

const GATE = { confidence: "high" as const, coverage: "full" as const, recommendations_enabled: true };

function manual(partial: Partial<ManualCashMovement>): ManualCashMovement {
  return {
    id: "m1",
    workspaceId: "ws",
    companyId: null,
    concept: "Test",
    category: null,
    movementType: partial.movementType ?? "income",
    ledgerType: "cash",
    amount: partial.amount ?? 100,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-10",
    status: "active",
    affectsCashflow: true,
    accountId: null,
    notes: null,
    metadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("copilot-hoy-scopes — aislamiento período vs actual", () => {
  const periodReport = [
    {
      currencyCode: "UYU",
      issuedInPeriod: 500_000,
      creditNoteAmount: 0,
      collectedInPeriod: 120_000,
      pendingAtCutoff: 80_000,
    },
    {
      currencyCode: "USD",
      issuedInPeriod: 20_000,
      collectedInPeriod: 8_000,
      pendingAtCutoff: 5_000,
    },
  ];

  const periodRange = { from: "2026-05-01", to: "2026-05-21" };

  it("resultado operativo = cobrado + ingresos manuales - egresos manuales", () => {
    const activity = buildHoyPeriodActivity(periodRange, periodReport, [
      manual({ movementType: "income", amount: 5_000, movementDate: "2026-05-05" }),
      manual({ movementType: "expense", amount: 2_000, movementDate: "2026-05-08" }),
    ]);
    expect(activity.operatingResultByCurrency.UYU).toBe(123_000);
    expect(activity.collectedInPeriodByCurrency.UYU).toBe(120_000);
    expect(activity.manualIncomeByCurrency.UYU).toBe(5_000);
    expect(activity.manualExpenseByCurrency.UYU).toBe(2_000);
  });

  it("cambiar período cambia facturado/cobrado del período", () => {
    const narrow = buildHoyPeriodActivity(
      { from: "2026-05-01", to: "2026-05-10" },
      [{ currencyCode: "UYU", issuedInPeriod: 100_000, collectedInPeriod: 10_000 }],
      []
    );
    const wide = buildHoyPeriodActivity(
      { from: "2026-05-01", to: "2026-05-21" },
      [{ currencyCode: "UYU", issuedInPeriod: 500_000, collectedInPeriod: 120_000 }],
      []
    );
    expect(wide.billedNetByCurrency.UYU).toBeGreaterThan(narrow.billedNetByCurrency.UYU);
    expect(wide.collectedInPeriodByCurrency.UYU).toBeGreaterThan(
      narrow.collectedInPeriodByCurrency.UYU
    );
  });

  it("cambiar período NO cambia caja disponible ni proyección 30d", () => {
    const cashPositions = [
      {
        currency: "UYU" as const,
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
    ];
    const pending = { UYU: 170_944, USD: 0 };
    const summaries = [
      {
        currency: "UYU" as const,
        totalScheduled: 40_000,
        overdue: 0,
        next7Days: 10_000,
        next30Days: 40_000,
        paidInPeriod: 0,
        itemsCount: 1,
        byCategory: [],
      },
    ];

    const cashBlocks = buildHoyCashPositionBlocks({
      cashPositions,
      pendingByCurrency: pending,
      treasurySummaries: summaries,
    });

    const projA = buildProj({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: pending,
      treasurySummaries: summaries,
    });
    const projB = buildProj({
      cashPositionBlocks: cashBlocks,
      pendingByCurrency: pending,
      treasurySummaries: summaries,
    });

    expect(projA[0]?.currentCash).toBe(50_000);
    expect(projA[0]?.safeCash30d).toBe(projB[0]?.safeCash30d);
    expect(projA[0]?.expectedCash30d).toBe(projB[0]?.expectedCash30d);
    expect(safeCashBalance30d(50_000, 40_000)).toBe(10_000);
    expect(expectedCashBalance30d(50_000, 170_944, 40_000)).toBe(180_944);
  });

  it("buildTodayBusinessPulse: periodo aislado de carteraCollectedToDate", () => {
    const pulseA = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [
        {
          company_id: "c1",
          name: "A",
          total_debt: 100_000,
          overdue_debt: 0,
          risk: "Bajo",
          payment_behavior: "normal",
          has_contact_data: true,
          derived_from_debt: false,
          debt_uyu: 100_000,
          debt_usd: 0,
        },
      ],
      gate: GATE,
      carteraCollectedToDate: { UYU: 900_000, USD: 0 },
      periodRange: { from: "2026-05-01", to: "2026-05-10" },
      periodReportCurrencies: [{ currencyCode: "UYU", issuedInPeriod: 50_000, collectedInPeriod: 5_000 }],
      manualCashMovements: [],
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
          availableCash: 910_000,
          currentCash: 910_000,
          movementsCount: 0,
          lastMovement: null,
        },
      ],
      today: "2026-05-21",
    });

    const row = {
      company_id: "c1",
      name: "A",
      total_debt: 100_000,
      overdue_debt: 0,
      risk: "Bajo" as const,
      payment_behavior: "normal" as const,
      has_contact_data: true,
      derived_from_debt: false,
      debt_uyu: 100_000,
      debt_usd: 0,
    };
    const treasuryCash = [
      {
        currency: "UYU" as const,
        openingConfigured: false,
        openingBalance: 0,
        collectedFromClients: 0,
        manualIncome: 10_000,
        manualExpense: 0,
        adjustments: 0,
        transfersNet: 0,
        availableCash: 910_000,
        currentCash: 910_000,
        movementsCount: 0,
        lastMovement: null,
      },
    ];
    const pulseB = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [row],
      gate: GATE,
      carteraCollectedToDate: { UYU: 900_000, USD: 0 },
      periodRange: { from: "2026-05-01", to: "2026-05-21" },
      periodReportCurrencies: [
        { currencyCode: "UYU", issuedInPeriod: 500_000, collectedInPeriod: 120_000 },
      ],
      manualCashMovements: [],
      treasuryCashPositions: treasuryCash,
      today: "2026-05-21",
    });

    expect(pulseA.currentStateBlocks[0]?.cashAvailable).toBe(910_000);
    expect(pulseB.currentStateBlocks[0]?.cashAvailable).toBe(910_000);
    expect(pulseA.periodActivity.collectedInPeriodByCurrency.UYU).toBe(5_000);
    expect(pulseB.periodActivity.collectedInPeriodByCurrency.UYU).toBe(120_000);
    expect(pulseA.periodActivity.billedNetByCurrency.UYU).not.toBe(
      pulseB.periodActivity.billedNetByCurrency.UYU
    );
  });

  it("operatingResult UYU/USD separados", () => {
    const result = operatingResultByCurrency({
      collectedInPeriod: { UYU: 100, USD: 50 },
      manualIncome: { UYU: 10, USD: 5 },
      manualExpense: { UYU: 20, USD: 60 },
    });
    expect(result.UYU).toBe(90);
    expect(result.USD).toBe(-5);
  });
});
