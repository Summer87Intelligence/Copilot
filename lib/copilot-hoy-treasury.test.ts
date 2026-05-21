import { describe, expect, it } from "vitest";

import { buildTodayBusinessPulse } from "@/lib/copilot-today-business-pulse";
import {
  buildHoyTreasuryAlerts,
  buildTreasuryBlockExtensionAmounts,
} from "@/lib/copilot-hoy-treasury";
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

describe("Hoy × Tesorería", () => {
  const asOf = "2026-05-21";

  it("projectedBalance30d = pending − scheduledOutflows30d por moneda", () => {
    const summaries = summarizeScheduledOutflows(
      [makeObligation({ currencyCode: "UYU", amountEstimated: 40_000, dueDate: "2026-06-01" })],
      { asOfDate: asOf, horizonEndDate: "2026-06-20" }
    );
    const ext = buildTreasuryBlockExtensionAmounts({
      pending: 170_944,
      summary: summaries.find((s) => s.currency === "UYU") ?? null,
    });
    expect(ext.projectedBalance30d).toBe(130_944);
    expect(ext.scheduledOutflows30d).toBe(40_000);
  });

  it("sin egresos configurados → CTA y sin balance proyectado", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [makeRow()],
      gate: GATE,
      treasuryOutflowSummaries: [],
    });
    expect(pulse.treasuryOutflowsConfigured).toBe(false);
    expect(pulse.currencyBlocks[0]?.hasConfiguredOutflows).toBe(false);
    expect(pulse.currencyBlocks[0]?.projectedBalance30d).toBeNull();
    expect(pulse.treasuryAlerts.some((a) => a.id === "treasury_no_outflows")).toBe(true);
  });

  it("balance negativo → alerta critical", () => {
    const summaries = summarizeScheduledOutflows(
      [makeObligation({ currencyCode: "UYU", amountEstimated: 200_000, dueDate: "2026-06-01" })],
      { asOfDate: asOf, horizonEndDate: "2026-06-20" }
    );
    const alerts = buildHoyTreasuryAlerts({
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
    });
    const uyu = pulse.currencyBlocks.find((b) => b.currency === "UYU");
    const usd = pulse.currencyBlocks.find((b) => b.currency === "USD");
    expect(uyu?.scheduledOutflows30d?.currency).toBe("UYU");
    expect(usd?.scheduledOutflows30d?.currency).toBe("USD");
    expect(uyu?.scheduledOutflows30d?.amount).toBe(10_000);
    expect(usd?.scheduledOutflows30d?.amount).toBe(500);
  });
});
