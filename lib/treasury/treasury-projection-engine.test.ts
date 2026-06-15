import { describe, expect, it } from "vitest";

import { buildTreasuryProjectionHorizon } from "@/lib/treasury/treasury-projection-engine";
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

describe("buildTreasuryProjectionHorizon", () => {
  const asOfDate = "2026-06-15";

  it("resta instancia generada por recurrente, no el template", () => {
    const result = buildTreasuryProjectionHorizon({
      asOfDate,
      cashByCurrency: { USD: 10_000 },
      obligations: [
        obligation({
          id: "obl-rec",
          amountEstimated: 700,
          dueDate: "2026-06-20",
          source: "recurring_rule",
          recurringTemplateId: "tpl-1",
        }),
      ],
    });
    const usd = result.byCurrency.find((c) => c.currency === "USD");
    expect(usd?.scheduledOutflows).toBe(700);
    expect(usd?.recurringGeneratedOutflows).toBe(700);
    expect(usd?.projectedCash).toBe(9_300);
  });

  it("no resta instancia pagada ni cancelada", () => {
    const result = buildTreasuryProjectionHorizon({
      asOfDate,
      cashByCurrency: { UYU: 5_000 },
      obligations: [
        obligation({
          id: "paid",
          amountEstimated: 1_000,
          dueDate: "2026-06-18",
          currencyCode: "UYU",
          status: "paid",
        }),
        obligation({
          id: "cancelled",
          amountEstimated: 500,
          dueDate: "2026-06-20",
          currencyCode: "UYU",
          status: "cancelled",
        }),
        obligation({
          id: "pending",
          amountEstimated: 800,
          dueDate: "2026-06-22",
          currencyCode: "UYU",
          status: "planned",
        }),
      ],
    });
    const uyu = result.byCurrency.find((c) => c.currency === "UYU");
    expect(uyu?.scheduledOutflows).toBe(800);
    expect(uyu?.projectedCash).toBe(4_200);
  });

  it("mantiene UYU y USD separados", () => {
    const result = buildTreasuryProjectionHorizon({
      asOfDate,
      cashByCurrency: { UYU: 1_000, USD: 2_000 },
      obligations: [
        obligation({
          id: "uyu",
          amountEstimated: 100,
          dueDate: "2026-06-20",
          currencyCode: "UYU",
        }),
        obligation({
          id: "usd",
          amountEstimated: 200,
          dueDate: "2026-06-20",
          currencyCode: "USD",
        }),
      ],
    });
    expect(result.byCurrency).toHaveLength(2);
    expect(result.byCurrency.find((c) => c.currency === "UYU")?.projectedCash).toBe(900);
    expect(result.byCurrency.find((c) => c.currency === "USD")?.projectedCash).toBe(1_800);
  });

  it("no duplica obligación si aparece en más de un grupo", () => {
    const row = obligation({
      id: "dup",
      amountEstimated: 300,
      dueDate: "2026-06-25",
    });
    const result = buildTreasuryProjectionHorizon({
      asOfDate,
      cashByCurrency: { USD: 1_000 },
      obligations: [row, row],
    });
    expect(result.byCurrency[0]?.scheduledOutflows).toBe(300);
    expect(result.byCurrency[0]?.projectedCash).toBe(700);
  });

  it("incluye cobros esperados solo en projectedCashWithCollections", () => {
    const result = buildTreasuryProjectionHorizon({
      asOfDate,
      cashByCurrency: { USD: 1_000 },
      pendingReceivables: { USD: 500 },
      obligations: [
        obligation({ id: "p", amountEstimated: 400, dueDate: "2026-06-20" }),
      ],
    });
    const usd = result.byCurrency[0];
    expect(usd?.projectedCash).toBe(600);
    expect(usd?.projectedCashWithCollections).toBe(1_100);
  });
});
