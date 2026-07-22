import { describe, expect, it } from "vitest";

import {
  deriveSimpleMovementState,
  SIMPLE_MOVEMENT_STATE_ACTION_LABEL,
  SIMPLE_MOVEMENT_STATE_LABEL,
} from "@/lib/bank-movements/simple-movement-association";

const base = {
  direction: "inflow" as const,
  status: "pending" as const,
  isDuplicate: false,
  isHidden: false,
  level: "unidentified" as const,
};

describe("deriveSimpleMovementState", () => {
  it("sin cliente cuando no hay nivel o el nivel es unidentified", () => {
    expect(deriveSimpleMovementState(base)).toBe("sin_cliente");
    expect(deriveSimpleMovementState({ ...base, level: null })).toBe("sin_cliente");
    expect(deriveSimpleMovementState({ ...base, level: undefined })).toBe("sin_cliente");
  });

  it("asociado para cualquier nivel real de identificación o conciliación", () => {
    for (const level of [
      "client_identified",
      "missing_receipt",
      "reconciled_with_receipt",
      "full_reconciliation",
      "third_party",
      "shared_account",
      "requires_review",
    ] as const) {
      expect(deriveSimpleMovementState({ ...base, level })).toBe("asociado");
    }
  });

  it("pendiente cuando el status es needs_review, incluso con nivel unidentified", () => {
    expect(deriveSimpleMovementState({ ...base, status: "needs_review" })).toBe("pendiente");
  });

  it("ingreso no comercial cuando el status es ignored, incluso con cliente asociado", () => {
    expect(
      deriveSimpleMovementState({ ...base, status: "ignored", level: "client_identified" })
    ).toBe("ingreso_no_comercial");
  });

  it("duplicado tiene prioridad sobre cualquier otro estado salvo oculto", () => {
    expect(
      deriveSimpleMovementState({ ...base, isDuplicate: true, level: "client_identified", status: "ignored" })
    ).toBe("duplicado");
  });

  it("oculto tiene la prioridad más alta", () => {
    expect(
      deriveSimpleMovementState({ ...base, isHidden: true, isDuplicate: true, level: "client_identified" })
    ).toBe("oculto");
  });

  it("egresos (outflow) quedan fuera de este modelo (null) — usan el flujo de Tesorería", () => {
    expect(deriveSimpleMovementState({ ...base, direction: "outflow" })).toBeNull();
    // salvo oculto/duplicado, que aplican a cualquier movimiento
    expect(deriveSimpleMovementState({ ...base, direction: "outflow", isHidden: true })).toBe("oculto");
    expect(deriveSimpleMovementState({ ...base, direction: "outflow", isDuplicate: true })).toBe("duplicado");
  });

  it("todos los estados tienen label y una acción (o null explícito)", () => {
    for (const state of Object.keys(SIMPLE_MOVEMENT_STATE_LABEL) as Array<keyof typeof SIMPLE_MOVEMENT_STATE_LABEL>) {
      expect(SIMPLE_MOVEMENT_STATE_LABEL[state]).toBeTruthy();
      expect(SIMPLE_MOVEMENT_STATE_ACTION_LABEL[state] === null || typeof SIMPLE_MOVEMENT_STATE_ACTION_LABEL[state] === "string").toBe(true);
    }
  });
});
