import { describe, expect, it } from "vitest";

import {
  buildRecurringObligationCreateBody,
  composeRecurringTitle,
  validateRecurringPaymentForm,
} from "@/lib/treasury/treasury-recurring-form";

const baseValues = {
  counterparty: "Anna",
  concept: "Sueldo mensual",
  direction: "expense" as const,
  category: "Sueldos",
  currency: "USD" as const,
  amount: "700",
  frequency: "monthly" as const,
  dayOfMonth: "3",
  startsOn: "2026-06-03",
  endsOn: "",
  notes: "Todos los 3 de cada mes se pagan 700 USD a Anna por sueldo.",
};

describe("treasury-recurring-form", () => {
  it("valida caso Anna — sueldo mensual USD", () => {
    expect(validateRecurringPaymentForm(baseValues).ok).toBe(true);
    const body = buildRecurringObligationCreateBody(baseValues);
    expect(body.title).toBe("Anna — Sueldo mensual");
    expect(body.amount).toBe(700);
    expect(body.currency).toBe("USD");
    expect(body.recurrence_type).toBe("monthly");
    expect(body.next_occurrence_date).toBe("2026-06-03");
    expect(body.metadata?.day_of_month).toBe(3);
    expect(body.metadata?.counterparty).toBe("Anna");
    expect(body.metadata?.concept).toBe("Sueldo mensual");
  });

  it("requiere al menos proveedor o concepto", () => {
    const result = validateRecurringPaymentForm({
      ...baseValues,
      counterparty: "",
      concept: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.counterparty).toBeTruthy();
      expect(result.fieldErrors.concept).toBeTruthy();
    }
  });

  it("rechaza día del mes inválido en mensual", () => {
    const result = validateRecurringPaymentForm({
      ...baseValues,
      dayOfMonth: "32",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.dayOfMonth).toBeTruthy();
  });

  it("rechaza fin anterior al inicio", () => {
    const result = validateRecurringPaymentForm({
      ...baseValues,
      endsOn: "2026-05-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.endsOn).toBeTruthy();
  });

  it("composeRecurringTitle usa solo concepto si falta proveedor", () => {
    expect(composeRecurringTitle("", "Netflix")).toBe("Netflix");
    expect(composeRecurringTitle("Anna", "")).toBe("Anna");
  });
});
