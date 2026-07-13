import { describe, expect, it } from "vitest";

import {
  hoyItemsHorizonEndDate,
  mapRecurringDraftsToProjectedPayments,
  mergeScheduledPaymentsWithProjections,
} from "@/lib/hoy-recurring-projection";
import { createGeneratedObligation } from "@/lib/treasury/treasury-recurring-obligations";
import type { PlannedCashObligationTemplate } from "@/lib/treasury/treasury-recurring-obligations";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";
import { buildWeeklyCashProjection, nextFridaysAfterToday } from "@/lib/weekly-cash-projection";

function template(partial: Partial<PlannedCashObligationTemplate>): PlannedCashObligationTemplate {
  return {
    id: partial.id ?? "t1",
    workspaceId: partial.workspaceId ?? "ws-1",
    title: partial.title ?? "ZETA",
    category: partial.category ?? "Servicios",
    currency: partial.currency ?? "UYU",
    amount: partial.amount ?? 3_721,
    recurrenceType: partial.recurrenceType ?? "monthly",
    recurrenceInterval: partial.recurrenceInterval ?? 1,
    nextOccurrenceDate: partial.nextOccurrenceDate ?? "2026-08-05",
    autoGenerate: partial.autoGenerate ?? true,
    active: partial.active ?? true,
    metadata: partial.metadata ?? { direction: "expense" },
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

function scheduledPayment(partial: Partial<TreasuryScheduledPayment>): TreasuryScheduledPayment {
  return {
    id: partial.id ?? "real-1",
    workspaceId: partial.workspaceId ?? "ws-1",
    name: partial.name ?? "Pago real",
    category: partial.category ?? "Servicios",
    obligationType: partial.obligationType ?? "service",
    currency: partial.currency ?? "UYU",
    amount: partial.amount ?? 1000,
    dueDate: partial.dueDate ?? "2026-08-05",
    status: partial.status ?? "scheduled",
    recurrence: partial.recurrence ?? "none",
    source: partial.source ?? "manual",
    notes: partial.notes ?? null,
    paidAt: partial.paidAt ?? null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
    recurringCategoryLabel: partial.recurringCategoryLabel ?? null,
    isProjected: partial.isProjected,
  };
}

describe("hoyItemsHorizonEndDate", () => {
  it("suma 90 días", () => {
    expect(hoyItemsHorizonEndDate("2026-07-13")).toBe("2026-10-11");
  });

  it("cruza fin de mes/año correctamente", () => {
    expect(hoyItemsHorizonEndDate("2026-12-15")).toBe("2027-03-15");
  });
});

describe("mapRecurringDraftsToProjectedPayments", () => {
  it("mapea un draft de egreso a fila proyectada 'scheduled', nunca 'paid'", () => {
    const draft = createGeneratedObligation(template({ title: "ZETA" }), "2026-08-05");
    const rows = mapRecurringDraftsToProjectedPayments([draft]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("scheduled");
    expect(rows[0]?.isProjected).toBe(true);
    expect(rows[0]?.dueDate).toBe("2026-08-05");
    expect(rows[0]?.amount).toBe(3_721);
    expect(rows[0]?.currency).toBe("UYU");
  });

  it("excluye drafts de ingreso (direction income)", () => {
    const incomeTemplate = template({
      title: "Cobro recurrente",
      metadata: { direction: "income" },
    });
    const draft = createGeneratedObligation(incomeTemplate, "2026-08-05");
    expect(mapRecurringDraftsToProjectedPayments([draft])).toHaveLength(0);
  });

  it("conserva UYU y USD separados entre varios drafts", () => {
    const uyu = createGeneratedObligation(template({ id: "t-uyu", currency: "UYU" }), "2026-08-05");
    const usd = createGeneratedObligation(
      template({ id: "t-usd", title: "Micaela Navarra", currency: "USD", amount: 740 }),
      "2026-08-05"
    );
    const rows = mapRecurringDraftsToProjectedPayments([uyu, usd]);
    expect(rows.find((r) => r.currency === "UYU")?.amount).toBe(3_721);
    expect(rows.find((r) => r.currency === "USD")?.amount).toBe(740);
  });

  it("genera un id estable derivado de recurring_instance_key", () => {
    const draft = createGeneratedObligation(template({ id: "tpl-zeta" }), "2026-08-05");
    const rows = mapRecurringDraftsToProjectedPayments([draft]);
    expect(rows[0]?.id).toBe("recurring-projection:tpl-zeta:2026-08-05");
  });
});

describe("mergeScheduledPaymentsWithProjections", () => {
  it("agrega proyecciones cuando no hay colisión de id", () => {
    const materialized = [scheduledPayment({ id: "real-1", dueDate: "2026-07-20" })];
    const draft = createGeneratedObligation(template({ id: "tpl-1" }), "2026-08-05");
    const projected = mapRecurringDraftsToProjectedPayments([draft]);
    const merged = mergeScheduledPaymentsWithProjections(materialized, projected);
    expect(merged).toHaveLength(2);
  });

  it("no duplica si el id de la proyección ya está materializado", () => {
    const projectedId = "recurring-projection:tpl-1:2026-08-05";
    const materialized = [scheduledPayment({ id: projectedId, dueDate: "2026-08-05" })];
    const draft = createGeneratedObligation(template({ id: "tpl-1" }), "2026-08-05");
    const projected = mapRecurringDraftsToProjectedPayments([draft]);
    const merged = mergeScheduledPaymentsWithProjections(materialized, projected);
    expect(merged).toHaveLength(1);
  });
});

// ─── Integración con la proyección semanal (FASE 8: 8 recurrentes reales) ────

describe("integración: recurrentes proyectados en buildWeeklyCashProjection", () => {
  const TODAY = "2026-07-20";

  const RECURRENTES = [
    { id: "t-zeta", title: "ZETA", currency: "UYU" as const, amount: 3_721, due: "2026-08-05" },
    { id: "t-bse", title: "BSE", currency: "UYU" as const, amount: 1_375, due: "2026-08-05" },
    { id: "t-ana", title: "Ana Piriz", currency: "UYU" as const, amount: 27_509, due: "2026-08-05" },
    {
      id: "t-camila",
      title: "Camila Valentini",
      currency: "UYU" as const,
      amount: 45_321,
      due: "2026-08-05",
    },
    {
      id: "t-agustina",
      title: "Agustina Ottati",
      currency: "UYU" as const,
      amount: 35_984,
      due: "2026-08-05",
    },
    {
      id: "t-micaela",
      title: "Micaela Navarra",
      currency: "USD" as const,
      amount: 740,
      due: "2026-08-05",
    },
    {
      id: "t-maria",
      title: "María Taboada",
      currency: "USD" as const,
      amount: 1_300,
      due: "2026-08-05",
    },
    { id: "t-movistar", title: "Movistar", currency: "UYU" as const, amount: 3_548, due: "2026-08-06" },
  ];

  function projectedOutflows(): TreasuryScheduledPayment[] {
    const drafts = RECURRENTES.map((r) =>
      createGeneratedObligation(
        template({
          id: r.id,
          title: r.title,
          currency: r.currency,
          amount: r.amount,
          nextOccurrenceDate: r.due,
        }),
        r.due
      )
    );
    return mapRecurringDraftsToProjectedPayments(drafts);
  }

  /** Misma conversión que hace hoy-weekly-cash-projection.tsx: dueDate → date. */
  function toWeeklyCashEntries(payments: readonly TreasuryScheduledPayment[]) {
    return payments
      .filter((p) => p.status === "scheduled" || p.status === "overdue")
      .map((p) => ({ date: p.dueDate, currency: p.currency, amount: p.amount }));
  }

  it("punto 31/07: todavía no descuenta los pagos del 05/08–06/08", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 200_000,
      cashUsd: 5_000,
      outflows: toWeeklyCashEntries(projectedOutflows()),
      inflows: [],
      fxRate: 40,
      horizonEnd: "2026-07-31",
    });
    const last = rows[rows.length - 1]!;
    expect(last.uyu).toBe(200_000);
    expect(last.usd).toBe(5_000);
  });

  it("primer viernes en o después del 07/08: descuenta los 8 recurrentes por moneda", () => {
    const fridays = nextFridaysAfterToday(TODAY, 6);
    const targetFriday = fridays.find((f) => f >= "2026-08-07");
    expect(targetFriday).toBeDefined();

    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 200_000,
      cashUsd: 5_000,
      outflows: toWeeklyCashEntries(projectedOutflows()),
      inflows: [],
      fxRate: 40,
      horizonEnd: targetFriday,
    });
    const row = rows.find((r) => r.date === targetFriday)!;

    const expectedUyu = 200_000 - (3_721 + 1_375 + 27_509 + 45_321 + 35_984 + 3_548);
    const expectedUsd = 5_000 - (740 + 1_300);
    expect(row.uyu).toBe(expectedUyu);
    expect(row.usd).toBe(expectedUsd);
  });

  it("no hay doble conteo: 8 drafts → exactamente 8 filas proyectadas, sin repetir moneda cruzada", () => {
    const rows = mapRecurringDraftsToProjectedPayments(
      RECURRENTES.map((r) =>
        createGeneratedObligation(
          template({ id: r.id, title: r.title, currency: r.currency, amount: r.amount }),
          r.due
        )
      )
    );
    expect(rows).toHaveLength(8);
    const uyuTotal = rows.filter((r) => r.currency === "UYU").reduce((s, r) => s + r.amount, 0);
    const usdTotal = rows.filter((r) => r.currency === "USD").reduce((s, r) => s + r.amount, 0);
    expect(uyuTotal).toBe(3_721 + 1_375 + 27_509 + 45_321 + 35_984 + 3_548);
    expect(usdTotal).toBe(740 + 1_300);
  });
});
