import { describe, expect, it } from "vitest";

import {
  buildTreasuryProjection,
  calculateProjectionRisk,
  calculateRunway,
} from "@/lib/treasury/treasury-cash-projection";
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
    title: partial.title ?? "Pago",
    description: partial.description ?? null,
    obligationType: partial.obligationType ?? "supplier",
    direction: partial.direction ?? "outflow",
    amountEstimated: partial.amountEstimated ?? 5_000,
    amountFinal: partial.amountFinal ?? null,
    currencyCode: partial.currencyCode ?? "UYU",
    dueDate: partial.dueDate ?? "2026-05-15",
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
    amount: partial.amount ?? 10_000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-10",
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
    movementDate: partial.movementDate ?? "2026-05-10",
    description: partial.description ?? "Crédito",
    amount: partial.amount ?? 2_000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementType: partial.movementType ?? "credit",
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

describe("treasury-cash-projection", () => {
  it("construye snapshots diarios y reduce caja por egreso confirmado", () => {
    const result = buildTreasuryProjection({
      asOfDate: "2026-05-10",
      horizonDays: 7,
      openingBalances: { UYU: 20_000 },
      manualMovements: [],
      bankMovements: [],
      obligations: [obligation({ dueDate: "2026-05-12", amountEstimated: 8_000 })],
    });
    expect(result.snapshots).toHaveLength(8);
    const day = result.snapshots.find((snapshot) => snapshot.date === "2026-05-12");
    expect(day?.projectedCashUyu).toBe(12_000);
  });

  it("excluye movimientos archivados y duplicados conciliados", () => {
    const linkedManual = manual({
      id: "m-linked",
      reconciled: true,
      bankReconciliationId: "b-linked",
      movementType: "expense",
      amount: 1_000,
    });
    const result = buildTreasuryProjection({
      asOfDate: "2026-05-10",
      horizonDays: 7,
      openingBalances: { UYU: 10_000 },
      manualMovements: [
        linkedManual,
        manual({ id: "m-archived", status: "archived", movementType: "expense", amount: 500 }),
      ],
      bankMovements: [
        bank({
          id: "b-linked",
          movementType: "debit",
          amount: 1_000,
          matchStatus: "matched",
          matchedSource: "manual_cash",
        }),
      ],
      obligations: [],
    });
    expect(result.snapshots[0]?.projectedCashUyu).toBe(10_000);
  });

  it("calcula runway y riesgo critical ante saldo negativo", () => {
    const snapshots = [
      {
        date: "2026-05-10",
        projectedCashUyu: 1_000,
        projectedCashUsd: 0,
        inflowsUyu: 0,
        outflowsUyu: 0,
        inflowsUsd: 0,
        outflowsUsd: 0,
      },
      {
        date: "2026-05-12",
        projectedCashUyu: -100,
        projectedCashUsd: 0,
        inflowsUyu: 0,
        outflowsUyu: 100,
        inflowsUsd: 0,
        outflowsUsd: 0,
      },
    ];
    const runway = calculateRunway(snapshots, "2026-05-10");
    const risk = calculateProjectionRisk({ runwayDays: runway, snapshots });
    expect(runway).toBe(2);
    expect(risk).toBe("critical");
  });
});
