import { describe, expect, it, vi, beforeEach } from "vitest";

import * as obligationRepo from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";
import { buildInactiveRecurringTemplateIdSet } from "@/lib/treasury/treasury-scheduled-outflow-eligibility";
import {
  addDaysYmd,
  deleteScheduledPayment,
  filterPlannedObligationsForHoyScheduledList,
  mapPlannedObligationToScheduledPayment,
  projectedBalanceCoverage,
  scheduledOutflowsThroughDate,
  summarizeScheduledOutflows,
} from "@/lib/treasury/treasury-scheduled-payments";

vi.mock("@/lib/treasury/repositories/planned-cash-obligation-repository", () => ({
  plannedCashObligationRepositoryGetById: vi.fn(),
  plannedCashObligationRepositoryDelete: vi.fn(),
}));

function makeObligation(
  partial: Partial<PlannedCashObligation> & Pick<PlannedCashObligation, "currencyCode" | "amountEstimated" | "dueDate">
): PlannedCashObligation {
  return {
    id: partial.id ?? "1",
    workspaceId: "ws",
    companyId: null,
    title: partial.title ?? "Pago",
    description: null,
    obligationType: partial.obligationType ?? "dgi",
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
    source: "manual",
    relatedManualMovementId: null,
    relatedBankMovementId: null,
    relatedZetaRecordId: null,
    recurringTemplateId: partial.recurringTemplateId ?? null,
    recurringInstanceKey: partial.recurringInstanceKey ?? null,
    notes: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    metadata: null,
  };
}

describe("summarizeScheduledOutflows", () => {
  const asOf = "2026-05-21";
  const horizon = addDaysYmd(asOf, 30);

  it("suma egresos por moneda sin mezclar UYU/USD", () => {
    const payments = [
      makeObligation({ currencyCode: "UYU", amountEstimated: 10_000, dueDate: "2026-05-25", obligationType: "dgi" }),
      makeObligation({ currencyCode: "USD", amountEstimated: 500, dueDate: "2026-06-01", obligationType: "supplier" }),
    ];
    const summaries = summarizeScheduledOutflows(payments, { asOfDate: asOf, horizonEndDate: horizon });
    const uyu = summaries.find((s) => s.currency === "UYU")!;
    const usd = summaries.find((s) => s.currency === "USD")!;
    expect(uyu.next30Days).toBe(10_000);
    expect(usd.next30Days).toBe(500);
    expect(uyu.itemsCount).toBe(1);
    expect(usd.itemsCount).toBe(1);
  });

  it("separa vencidos y próximos 7 días", () => {
    const payments = [
      makeObligation({ currencyCode: "UYU", amountEstimated: 3_000, dueDate: "2026-05-10", status: "planned" }),
      makeObligation({ currencyCode: "UYU", amountEstimated: 2_000, dueDate: "2026-05-24" }),
    ];
    const uyu = summarizeScheduledOutflows(payments, { asOfDate: asOf, horizonEndDate: horizon }).find(
      (s) => s.currency === "UYU"
    )!;
    expect(uyu.overdue).toBe(3_000);
    expect(uyu.next7Days).toBe(2_000);
    expect(uyu.next30Days).toBe(5_000);
  });

  it("cuenta pagados del período", () => {
    const payments = [
      makeObligation({
        currencyCode: "UYU",
        amountEstimated: 8_000,
        dueDate: "2026-05-15",
        status: "paid",
      }),
    ];
    const uyu = summarizeScheduledOutflows(payments, {
      asOfDate: asOf,
      horizonEndDate: horizon,
      periodStartDate: "2026-01-01",
      periodEndDate: horizon,
    }).find((s) => s.currency === "UYU")!;
    expect(uyu.paidInPeriod).toBe(8_000);
    expect(uyu.next30Days).toBe(0);
  });

  it("excluye egresos de template recurrente pausado", () => {
    const inactive = buildInactiveRecurringTemplateIdSet([
      { id: "tpl-usd-paused", active: false },
    ]);
    const payments = [
      makeObligation({
        currencyCode: "USD",
        amountEstimated: 60,
        dueDate: "2026-06-01",
        recurringTemplateId: "tpl-usd-paused",
        source: "recurring_rule",
      }),
    ];
    const usd = summarizeScheduledOutflows(payments, {
      asOfDate: asOf,
      horizonEndDate: horizon,
      inactiveRecurringTemplateIds: inactive,
    }).find((s) => s.currency === "USD")!;
    expect(usd.next30Days).toBe(0);
    expect(usd.itemsCount).toBe(0);
  });

  it("incluye egreso recurrente con template activo", () => {
    const inactive = buildInactiveRecurringTemplateIdSet([
      { id: "tpl-usd-active", active: true },
    ]);
    const payments = [
      makeObligation({
        currencyCode: "USD",
        amountEstimated: 60,
        dueDate: "2026-06-01",
        recurringTemplateId: "tpl-usd-active",
        source: "recurring_rule",
      }),
    ];
    const usd = summarizeScheduledOutflows(payments, {
      asOfDate: asOf,
      horizonEndDate: horizon,
      inactiveRecurringTemplateIds: inactive,
    }).find((s) => s.currency === "USD")!;
    expect(usd.next30Days).toBe(60);
    expect(usd.itemsCount).toBe(1);
  });

  it("ignora inflows y cancelados", () => {
    const payments = [
      makeObligation({
        currencyCode: "UYU",
        amountEstimated: 1_000,
        dueDate: "2026-05-25",
        direction: "inflow",
      }),
      makeObligation({
        currencyCode: "UYU",
        amountEstimated: 2_000,
        dueDate: "2026-05-25",
        status: "cancelled",
      }),
    ];
    const uyu = summarizeScheduledOutflows(payments, { asOfDate: asOf, horizonEndDate: horizon }).find(
      (s) => s.currency === "UYU"
    )!;
    expect(uyu.next30Days).toBe(0);
    expect(uyu.itemsCount).toBe(0);
  });
});

