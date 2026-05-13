import { describe, expect, it } from "vitest";

import { buildTreasuryAlerts } from "@/lib/treasury/treasury-alert-engine";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
} from "@/lib/treasury/treasury-types";

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
    dueDate: partial.dueDate ?? "2026-05-20",
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
    movementType: partial.movementType ?? "income",
    source: partial.source ?? "manual",
    concept: partial.concept ?? "Ingreso",
    category: partial.category ?? null,
    amount: partial.amount ?? 100_000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-01",
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

function bank(partial: Partial<BankReconciliationMovement>): BankReconciliationMovement {
  return {
    id: partial.id ?? "b1",
    workspaceId: partial.workspaceId ?? "ws-1",
    companyId: partial.companyId ?? null,
    accountId: partial.accountId ?? null,
    bankName: partial.bankName ?? "Santander",
    accountNumber: partial.accountNumber ?? null,
    accountName: partial.accountName ?? null,
    movementDate: partial.movementDate ?? "2026-05-01",
    description: partial.description ?? "Débito",
    amount: partial.amount ?? 1_000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementType: partial.movementType ?? "debit",
    externalId: partial.externalId ?? null,
    documentNumber: partial.documentNumber ?? null,
    balanceAfter: partial.balanceAfter ?? null,
    matched: partial.matched ?? false,
    matchStatus: partial.matchStatus ?? "unmatched",
    matchedSource: partial.matchedSource ?? "none",
    matchedRecordId: partial.matchedRecordId ?? null,
    confidence: partial.confidence ?? null,
    importedFrom: partial.importedFrom ?? "csv",
    importedAt: partial.importedAt ?? "2026-05-01T00:00:00Z",
    rawPayload: partial.rawPayload ?? null,
    notes: partial.notes ?? null,
    createdAt: partial.createdAt ?? "2026-05-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
  };
}

describe("treasury-alert-engine", () => {
  it("marca obligación vencida como critical", () => {
    const alerts = buildTreasuryAlerts({
      asOfDate: "2026-05-13",
      obligations: [obligation({ dueDate: "2026-05-10", status: "confirmed" })],
      manualMovements: [],
      bankMovements: [],
    });
    expect(alerts.some((alert) => alert.type === "overdue_obligation" && alert.severity === "critical")).toBe(
      true
    );
  });

  it("marca obligación <= 7 días como warning", () => {
    const alerts = buildTreasuryAlerts({
      asOfDate: "2026-05-13",
      obligations: [obligation({ dueDate: "2026-05-17", status: "confirmed" })],
      manualMovements: [],
      bankMovements: [],
    });
    expect(
      alerts.some((alert) => alert.type === "upcoming_obligation" && alert.severity === "warning")
    ).toBe(true);
  });

  it("alerta movimientos bancarios sin conciliar antiguos", () => {
    const alerts = buildTreasuryAlerts({
      asOfDate: "2026-05-20",
      obligations: [],
      manualMovements: [],
      bankMovements: [bank({ movementDate: "2026-05-01", matchStatus: "unmatched" })],
    });
    expect(alerts.some((alert) => alert.type === "unreconciled_bank_movements")).toBe(true);
  });

  it("alerta egresos próximos elevados", () => {
    const alerts = buildTreasuryAlerts({
      asOfDate: "2026-05-13",
      obligations: [obligation({ dueDate: "2026-05-20", amountEstimated: 80_000 })],
      manualMovements: [manual({ movementType: "income", amount: 100_000 })],
      bankMovements: [],
    });
    expect(alerts.some((alert) => alert.type === "high_upcoming_outflow")).toBe(true);
  });
});
