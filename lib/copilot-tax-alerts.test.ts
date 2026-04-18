import { describe, expect, it } from "vitest";

import {
  classifyFiscalAlertPriority,
  isFiscalAlertId,
  parseFiscalAlertId,
} from "@/lib/copilot-tax-alerts";
import type { ProtoTaxObligation } from "@/lib/copilot-tax-data";

/** 15 jun 2025 medianoche local (determinista para due vs today). */
const REF_TODAY = new Date(2025, 5, 15);

function baseObligation(
  overrides: Partial<ProtoTaxObligation> &
    Pick<ProtoTaxObligation, "id" | "due_date" | "status">
): ProtoTaxObligation {
  return {
    tax_type: "iva",
    period_label: "2025-05",
    estimated_amount: 10_000,
    confirmed_amount: null,
    priority: "medium",
    notes: null,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("classifyFiscalAlertPriority", () => {
  it("devuelve null para obligación pagada", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "1",
          status: "paid",
          due_date: "2020-01-01",
        }),
        REF_TODAY
      )
    ).toBeNull();
  });

  it("marca critical por estado overdue aunque el vencimiento sea lejano", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "2",
          status: "overdue",
          due_date: "2026-01-01",
        }),
        REF_TODAY
      )
    ).toBe("critical");
  });

  it("marca critical si el vencimiento es hoy o mañana", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "3",
          status: "scheduled",
          due_date: "2025-06-15",
        }),
        REF_TODAY
      )
    ).toBe("critical");
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "4",
          status: "scheduled",
          due_date: "2025-06-16",
        }),
        REF_TODAY
      )
    ).toBe("critical");
  });

  it("marca high si vence en ≤7 días o estado pending", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "5",
          status: "scheduled",
          due_date: "2025-06-20",
        }),
        REF_TODAY
      )
    ).toBe("high");
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "6",
          status: "pending",
          due_date: "2025-12-31",
        }),
        REF_TODAY
      )
    ).toBe("high");
  });

  it("marca medium para scheduled dentro del horizonte mediano", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "7",
          status: "scheduled",
          due_date: "2025-08-01",
        }),
        REF_TODAY
      )
    ).toBe("medium");
  });

  it("scheduled lejano sigue en medium (el código trata scheduled como alerta mientras no esté pagada)", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "8",
          status: "scheduled",
          due_date: "2026-03-01",
        }),
        REF_TODAY
      )
    ).toBe("medium");
  });

  it("devuelve null si el estado no encaja en reglas de alerta y el vencimiento excede el horizonte", () => {
    expect(
      classifyFiscalAlertPriority(
        baseObligation({
          id: "9",
          status: "unknown_state",
          due_date: "2026-03-01",
        }),
        REF_TODAY
      )
    ).toBeNull();
  });
});

describe("parseFiscalAlertId / isFiscalAlertId", () => {
  it("parsea id con prefijo fiscal", () => {
    expect(parseFiscalAlertId("fiscal:abc-123")).toBe("abc-123");
  });

  it("rechaza prefijo incorrecto", () => {
    expect(parseFiscalAlertId("other:abc")).toBeNull();
    expect(isFiscalAlertId("x")).toBe(false);
  });

  it("detecta ids de alerta fiscal", () => {
    expect(isFiscalAlertId("fiscal:uuid")).toBe(true);
  });
});
