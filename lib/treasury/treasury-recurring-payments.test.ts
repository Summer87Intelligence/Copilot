import { describe, expect, it } from "vitest";

import {
  buildRecurringInstanceKey,
  isRecurringGeneratedObligation,
} from "@/lib/treasury/treasury-recurring-payments";
import {
  createGeneratedObligation,
  generateUpcomingObligations,
  type PlannedCashObligationTemplate,
} from "@/lib/treasury/treasury-recurring-obligations";

function template(partial: Partial<PlannedCashObligationTemplate>): PlannedCashObligationTemplate {
  return {
    id: partial.id ?? "tpl-1",
    workspaceId: partial.workspaceId ?? "ws",
    title: partial.title ?? "Netflix",
    category: partial.category ?? "Suscripciones",
    currency: partial.currency ?? "USD",
    amount: partial.amount ?? 60,
    recurrenceType: partial.recurrenceType ?? "monthly",
    recurrenceInterval: partial.recurrenceInterval ?? 1,
    nextOccurrenceDate: partial.nextOccurrenceDate ?? "2026-06-10",
    autoGenerate: partial.autoGenerate ?? true,
    active: partial.active ?? true,
    metadata: partial.metadata ?? { direction: "expense" },
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

describe("treasury-recurring-payments", () => {
  it("buildRecurringInstanceKey es estable", () => {
    expect(buildRecurringInstanceKey("tpl-1", "2026-06-10")).toBe("tpl-1:2026-06-10");
  });

  it("Netflix mensual genera obligación con instance key", () => {
    const draft = createGeneratedObligation(template({}), "2026-06-10");
    expect(draft.recurringInstanceKey).toBe("tpl-1:2026-06-10");
    expect(draft.input.source).toBe("recurring_rule");
    expect(draft.input.direction).toBe("outflow");
    expect(draft.input.amountEstimated).toBe(60);
  });

  it("no duplica misma instancia en generateUpcomingObligations", () => {
    const drafts = generateUpcomingObligations({
      templates: [template({ nextOccurrenceDate: "2026-06-10" })],
      asOfDate: "2026-05-01",
      withinDays: 45,
    });
    const keys = drafts.map((d) => d.recurringInstanceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("plantilla pausada no genera obligaciones", () => {
    const drafts = generateUpcomingObligations({
      templates: [template({ active: false })],
      asOfDate: "2026-05-01",
      withinDays: 60,
    });
    expect(drafts.length).toBe(0);
  });

  it("isRecurringGeneratedObligation detecta source y template id", () => {
    expect(
      isRecurringGeneratedObligation({
        source: "recurring_rule",
        recurringTemplateId: "tpl-1",
      })
    ).toBe(true);
    expect(
      isRecurringGeneratedObligation({
        source: "manual",
        metadata: { recurring_instance_key: "tpl-1:2026-06-10" },
      })
    ).toBe(true);
  });
});
