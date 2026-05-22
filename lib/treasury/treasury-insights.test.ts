import { describe, expect, it } from "vitest";

import { buildTreasuryAlerts } from "@/lib/treasury/treasury-alert-engine";
import { buildTreasuryProjection } from "@/lib/treasury/treasury-cash-projection";
import { buildTreasuryInsights } from "@/lib/treasury/treasury-insights";
import type { ManualCashMovement, PlannedCashObligation } from "@/lib/treasury/treasury-types";

function obligation(partial: Partial<PlannedCashObligation>): PlannedCashObligation {
  return {
    id: partial.id ?? "o1",
    workspaceId: partial.workspaceId ?? "ws-1",
    companyId: partial.companyId ?? null,
    title: partial.title ?? "BPS",
    description: partial.description ?? null,
    obligationType: partial.obligationType ?? "bps",
    direction: partial.direction ?? "outflow",
    amountEstimated: partial.amountEstimated ?? 10_000,
    amountFinal: partial.amountFinal ?? null,
    currencyCode: partial.currencyCode ?? "UYU",
    dueDate: partial.dueDate ?? "2026-05-17",
    expectedPaymentDate: partial.expectedPaymentDate ?? null,
    expectedSource: partial.expectedSource ?? "unknown",
    expectedAccountId: partial.expectedAccountId ?? null,
    recurrence: partial.recurrence ?? "none",
    status: partial.status ?? "confirmed",
    priority: partial.priority ?? "medium",
    affectsCashflow: partial.affectsCashflow ?? true,
    reminderDaysBefore: partial.reminderDaysBefore ?? [7, 3, 1],
    source: partial.source ?? "manual",
    relatedManualMovementId: partial.relatedManualMovementId ?? null,
    relatedBankMovementId: partial.relatedBankMovementId ?? null,
    relatedZetaRecordId: partial.relatedZetaRecordId ?? null,
    recurringTemplateId: partial.recurringTemplateId ?? null,
    recurringInstanceKey: partial.recurringInstanceKey ?? null,
    notes: partial.notes ?? null,
    createdBy: partial.createdBy ?? null,
    createdAt: partial.createdAt ?? "2026-05-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
    metadata: partial.metadata ?? null,
  };
}

function manual(partial: Partial<ManualCashMovement>): ManualCashMovement {
  return {
    id: partial.id ?? "m1",
    workspaceId: partial.workspaceId ?? "ws-1",
    companyId: partial.companyId ?? null,
    accountId: partial.accountId ?? null,
    ledgerType: partial.ledgerType ?? "cash",
    movementType: partial.movementType ?? "expense",
    source: partial.source ?? "manual",
    concept: partial.concept ?? "Gasto",
    category: partial.category ?? null,
    amount: partial.amount ?? 1_000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-13",
    paymentMethod: partial.paymentMethod ?? null,
    counterparty: partial.counterparty ?? null,
    reference: partial.reference ?? null,
    notes: partial.notes ?? null,
    affectsCashflow: partial.affectsCashflow ?? true,
    reconciled: partial.reconciled ?? false,
    bankReconciliationId: partial.bankReconciliationId ?? null,
    status: partial.status ?? "active",
    createdBy: partial.createdBy ?? null,
    createdAt: partial.createdAt ?? "2026-05-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
    rawPayload: partial.rawPayload ?? null,
    metadata: partial.metadata ?? null,
  };
}

describe("treasury-insights", () => {
  it("genera insight de obligación próxima y liquidez", () => {
    const projection = buildTreasuryProjection({
      asOfDate: "2026-05-13",
      horizonDays: 30,
      openingBalances: { UYU: 20_000 },
      manualMovements: [],
      bankMovements: [],
      obligations: [obligation({ dueDate: "2026-05-17", amountEstimated: 12_000 })],
    });
    const alerts = buildTreasuryAlerts({
      asOfDate: "2026-05-13",
      obligations: [obligation({ dueDate: "2026-05-17", amountEstimated: 12_000 })],
      manualMovements: [],
      bankMovements: [],
      projection,
    });
    const insights = buildTreasuryInsights({
      asOfDate: "2026-05-13",
      alerts,
      projection,
      obligations: [obligation({ dueDate: "2026-05-17", amountEstimated: 12_000 })],
      manualMovements: [manual({ amount: 500 }), manual({ amount: 600 }), manual({ amount: 700 }), manual({ amount: 800 })],
      cashByCurrency: { UYU: 20_000 },
    });
    expect(insights.some((insight) => insight.title.includes("vence pronto"))).toBe(true);
    expect(insights.some((insight) => insight.title.includes("Compromisos"))).toBe(true);
  });
});