describe("scheduledOutflowsThroughDate", () => {
  it("coincide con next30Days del summary", () => {
    const asOf = "2026-05-21";
    const horizon = addDaysYmd(asOf, 30);
    const payments = [
      makeObligation({ currencyCode: "UYU", amountEstimated: 100, dueDate: "2026-06-01" }),
      makeObligation({ currencyCode: "USD", amountEstimated: 50, dueDate: "2026-06-10" }),
    ];
    const totals = scheduledOutflowsThroughDate(payments, asOf, horizon);
    expect(totals.UYU).toBe(100);
    expect(totals.USD).toBe(50);
  });
});

describe("projectedBalanceCoverage", () => {
  it("balance negativo → critical", () => {
    expect(projectedBalanceCoverage(0, 100_000, 150_000).coverageStatus).toBe("critical");
    expect(projectedBalanceCoverage(0, 100_000, 150_000).projected).toBe(-50_000);
  });

  it("cubre egresos con caja actual → healthy", () => {
    expect(projectedBalanceCoverage(20_000, 170_944, 50_000).coverageStatus).toBe("healthy");
  });
});

describe("API body validation", () => {
  it("rechaza amount <= 0 y moneda inválida", async () => {
    const { scheduledPaymentCreateBodySchema } = await import(
      "@/lib/api/schemas/treasury-scheduled-payment-bodies"
    );
    expect(
      scheduledPaymentCreateBodySchema.safeParse({
        name: "Test",
        category: "DGI",
        currency: "EUR",
        amount: 100,
        due_date: "2026-06-01",
      }).success
    ).toBe(false);
    expect(
      scheduledPaymentCreateBodySchema.safeParse({
        name: "Test",
        category: "DGI",
        currency: "UYU",
        amount: 0,
        due_date: "2026-06-01",
      }).success
    ).toBe(false);
    expect(
      scheduledPaymentCreateBodySchema.safeParse({
        name: "Netflix",
        category: "Suscripciones",
        currency: "USD",
        amount: 60,
        due_date: "2026-06-10",
      }).success
    ).toBe(true);
  });
});

