import { describe, expect, it } from "vitest";

import {
  buildNextOccurrence,
  createGeneratedObligation,
  generateUpcomingObligations,
  type PlannedCashObligationTemplate,
} from "@/lib/treasury/treasury-recurring-obligations";

function template(partial: Partial<PlannedCashObligationTemplate>): PlannedCashObligationTemplate {
  return {
    id: partial.id ?? "t1",
    workspaceId: partial.workspaceId ?? "ws-1",
    title: partial.title ?? "BPS",
    category: partial.category ?? "bps",
    currency: partial.currency ?? "UYU",
    amount: partial.amount ?? 12_000,
    recurrenceType: partial.recurrenceType ?? "monthly",
    recurrenceInterval: partial.recurrenceInterval ?? 1,
    nextOccurrenceDate: partial.nextOccurrenceDate ?? "2026-05-15",
    autoGenerate: partial.autoGenerate ?? true,
    active: partial.active ?? true,
    metadata: partial.metadata ?? null,
    createdAt: partial.createdAt ?? "2026-05-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
  };
}

describe("treasury-recurring-obligations", () => {
  it("calcula próxima ocurrencia mensual", () => {
    expect(buildNextOccurrence("2026-05-15", "monthly", 1)).toBe("2026-06-15");
  });

  it("genera obligación desde plantilla", () => {
    const draft = createGeneratedObligation(template({}), "2026-05-20");
    expect(draft.input.source).toBe("recurring_rule");
    expect(draft.input.obligationType).toBe("bps");
    expect(draft.dueDate).toBe("2026-05-20");
  });

  it("genera próximas obligaciones dentro de ventana", () => {
    const drafts = generateUpcomingObligations({
      templates: [template({ nextOccurrenceDate: "2026-05-20" })],
      asOfDate: "2026-05-13",
      withinDays: 30,
    });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0]?.dueDate).toBe("2026-05-20");
  });
});
