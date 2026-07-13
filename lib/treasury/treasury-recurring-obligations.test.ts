import { describe, expect, it } from "vitest";

import {
  buildNextOccurrence,
  createGeneratedObligation,
  generateUpcomingObligations,
  mapCategoryToObligationType,
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

  it("Suscripciones → obligation_type service", () => {
    const draft = createGeneratedObligation(
      template({ title: "Claude", category: "Suscripciones" }),
      "2026-06-10"
    );
    expect(draft.input.obligationType).toBe("service");
    expect(draft.input.metadata?.recurring_category).toBe("Suscripciones");
  });

  it("Servicios → obligation_type service", () => {
    const draft = createGeneratedObligation(
      template({ title: "Cursor cuenta 2", category: "Servicios" }),
      "2026-06-10"
    );
    expect(draft.input.obligationType).toBe("service");
    expect(draft.input.metadata?.recurring_category).toBe("Servicios");
  });

  it("categoría desconocida → other", () => {
    expect(mapCategoryToObligationType("Categoría rara XYZ")).toBe("other");
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

  it("respeta metadata.ends_on al generar", () => {
    const drafts = generateUpcomingObligations({
      templates: [
        template({
          nextOccurrenceDate: "2026-05-20",
          metadata: { ends_on: "2026-05-20" },
        }),
      ],
      asOfDate: "2026-05-01",
      withinDays: 90,
    });
    expect(drafts.map((d) => d.dueDate)).toEqual(["2026-05-20"]);
  });

  it("Impuestos → obligation_type tax", () => {
    expect(mapCategoryToObligationType("Impuestos")).toBe("tax");
  });

  describe("FIX-HOY-RECURRING-PAYMENTS-PROJECTION-001", () => {
    it("recurrente pausado (active: false) no genera drafts", () => {
      const drafts = generateUpcomingObligations({
        templates: [template({ nextOccurrenceDate: "2026-08-05", active: false })],
        asOfDate: "2026-07-13",
        withinDays: 90,
      });
      expect(drafts).toHaveLength(0);
    });

    it("recurrente cancelado (active: false, autoGenerate: false) no genera drafts", () => {
      const drafts = generateUpcomingObligations({
        templates: [
          template({ nextOccurrenceDate: "2026-08-05", active: false, autoGenerate: false }),
        ],
        asOfDate: "2026-07-13",
        withinDays: 90,
      });
      expect(drafts).toHaveLength(0);
    });

    it("recurrente con autoGenerate desactivado (pero active: true) no genera drafts", () => {
      const drafts = generateUpcomingObligations({
        templates: [
          template({ nextOccurrenceDate: "2026-08-05", active: true, autoGenerate: false }),
        ],
        asOfDate: "2026-07-13",
        withinDays: 90,
      });
      expect(drafts).toHaveLength(0);
    });

    it("Tesorería y Hoy comparten el mismo motor: el draft respeta next_occurrence_date de la plantilla", () => {
      // Mismos 8 recurrentes reales del caso: ejemplo ZETA con próximo 05/08/2026.
      // asOfDate dentro del mismo mes del ciclo (ago) para no disparar la
      // recuperación de gap mensual (comportamiento preexistente e
      // intencional de generateUpcomingObligations, no forma parte de este fix).
      const drafts = generateUpcomingObligations({
        templates: [
          template({
            id: "tpl-zeta",
            title: "ZETA",
            category: "Servicios",
            currency: "UYU",
            amount: 3_721,
            nextOccurrenceDate: "2026-08-05",
          }),
        ],
        asOfDate: "2026-08-01",
        withinDays: 90,
      });
      expect(drafts).toHaveLength(1);
      expect(drafts[0]?.dueDate).toBe("2026-08-05");
      expect(drafts[0]?.input.amountEstimated).toBe(3_721);
    });
  });

  describe("TREASURY-RECURRING-CURRENT-MONTH-LATE-INSTANCE-FIX-001", () => {
    it("Caso A: día del mes aún no llegó → genera la instancia pendiente del mes actual", () => {
      const drafts = generateUpcomingObligations({
        templates: [template({ nextOccurrenceDate: "2026-07-06" })],
        asOfDate: "2026-07-01",
        withinDays: 30,
      });
      expect(drafts.map((d) => d.dueDate)).toEqual(["2026-07-06"]);
    });

    it("Caso B: día del mes ya pasó → genera solo la instancia atrasada, no salta al mes siguiente", () => {
      const drafts = generateUpcomingObligations({
        templates: [template({ nextOccurrenceDate: "2026-07-06" })],
        asOfDate: "2026-07-08",
        withinDays: 30,
      });
      expect(drafts.map((d) => d.dueDate)).toEqual(["2026-07-06"]);
    });

    it("Caso E: puntero ya avanzado más allá del mes actual → recupera el gap sin duplicar meses futuros", () => {
      const drafts = generateUpcomingObligations({
        templates: [template({ nextOccurrenceDate: "2026-09-06" })],
        asOfDate: "2026-07-08",
        withinDays: 30,
      });
      expect(drafts.map((d) => d.dueDate)).toEqual(["2026-07-06"]);
    });

    it("no genera el mismo ciclo dos veces cuando el puntero ya coincide con el mes actual", () => {
      const drafts = generateUpcomingObligations({
        templates: [template({ nextOccurrenceDate: "2026-07-06" })],
        asOfDate: "2026-07-06",
        withinDays: 30,
      });
      expect(drafts.map((d) => d.dueDate)).toEqual(["2026-07-06"]);
    });

    it("plantilla no mensual atrasada igual se recupera (sin el gap-fix específico de día del mes)", () => {
      const drafts = generateUpcomingObligations({
        templates: [
          template({ recurrenceType: "yearly", nextOccurrenceDate: "2026-06-15" }),
        ],
        asOfDate: "2026-07-08",
        withinDays: 30,
      });
      expect(drafts.map((d) => d.dueDate)).toEqual(["2026-06-15"]);
    });
  });
});