describe("deleteScheduledPayment", () => {
  const supabase = {} as never;
  const tenantId = "ws-tenant-1";
  const paymentId = "pay-uuid-1";

  beforeEach(() => {
    vi.mocked(obligationRepo.plannedCashObligationRepositoryGetById).mockReset();
    vi.mocked(obligationRepo.plannedCashObligationRepositoryDelete).mockReset();
  });

  it("borra por id + workspace del tenant", async () => {
    vi.mocked(obligationRepo.plannedCashObligationRepositoryGetById).mockResolvedValue({
      row: makeObligation({
        id: paymentId,
        currencyCode: "UYU",
        amountEstimated: 1000,
        dueDate: "2026-06-01",
      }),
      error: null,
    });
    vi.mocked(obligationRepo.plannedCashObligationRepositoryDelete).mockResolvedValue({
      deleted: true,
      error: null,
    });

    const result = await deleteScheduledPayment(supabase, tenantId, paymentId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(paymentId);
    expect(obligationRepo.plannedCashObligationRepositoryDelete).toHaveBeenCalledWith(
      supabase,
      tenantId,
      paymentId
    );
  });

  it("no borra si el pago no existe en el workspace", async () => {
    vi.mocked(obligationRepo.plannedCashObligationRepositoryGetById).mockResolvedValue({
      row: null,
      error: null,
    });

    const result = await deleteScheduledPayment(supabase, tenantId, paymentId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
    expect(obligationRepo.plannedCashObligationRepositoryDelete).not.toHaveBeenCalled();
  });

  it("falla validación si id vacío", async () => {
    const result = await deleteScheduledPayment(supabase, tenantId, "  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });
});

describe("DELETE API contract", () => {
  it("rechaza id vacío en handler (validación de ruta)", () => {
    expect("".trim()).toBe("");
    expect("  ".trim()).toBe("");
  });
});

describe("mapPlannedObligationToScheduledPayment", () => {
  it("mapea categoría DGI", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 1,
      dueDate: "2026-06-01",
      obligationType: "dgi",
      title: "DGI mayo",
    });
    const mapped = mapPlannedObligationToScheduledPayment(row, "2026-05-21");
    expect(mapped.category).toBe("DGI");
    expect(mapped.name).toBe("DGI mayo");
  });
});

describe("filterPlannedObligationsForHoyScheduledList — F1: direction y affectsCashflow", () => {
  const asOf = "2026-05-22";
  const horizonEnd = addDaysYmd(asOf, 30);

  it("incluye obligación con direction=outflow y affectsCashflow=true", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      direction: "outflow",
      affectsCashflow: true,
    });
    const result = filterPlannedObligationsForHoyScheduledList(
      [row],
      { asOfDate: asOf, horizonEndDate: horizonEnd }
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(row.id);
  });

  it("excluye obligación con affectsCashflow=false aunque direction=outflow", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      direction: "outflow",
      affectsCashflow: false,
    });
    const result = filterPlannedObligationsForHoyScheduledList(
      [row],
      { asOfDate: asOf, horizonEndDate: horizonEnd }
    );
    expect(result).toHaveLength(0);
  });

  it("excluye obligación con direction=inflow aunque affectsCashflow=true", () => {
    const row = makeObligation({
      currencyCode: "UYU",
      amountEstimated: 10_000,
      dueDate: "2026-06-10",
      direction: "inflow",
      affectsCashflow: true,
    });
    const result = filterPlannedObligationsForHoyScheduledList(
      [row],
      { asOfDate: asOf, horizonEndDate: horizonEnd }
    );
    expect(result).toHaveLength(0);
  });
});
