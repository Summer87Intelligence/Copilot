import { describe, expect, it } from "vitest";

import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";
import {
  filterOverdueObligations,
  filterUpcomingObligations,
} from "@/lib/treasury/treasury-obligation-status";
import {
  buildInactiveRecurringTemplateIdSet,
  filterPlannedCashObligationsForScheduledOutflow,
  resolveRecurringTemplateId,
  shouldIncludePlannedObligationInScheduledOutflow,
} from "@/lib/treasury/treasury-scheduled-outflow-eligibility";

function makeObligation(
  partial: Partial<PlannedCashObligation> & Pick<PlannedCashObligation, "currencyCode" | "amountEstimated" | "dueDate">
): PlannedCashObligation {
  return {
    id: partial.id ?? "1",
    workspaceId: "ws",
    companyId: null,
    title: partial.title ?? "Pago",
    description: null,
    obligationType: partial.obligationType ?? "supplier",
    direction: partial.direction ?? "outflow",
    amountEstimated: partial.amountEstimated,
    amountFinal: partial.amountFinal ?? null,
    currencyCode: partial.currencyCode,
    dueDate: partial.dueDate,
    expectedPaymentDate: null,
    expectedSource: "unknown",
    expectedAccountId: null,
    recurrence: "none",
    status: partial.status ?? "planned",
    priority: "medium",
    affectsCashflow: partial.affectsCashflow ?? true,
    reminderDaysBefore: [7],
    source: partial.source ?? "manual",
    relatedManualMovementId: null,
    relatedBankMovementId: null,
    relatedZetaRecordId: null,
    recurringTemplateId: partial.recurringTemplateId ?? null,
    recurringInstanceKey: partial.recurringInstanceKey ?? null,
    notes: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    metadata: partial.metadata ?? null,
  };
}

describe("resolveRecurringTemplateId", () => {
  it("lee recurringTemplateId de columna", () => {
    const row = makeObligation({
      currencyCode: "USD",
      amountEstimated: 60,
      dueDate: "2026-06-01",
      recurringTemplateId: "tpl-usd-1",
    });
    expect(resolveRecurringTemplateId(row)).toBe("tpl-usd-1");
  });

  it("lee template id desde recurring_instance_key", () => {
    const row = makeObligation({
      currencyCode: "USD",
      amountEstimated: 60,
      dueDate: "2026-06-01",
      recurringInstanceKey: "tpl-usd-2:2026-06-01",
    });
    expect(resolveRecurringTemplateId(row)).toBe("tpl-usd-2");
  });
});

describe("shouldIncludePlannedObligationInScheduledOutflow", () => {
  const inactive = buildInactiveRecurringTemplateIdSet([
    { id: "tpl-paused", active: false },
  ]);

  it("incluye obligación sin template recurrente", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 1_000,
      dueDate: "2026-06-01",
    });
    expect(shouldIncludePlannedObligationInScheduledOutflow(row, inactive)).toBe(true);
  });

  it("excluye obligación con template pausado", () => {
    const row = makeObligation({
      currencyCode: "USD",
      amountEstimated: 60,
      dueDate: "2026-06-01",
      recurringTemplateId: "tpl-paused",
      source: "recurring_rule",
    });
    expect(shouldIncludePlannedObligationInScheduledOutflow(row, inactive)).toBe(false);
  });

  it("incluye obligación con template activo", () => {
    const row = makeObligation({
      currencyCode: "USD",
      amountEstimated: 60,
      dueDate: "2026-06-01",
      recurringTemplateId: "tpl-active",
      source: "recurring_rule",
    });
    expect(shouldIncludePlannedObligationInScheduledOutflow(row, inactive)).toBe(true);
  });
});

function makeInactiveSet(ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

describe("F2: filterUpcomingObligations con filtro de templates inactivos", () => {
  const asOf = "2026-05-22";
  const withinDays = 30;

  it("incluye obligación manual pending sin template recurrente", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      affectsCashflow: true,
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow([row]);
    const items = filterUpcomingObligations(eligible, asOf, withinDays);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(row.id);
  });

  it("incluye obligación de template activo (no en set inactivos)", () => {
    const row = makeObligation({
      currencyCode: "USD",
      amountEstimated: 60,
      dueDate: "2026-06-10",
      recurringTemplateId: "tpl-active",
      affectsCashflow: true,
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow(
      [row],
      makeInactiveSet([])
    );
    const items = filterUpcomingObligations(eligible, asOf, withinDays);
    expect(items).toHaveLength(1);
  });

  it("excluye obligación de template pausado", () => {
    const row = makeObligation({
      currencyCode: "USD",
      amountEstimated: 60,
      dueDate: "2026-06-10",
      recurringTemplateId: "tpl-paused",
      affectsCashflow: true,
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow(
      [row],
      makeInactiveSet(["tpl-paused"])
    );
    const items = filterUpcomingObligations(eligible, asOf, withinDays);
    expect(items).toHaveLength(0);
  });

  it("excluye obligación pagada aunque template esté activo", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      status: "paid",
      affectsCashflow: true,
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow([row]);
    const items = filterUpcomingObligations(eligible, asOf, withinDays);
    expect(items).toHaveLength(0);
  });

  it("excluye obligación cancelada", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      status: "cancelled",
      affectsCashflow: true,
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow([row]);
    const items = filterUpcomingObligations(eligible, asOf, withinDays);
    expect(items).toHaveLength(0);
  });

  it("excluye obligación con affectsCashflow=false", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      affectsCashflow: false,
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow([row]);
    const items = filterUpcomingObligations(eligible, asOf, withinDays);
    expect(items).toHaveLength(0);
  });
});

describe("F2: filterOverdueObligations con filtro de templates inactivos", () => {
  const asOf = "2026-05-22";

  it("incluye obligación vencida sin template", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-05-10",
      status: "planned",
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow([row]);
    const items = filterOverdueObligations(eligible, asOf);
    expect(items).toHaveLength(1);
  });

  it("excluye obligación vencida de template pausado", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-05-10",
      status: "planned",
      recurringTemplateId: "tpl-paused",
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow(
      [row],
      makeInactiveSet(["tpl-paused"])
    );
    const items = filterOverdueObligations(eligible, asOf);
    expect(items).toHaveLength(0);
  });

  it("excluye obligación vencida de template activo que está pagada", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-05-10",
      status: "paid",
    });
    const eligible = filterPlannedCashObligationsForScheduledOutflow([row]);
    const items = filterOverdueObligations(eligible, asOf);
    expect(items).toHaveLength(0);
  });
});
