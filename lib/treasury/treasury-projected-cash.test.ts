import { describe, expect, it } from "vitest";

import { buildTreasuryProjectedCashSnapshot } from "@/lib/treasury/treasury-projected-cash";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

function obligation(
  partial: Partial<PlannedCashObligation> & Pick<PlannedCashObligation, "id" | "dueDate" | "amountEstimated">
): PlannedCashObligation {
  return {
    id: partial.id,
    workspaceId: "ws",
    companyId: null,
    title: partial.title ?? "Pago",
    description: null,
    obligationType: partial.obligationType ?? "salary",
    direction: partial.direction ?? "outflow",
    amountEstimated: partial.amountEstimated,
    amountFinal: partial.amountFinal ?? null,
    currencyCode: partial.currencyCode ?? "USD",
    dueDate: partial.dueDate,
    expectedPaymentDate: null,
    expectedSource: "unknown",
    expectedAccountId: null,
    recurrence: "none",
    status: partial.status ?? "planned",
    priority: "medium",
    affectsCashflow: partial.affectsCashflow ?? true,
    reminderDaysBefore: [7, 3, 1],
    source: partial.source ?? "manual",
    relatedManualMovementId: null,
    relatedBankMovementId: null,
    relatedZetaRecordId: null,
    notes: null,
    metadata: partial.metadata ?? null,
    recurringTemplateId: partial.recurringTemplateId ?? null,
    recurringInstanceKey: partial.recurringInstanceKey ?? null,
    createdBy: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  };
}

describe("buildTreasuryProjectedCashSnapshot", () => {
  const asOfDate = "2026-06-15";

  it("resta pagos recurrentes generados dentro del horizonte 30d", () => {
    const recurring = obligation({
      id: "obl-rec-1",
      title: "Anna — Sueldo mensual",
      amountEstimated: 700,
      currencyCode: "USD",
      dueDate: "2026-07-03",
      source: "recurring_rule",
      recurringTemplateId: "tpl-anna",
      metadata: { recurring_instance_key: "tpl-anna:2026-07-03" },
    });

    const snapshot = buildTreasuryProjectedCashSnapshot({
      obligations: [recurring],
      overdue: [],
      upcoming30: [recurring],
      cashByCurrency: { USD: 10_000 },
      asOfDate,
    });

    expect(snapshot.committedTotals.USD).toBe(700);
    expect(snapshot.afterCommitments.USD).toBe(9_300);
    expect(snapshot.recurringItemsInHorizon).toBe(1);
  });

  it("no resta pagos pagados ni cancelados", () => {
    const paid = obligation({
      id: "obl-paid",
      amountEstimated: 500,
      dueDate: "2026-06-20",
      status: "paid",
    });
    const cancelled = obligation({
      id: "obl-cancel",
      amountEstimated: 300,
      dueDate: "2026-06-25",
      status: "cancelled",
    });

    const snapshot = buildTreasuryProjectedCashSnapshot({
      obligations: [paid, cancelled],
      overdue: [],
      upcoming30: [],
      cashByCurrency: { UYU: 5_000 },
      asOfDate,
    });

    expect(snapshot.committedTotals.UYU).toBe(0);
    expect(snapshot.afterCommitments.UYU).toBe(5_000);
  });

  it("deduplica si el mismo pago viene en overdue y upcoming30", () => {
    const row = obligation({
      id: "obl-dup",
      amountEstimated: 1_000,
      currencyCode: "UYU",
      dueDate: "2026-06-10",
      status: "planned",
    });

    const snapshot = buildTreasuryProjectedCashSnapshot({
      obligations: [row],
      overdue: [row],
      upcoming30: [row],
      cashByCurrency: { UYU: 8_000 },
      asOfDate,
    });

    expect(snapshot.committedTotals.UYU).toBe(1_000);
    expect(snapshot.afterCommitments.UYU).toBe(7_000);
  });
});
