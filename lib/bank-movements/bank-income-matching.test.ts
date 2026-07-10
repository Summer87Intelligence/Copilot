import { describe, expect, it } from "vitest";

import {
  buildIncomeCandidates,
  scoreClientIncomeCandidate,
  type IncomeClientInput,
  type IncomeMovementInput,
} from "@/lib/bank-movements/bank-income-matching";

function movement(over: Partial<IncomeMovementInput> = {}): IncomeMovementInput {
  return {
    id: "mov1",
    description: "TRANSFERENCIA RECIBIDA JP SOLUCIONES SAS",
    amount: 183,
    currency: "USD",
    movement_date: "2026-07-10",
    direction: "inflow",
    ...over,
  };
}

const fixerware: IncomeClientInput = {
  clientId: "fixerware",
  name: "Fixerware",
  legalName: "JP Soluciones SAS",
  rut: null,
  aliases: [{ aliasText: "JP SOLUCIONES SAS", aliasType: "learned" }],
  concepts: [
    { id: "pauta", label: "Pauta y redes", currency: "USD", expectedAmount: 183, billingType: "recurring", frequency: "monthly", expectedDay: 10, active: true },
    { id: "redis", label: "Rediseño web", currency: "USD", expectedAmount: 600, billingType: "one_time", active: true },
  ],
};

const clienteB: IncomeClientInput = {
  clientId: "b",
  name: "Cliente B",
  aliases: [],
  concepts: [
    { id: "pautaB", label: "Pauta y redes", currency: "USD", expectedAmount: 183, billingType: "recurring", frequency: "monthly", active: true },
  ],
};

describe("conceptos y alias (Fase 3/5)", () => {
  it("8. cliente puede tener varios conceptos", () => {
    expect(fixerware.concepts.length).toBe(2);
  });

  it("9/13. USD 183 + alias conocido → Fixerware / Pauta y redes / high", () => {
    const c = scoreClientIncomeCandidate(movement(), fixerware);
    expect(c?.confidence).toBe("high");
    expect(c?.conceptLabel).toBe("Pauta y redes");
  });

  it("10. Rediseño web con otro monto matchea otro concepto", () => {
    const c = scoreClientIncomeCandidate(movement({ amount: 600 }), fixerware);
    expect(c?.confidence).toBe("high");
    expect(c?.conceptLabel).toBe("Rediseño web");
  });

  it("11. concepto variable no da high por monto solo", () => {
    const variableClient: IncomeClientInput = {
      clientId: "v",
      name: "Var Cliente",
      aliases: [{ aliasText: "JP SOLUCIONES SAS", aliasType: "learned" }],
      concepts: [
        { id: "hosting", label: "Hosting", currency: "USD", expectedAmount: 183, billingType: "variable", active: true },
      ],
    };
    const c = scoreClientIncomeCandidate(movement(), variableClient);
    expect(c?.confidence).toBe("medium");
    expect(c?.flags.variableConcept).toBe(true);
  });
});

describe("scoring de identidad (Fase 5)", () => {
  it("12/18. USD 183 sin alias y con varios clientes → no high, múltiples candidatos", () => {
    const noAliasMovement = movement({ description: "TRANSFERENCIA RECIBIDA 183" });
    const candidates = buildIncomeCandidates(noAliasMovement, [
      { ...fixerware, aliases: [], legalName: null },
      clienteB,
    ]);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.every((c) => c.confidence !== "high")).toBe(true);
    expect(candidates.every((c) => c.flags.amountOnly)).toBe(true);
    expect(candidates.every((c) => c.flags.multipleClientsSameAmount)).toBe(true);
  });

  it("13. alias conocido + monto → high (una sola vez)", () => {
    const candidates = buildIncomeCandidates(movement(), [fixerware, clienteB]);
    expect(candidates[0]?.clientId).toBe("fixerware");
    expect(candidates[0]?.confidence).toBe("high");
  });

  it("14. razón social distinta al nombre comercial matchea", () => {
    const c = scoreClientIncomeCandidate(
      movement({ description: "CREDITO JP SOLUCIONES SAS", amount: 999 }),
      { ...fixerware, aliases: [] }
    );
    // Sin monto de concepto, pero identifica por razón social ⇒ media (no null).
    expect(c).not.toBeNull();
    expect(c?.confidence).toBe("medium");
  });

  it("15. RUT matchea si existe", () => {
    const c = scoreClientIncomeCandidate(
      movement({ description: "TRANSFERENCIA RECIBIDA 211009380012", amount: 183 }),
      { ...fixerware, aliases: [], legalName: null, rut: "211009380012" }
    );
    expect(c?.confidence).toBe("high");
    expect(c?.reasons.join(" ")).toContain("RUT");
  });
});

describe("montos repetidos y pagos (Fase 6)", () => {
  it("16. pago parcial se marca como posible parcial", () => {
    const c = scoreClientIncomeCandidate(movement({ amount: 100 }), fixerware);
    expect(c?.flags.partialPayment).toBe(true);
    expect(c?.confidence).toBe("medium"); // alias fuerte + parcial
  });

  it("17. pago acumulado 366 contra dos de 183 queda media, no high", () => {
    const c = scoreClientIncomeCandidate(movement({ amount: 366 }), fixerware);
    expect(c?.confidence).toBe("medium");
    expect(c?.flags.accumulatedPayment).toBe(true);
  });

  it("18. monto repetido en varios clientes muestra múltiples candidatos sin high", () => {
    const candidates = buildIncomeCandidates(movement({ description: "TRANSFERENCIA 183" }), [
      { ...fixerware, aliases: [], legalName: null },
      clienteB,
    ]);
    expect(candidates.length).toBe(2);
    expect(candidates.some((c) => c.confidence === "high")).toBe(false);
  });
});

describe("guardas de dirección", () => {
  it("25. movimiento de egreso no usa motor de ingresos", () => {
    const candidates = buildIncomeCandidates(movement({ direction: "outflow" }), [fixerware]);
    expect(candidates).toEqual([]);
  });
});
