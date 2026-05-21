import { describe, expect, it } from "vitest";

import { evaluateTreasuryAlerts } from "@/lib/treasury/treasury-alerts";
import {
  effectivePlannedObligationStatus,
  filterOverdueObligations,
  isPlannedObligationOverdue,
} from "@/lib/treasury/treasury-obligation-status";
import { getManualCashImpact, getTreasuryProjection } from "@/lib/treasury/treasury-projection";
import {
  signedBankMovementAmount,
  signedManualCashAmount,
  signedPlannedObligationAmount,
} from "@/lib/treasury/treasury-sign";
import {
  assertSameTreasuryWorkspace,
  normalizeErpCompanyId,
  resolveTreasuryWorkspaceId,
} from "@/lib/treasury/treasury-tenant";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
} from "@/lib/treasury/treasury-types";
import {
  validateBankReconciliationMovementInput,
  validateManualCashMovementInput,
  validatePlannedCashObligationInput,
} from "@/lib/treasury/treasury-validation";

function manual(partial: Partial<ManualCashMovement>): ManualCashMovement {
  return {
    id: partial.id ?? "m1",
    workspaceId: partial.workspaceId ?? "ws-1",
    companyId: partial.companyId ?? null,
    accountId: partial.accountId ?? null,
    ledgerType: partial.ledgerType ?? "cash",
    movementType: partial.movementType ?? "expense",
    source: partial.source ?? "manual",
    concept: partial.concept ?? "Test",
    category: partial.category ?? null,
    amount: partial.amount ?? 100,
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
    description: partial.description ?? "Transfer",
    amount: partial.amount ?? 500,
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
    importedFrom: partial.importedFrom ?? "manual",
    importedAt: partial.importedAt ?? "2026-05-01T00:00:00Z",
    rawPayload: partial.rawPayload ?? null,
    notes: partial.notes ?? null,
    createdAt: partial.createdAt ?? "2026-05-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
  };
}

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
    expectedSource: partial.expectedSource ?? "bank",
    expectedAccountId: partial.expectedAccountId ?? null,
    recurrence: partial.recurrence ?? "none",
    status: partial.status ?? "planned",
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

describe("treasury tenant", () => {
  it("resuelve workspace_id desde tenantCompanyId", () => {
    expect(resolveTreasuryWorkspaceId(" 040321ff-10fd-4da3-aeca-f1865f879986 ")).toBe(
      "040321ff-10fd-4da3-aeca-f1865f879986"
    );
  });

  it("normaliza company_id ERP vacío a null", () => {
    expect(normalizeErpCompanyId("  ")).toBeNull();
    expect(normalizeErpCompanyId("250218923")).toBe("250218923");
  });

  it("rechaza account de otro workspace", () => {
    expect(() => assertSameTreasuryWorkspace("a", "b")).toThrow(/otro workspace/);
  });
});

describe("treasury sign", () => {
  it("income positivo y expense negativo", () => {
    expect(signedManualCashAmount({ movementType: "income", amount: 100 })).toBe(100);
    expect(signedManualCashAmount({ movementType: "expense", amount: 100 })).toBe(-100);
  });

  it("ajuste usa adjustment_direction", () => {
    expect(
      signedManualCashAmount({
        movementType: "adjustment",
        amount: 50,
        adjustmentDirection: "decrease",
      })
    ).toBe(-50);
  });

  it("transfer no impacta signo", () => {
    expect(signedManualCashAmount({ movementType: "transfer", amount: 100 })).toBe(0);
  });

  it("banco credit/debit", () => {
    expect(signedBankMovementAmount("credit", 10)).toBe(10);
    expect(signedBankMovementAmount("debit", 10)).toBe(-10);
  });

  it("obligación outflow negativa en proyección", () => {
    expect(signedPlannedObligationAmount("outflow", 100)).toBe(-100);
    expect(signedPlannedObligationAmount("inflow", 100)).toBe(100);
  });
});

describe("treasury validation", () => {
  it("rechaza monto no positivo", () => {
    const r = validateManualCashMovementInput({
      ledgerType: "cash",
      movementType: "income",
      concept: "Ingreso",
      amount: 0,
      currencyCode: "UYU",
      movementDate: "2026-05-01",
    });
    expect(r.ok).toBe(false);
  });

  it("exige adjustment_direction en ajustes", () => {
    const r = validateManualCashMovementInput({
      ledgerType: "cash",
      movementType: "adjustment",
      concept: "Ajuste",
      amount: 10,
      currencyCode: "UYU",
      movementDate: "2026-05-01",
    });
    expect(r.ok).toBe(false);
  });

  it("valida obligación futura", () => {
    const ok = validatePlannedCashObligationInput({
      title: "IVA",
      obligationType: "iva",
      amountEstimated: 1000,
      currencyCode: "UYU",
      dueDate: "2026-06-01",
    });
    expect(ok.ok).toBe(true);
  });

  it("valida movimiento bancario", () => {
    const ok = validateBankReconciliationMovementInput({
      movementDate: "2026-05-01",
      description: "Débito proveedor",
      amount: 250,
      currencyCode: "USD",
      movementType: "debit",
    });
    expect(ok.ok).toBe(true);
  });
});

describe("obligation status", () => {
  it("marca overdue en lectura", () => {
    expect(effectivePlannedObligationStatus("planned", "2026-05-01", "2026-05-10")).toBe(
      "overdue"
    );
    expect(isPlannedObligationOverdue(obligation({ dueDate: "2026-05-01" }), "2026-05-10")).toBe(
      true
    );
  });

  it("paid no aparece como pendiente", () => {
    const overdue = filterOverdueObligations(
      [obligation({ status: "paid", dueDate: "2026-01-01" })],
      "2026-05-10"
    );
    expect(overdue).toHaveLength(0);
  });
});

describe("treasury projection", () => {
  it("no duplica manual reconciliado con banco", () => {
    bank({ id: "b-rec", amount: 300, movementType: "debit" });
    const m = manual({
      id: "m-rec",
      amount: 300,
      reconciled: true,
      bankReconciliationId: "b-rec",
    });
    const impact = getManualCashImpact([m]);
    expect(impact.UYU ?? 0).toBe(0);
  });

  it("agrega proyección por moneda", () => {
    const snap = getTreasuryProjection({
      asOfDate: "2026-05-10",
      manualMovements: [manual({ movementType: "income", amount: 1000, currencyCode: "UYU" })],
      bankMovements: [bank({ amount: 200, movementType: "credit", currencyCode: "UYU" })],
      obligations: [
        obligation({
          dueDate: "2026-05-15",
          amountEstimated: 400,
          direction: "outflow",
          currencyCode: "UYU",
        }),
      ],
      obligationHorizonDays: 30,
    });
    const uyu = snap.buckets.find((b) => b.currencyCode === "UYU");
    expect(uyu?.manualNet).toBe(1000);
    expect(uyu?.bankNet).toBe(200);
    expect(uyu?.projectedNet).toBe(800);
  });
});

describe("treasury alerts", () => {
  it("emite alerta por obligación vencida", () => {
    const alerts = evaluateTreasuryAlerts({
      asOfDate: "2026-05-10",
      obligations: [obligation({ dueDate: "2026-05-01", title: "DGI" })],
      bankMovements: [],
    });
    expect(alerts.some((a) => a.kind === "obligation_overdue")).toBe(true);
  });
});
