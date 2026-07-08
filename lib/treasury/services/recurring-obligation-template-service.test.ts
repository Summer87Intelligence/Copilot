import { describe, expect, it } from "vitest";

import { nextPointerAfterResolving } from "@/lib/treasury/services/recurring-obligation-template-service";

const monthlyTemplate = { recurrenceType: "monthly" as const, recurrenceInterval: 1 };

describe("TREASURY-RECURRING-NEXT-MONTH-AFTER-PAYMENT-FIX-001", () => {
  it("Caso 1: julio pagado, agosto recién creado (no atrasado) → next = agosto, no septiembre", () => {
    const next = nextPointerAfterResolving("2026-08-05", "open_new", "2026-07-08", monthlyTemplate);
    expect(next).toBe("2026-08-05");
  });

  it("Caso 2: agosto ya existe abierto (planned) → next = agosto, no duplica ni salta", () => {
    const next = nextPointerAfterResolving("2026-08-06", "planned", "2026-07-08", monthlyTemplate);
    expect(next).toBe("2026-08-06");
  });

  it("Caso 3: agosto ya está pagado → recién ahí avanza a septiembre", () => {
    const next = nextPointerAfterResolving("2026-08-05", "paid", "2026-07-08", monthlyTemplate);
    expect(next).toBe("2026-09-05");
  });

  it("agosto cancelado también avanza a septiembre", () => {
    const next = nextPointerAfterResolving("2026-08-05", "cancelled", "2026-07-08", monthlyTemplate);
    expect(next).toBe("2026-09-05");
  });

  it("ciclo atrasado (vencido y aún no pagado) avanza al siguiente, no se queda pegado (ticket 1)", () => {
    const next = nextPointerAfterResolving("2026-07-06", "open_new", "2026-07-08", monthlyTemplate);
    expect(next).toBe("2026-08-06");
  });

  it("ciclo de hoy mismo (no atrasado) se mantiene como próximo", () => {
    const next = nextPointerAfterResolving("2026-07-08", "open_new", "2026-07-08", monthlyTemplate);
    expect(next).toBe("2026-07-08");
  });
});
