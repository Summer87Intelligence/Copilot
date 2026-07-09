import { describe, expect, it } from "vitest";

import {
  buildReconciliationSuggestionsForMovement,
  scoreBankMovementAgainstObligation,
  tokenizeReconciliationText,
} from "@/lib/bank-movements/bank-movement-reconciliation";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

function movement(partial: Partial<BankMovement> & Pick<BankMovement, "description" | "amount">): BankMovement {
  return {
    id: partial.id ?? "m1",
    workspace_id: "ws",
    import_id: null,
    bank_name: "Santander",
    account_label: "Santander 000001211749 UYU",
    movement_date: partial.movement_date ?? "2026-07-06",
    description: partial.description,
    raw_description: null,
    amount: partial.amount,
    currency: partial.currency ?? "UYU",
    direction: partial.direction ?? "outflow",
    bank_reference: partial.bank_reference ?? null,
    status: partial.status ?? "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

function obligation(
  partial: Partial<PlannedCashObligation> & Pick<PlannedCashObligation, "title" | "amountEstimated">
): PlannedCashObligation {
  return {
    id: partial.id ?? "o1",
    workspaceId: "ws",
    companyId: null,
    title: partial.title,
    description: partial.description ?? null,
    obligationType: partial.obligationType ?? "service",
    direction: partial.direction ?? "outflow",
    amountEstimated: partial.amountEstimated,
    amountFinal: null,
    currencyCode: partial.currencyCode ?? "UYU",
    dueDate: partial.dueDate ?? "2026-07-06",
    expectedPaymentDate: null,
    expectedSource: "bank",
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
    notes: partial.notes ?? null,
    createdBy: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    metadata: partial.metadata ?? null,
  };
}

describe("bank-movement-reconciliation engine", () => {
  it("Movistar exacto → high", () => {
    const result = scoreBankMovementAgainstObligation(
      movement({
        description: "MOVISTAR CEL MOVISTAR",
        amount: 3548,
        movement_date: "2026-07-06",
      }),
      obligation({
        title: "Movistar",
        description: "Celulares corporativos",
        amountEstimated: 3548,
        dueDate: "2026-07-06",
      })
    );
    expect(result?.confidence).toBe("high");
    expect(result?.score).toBeGreaterThanOrEqual(80);
  });

  it("BSE fecha cercana → medium/high", () => {
    const result = scoreBankMovementAgainstObligation(
      movement({
        description: "BSE SEG BANCO DE S",
        amount: 1375,
        movement_date: "2026-07-03",
      }),
      obligation({
        id: "bse",
        title: "BSE Seguro Accidentes",
        amountEstimated: 1375,
        dueDate: "2026-07-05",
      })
    );
    expect(result?.confidence === "high" || result?.confidence === "medium").toBe(true);
  });

  it("moneda distinta descarta", () => {
    const result = scoreBankMovementAgainstObligation(
      movement({ description: "MOVISTAR", amount: 100, currency: "USD" }),
      obligation({ title: "Movistar", amountEstimated: 100, currencyCode: "UYU" })
    );
    expect(result).toBeNull();
  });

  it("monto distinto fuerte descarta", () => {
    const result = scoreBankMovementAgainstObligation(
      movement({ description: "MOVISTAR", amount: 1000 }),
      obligation({ title: "Movistar", amountEstimated: 3548 })
    );
    expect(result).toBeNull();
  });

  it("McDonalds sin obligación → sin sugerencia", () => {
    const suggestions = buildReconciliationSuggestionsForMovement(
      movement({ description: "MCDONALDS LOCAL 123", amount: 184.32 }),
      [
        obligation({ id: "o2", title: "Movistar", amountEstimated: 3548 }),
        obligation({ id: "o3", title: "BSE Seguro", amountEstimated: 1375 }),
      ]
    );
    expect(suggestions).toHaveLength(0);
  });

  it("ordena por score descendente", () => {
    const suggestions = buildReconciliationSuggestionsForMovement(
      movement({
        description: "MOVISTAR CEL MOVISTAR",
        amount: 3548,
        movement_date: "2026-07-06",
      }),
      [
        obligation({
          id: "weak",
          title: "Proveedor varios",
          amountEstimated: 3548,
          dueDate: "2026-07-10",
          description: "Servicios varios",
        }),
        obligation({
          id: "strong",
          title: "Movistar",
          description: "Celulares corporativos",
          amountEstimated: 3548,
          dueDate: "2026-07-06",
        }),
      ]
    );
    expect(suggestions[0]?.target_id).toBe("strong");
    expect(suggestions[0]!.score).toBeGreaterThan(suggestions[1]?.score ?? 0);
  });

  it("ignora palabras genéricas", () => {
    const tokens = tokenizeReconciliationText("pago transferencia debito operacion banca digital");
    expect(tokens).toHaveLength(0);
  });
});
