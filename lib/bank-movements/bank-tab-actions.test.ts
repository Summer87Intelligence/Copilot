import { describe, expect, it } from "vitest";

import {
  MOVIMIENTOS_FORBIDDEN_ACTION_LABELS,
  movementsConsultActions,
  reconciliationActions,
} from "@/lib/bank-movements/bank-tab-actions";

describe("bank-tab-actions", () => {
  it("Movimientos sin cliente ofrece Ir a Conciliación, nunca Asignar", () => {
    const actions = movementsConsultActions({
      state: "sin_cliente",
      hasClient: false,
      canManageVisibility: true,
      isHidden: false,
    });
    expect(actions).toContain("ir_a_conciliacion");
    expect(actions).not.toContain("asignar_cliente" as never);
    expect(MOVIMIENTOS_FORBIDDEN_ACTION_LABELS).toContain("Asignar cliente");
  });

  it("Movimientos asociado ofrece Ver cliente", () => {
    expect(
      movementsConsultActions({
        state: "asociado",
        hasClient: true,
        canManageVisibility: false,
        isHidden: false,
      })
    ).toEqual(["ver_movimiento", "ver_cliente"]);
  });

  it("Movimientos duplicado ofrece Ver evidencia", () => {
    expect(
      movementsConsultActions({
        state: "duplicado",
        hasClient: false,
        canManageVisibility: false,
        isHidden: false,
      })
    ).toEqual(["ver_movimiento", "ver_evidencia"]);
  });

  it("Conciliación sin cliente ofrece Asignar cuando hay write", () => {
    expect(reconciliationActions({ state: "sin_cliente", canWrite: true })).toEqual([
      "asignar_cliente",
    ]);
    expect(reconciliationActions({ state: "sin_cliente", canWrite: false })).toEqual([]);
  });

  it("Conciliación asociado ofrece ver/cambiar/revocar según write", () => {
    expect(reconciliationActions({ state: "asociado", canWrite: true })).toEqual([
      "ver_asociacion",
      "ver_ficha_cliente",
      "cambiar_cliente",
      "revocar_asociacion",
    ]);
  });

  it("Conciliación duplicado solo Ver evidencia", () => {
    expect(reconciliationActions({ state: "duplicado", canWrite: true })).toEqual(["ver_evidencia"]);
  });
});
