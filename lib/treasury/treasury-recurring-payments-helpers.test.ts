import { describe, expect, it } from "vitest";
import {
  buildRecurringPausePayload,
  buildRecurringReactivatePayload,
  filterGeneratedPaymentsByTemplate,
  formatNextOccurrenceDisplay,
  formatRecurrenceFrequency,
  getObligationStatusLabel,
  getRecurringTemplateActions,
  filterVisibleRecurringTemplates,
  getRecurringTemplateStatusLabel,
  isRecurringTemplateDeleted,
} from "@/lib/treasury/treasury-recurring-payments-helpers";
import type { TreasuryRecurringPayment } from "@/lib/treasury/treasury-recurring-payments";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

function makeObligation(
  partial: Partial<PlannedCashObligation>
): PlannedCashObligation {
  const base: PlannedCashObligation = {
    id: "obl-1",
    workspaceId: "ws-1",
    companyId: null,
    title: "Pago",
    description: null,
    obligationType: "service",
    direction: "outflow",
    amountEstimated: 100,
    amountFinal: null,
    currencyCode: "UYU",
    dueDate: "2026-06-20",
    expectedPaymentDate: null,
    expectedSource: "unknown",
    expectedAccountId: null,
    recurrence: "none",
    status: "planned",
    priority: "medium",
    affectsCashflow: true,
    reminderDaysBefore: [],
    source: "recurring_rule",
    relatedManualMovementId: null,
    relatedBankMovementId: null,
    relatedZetaRecordId: null,
    recurringTemplateId: null,
    recurringInstanceKey: null,
    notes: null,
    createdBy: null,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    metadata: null,
  };
  return { ...base, ...partial };
}

describe("getRecurringTemplateActions", () => {
  it("active → edit, pause, view_payments, delete", () => {
    const actions = getRecurringTemplateActions({ active: true });
    expect(actions).toEqual(["edit", "pause", "view_payments", "delete"]);
  });

  it("paused → edit, reactivate, view_payments, delete", () => {
    const actions = getRecurringTemplateActions({ active: false });
    expect(actions).toEqual(["edit", "reactivate", "view_payments", "delete"]);
  });
});

describe("getRecurringTemplateStatusLabel", () => {
  it("active → 'Activo'", () => {
    expect(getRecurringTemplateStatusLabel({ active: true, autoGenerate: true })).toBe(
      "Activo"
    );
  });

  it("paused → 'Pausado'", () => {
    expect(getRecurringTemplateStatusLabel({ active: false, autoGenerate: true })).toBe(
      "Pausado"
    );
  });

  it("deleted → 'Eliminado'", () => {
    expect(getRecurringTemplateStatusLabel({ active: false, autoGenerate: false })).toBe(
      "Eliminado"
    );
  });
});

describe("isRecurringTemplateDeleted", () => {
  it("detects delete pattern (inactive + no auto-generate)", () => {
    expect(isRecurringTemplateDeleted({ active: false, autoGenerate: false })).toBe(true);
  });

  it("pause is not delete", () => {
    expect(isRecurringTemplateDeleted({ active: false, autoGenerate: true })).toBe(false);
  });
});

describe("filterVisibleRecurringTemplates", () => {
  const rows = [
    { id: "a", active: true, autoGenerate: true },
    { id: "b", active: false, autoGenerate: true },
    { id: "c", active: false, autoGenerate: false },
  ] as TreasuryRecurringPayment[];

  it("hides deleted templates", () => {
    const visible = filterVisibleRecurringTemplates(rows);
    expect(visible.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("formatRecurrenceFrequency", () => {
  it("monthly with day_of_month → 'Mensual día 20'", () => {
    expect(
      formatRecurrenceFrequency({
        recurrenceType: "monthly",
        recurrenceInterval: 1,
        metadata: { frequency: "monthly", day_of_month: 20 },
      })
    ).toBe("Mensual día 20");
  });

  it("yearly → 'Anual'", () => {
    expect(
      formatRecurrenceFrequency({
        recurrenceType: "yearly",
        recurrenceInterval: 1,
        metadata: { frequency: "yearly" },
      })
    ).toBe("Anual");
  });

  it("weekly → 'Semanal'", () => {
    expect(
      formatRecurrenceFrequency({
        recurrenceType: "custom",
        recurrenceInterval: 7,
        metadata: { frequency: "weekly" },
      })
    ).toBe("Semanal");
  });

  it("monthly without day_of_month → 'Mensual'", () => {
    expect(
      formatRecurrenceFrequency({
        recurrenceType: "monthly",
        recurrenceInterval: 1,
        metadata: {},
      })
    ).toBe("Mensual");
  });
});

describe("formatNextOccurrenceDisplay", () => {
  it("active with date → DD/MM/YYYY", () => {
    expect(
      formatNextOccurrenceDisplay({ active: true, nextOccurrenceDate: "2026-06-20" })
    ).toBe("20/06/2026");
  });

  it("paused → '—'", () => {
    expect(
      formatNextOccurrenceDisplay({ active: false, nextOccurrenceDate: "2026-06-20" })
    ).toBe("—");
  });

  it("active with empty date → '—'", () => {
    expect(
      formatNextOccurrenceDisplay({ active: true, nextOccurrenceDate: "" })
    ).toBe("—");
  });
});

describe("buildRecurringPausePayload", () => {
  it("returns { active: false }", () => {
    expect(buildRecurringPausePayload()).toEqual({ active: false });
  });
});

describe("buildRecurringReactivatePayload", () => {
  it("returns { active: true }", () => {
    expect(buildRecurringReactivatePayload()).toEqual({ active: true });
  });
});

describe("filterGeneratedPaymentsByTemplate", () => {
  const tplId = "tpl-abc";

  it("returns obligations matching recurringTemplateId", () => {
    const matching = makeObligation({ recurringTemplateId: tplId });
    const other = makeObligation({ id: "obl-2", recurringTemplateId: "tpl-other" });
    const result = filterGeneratedPaymentsByTemplate([matching, other], tplId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("obl-1");
  });

  it("resolves templateId from instance key fallback", () => {
    const obl = makeObligation({
      recurringTemplateId: null,
      recurringInstanceKey: `${tplId}:2026-06-20`,
    });
    const result = filterGeneratedPaymentsByTemplate([obl], tplId);
    expect(result).toHaveLength(1);
  });

  it("excludes obligations from other templates", () => {
    const obl = makeObligation({ recurringTemplateId: "tpl-other" });
    const result = filterGeneratedPaymentsByTemplate([obl], tplId);
    expect(result).toHaveLength(0);
  });

  it("includes paid obligations for history", () => {
    const paid = makeObligation({ recurringTemplateId: tplId, status: "paid" });
    const result = filterGeneratedPaymentsByTemplate([paid], tplId);
    expect(result).toHaveLength(1);
  });

  it("returns empty if templateId is empty", () => {
    const obl = makeObligation({ recurringTemplateId: tplId });
    const result = filterGeneratedPaymentsByTemplate([obl], "");
    expect(result).toHaveLength(0);
  });
});

describe("getObligationStatusLabel", () => {
  it.each([
    ["planned", "Pendiente"],
    ["confirmed", "Confirmado"],
    ["paid", "Pagado"],
    ["cancelled", "Cancelado"],
    ["overdue", "Vencido"],
  ] as const)("%s → %s", (status, label) => {
    expect(getObligationStatusLabel(status)).toBe(label);
  });
});
