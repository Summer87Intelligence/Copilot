import { describe, expect, it } from "vitest";

import {
  bankMovementsScopeFromAccessLevel,
  bankMovementsScopeLabel,
  canMutateBankMovementRecord,
  canReadBankMovementsScope,
  mustForceBankInflowOnly,
} from "@/lib/auth/bank-movements-scope";

/**
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — el alcance de
 * Banco (independiente de heurísticas por email) sale enteramente del
 * access_level efectivo. `inflow_readonly` es el caso central: lee, pero
 * SOLO ingresos, y nunca puede mutar.
 */
describe("bankMovementsScopeFromAccessLevel", () => {
  it("mapea none/undefined/null a 'none'", () => {
    expect(bankMovementsScopeFromAccessLevel("none")).toBe("none");
    expect(bankMovementsScopeFromAccessLevel(undefined)).toBe("none");
    expect(bankMovementsScopeFromAccessLevel(null)).toBe("none");
    expect(bankMovementsScopeFromAccessLevel("")).toBe("none");
  });

  it("mapea 'inflow_readonly' a 'inflow_readonly'", () => {
    expect(bankMovementsScopeFromAccessLevel("inflow_readonly")).toBe("inflow_readonly");
  });

  it("mapea 'read' a 'read_all'", () => {
    expect(bankMovementsScopeFromAccessLevel("read")).toBe("read_all");
  });

  it("mapea 'write' y 'admin' a 'write_all'", () => {
    expect(bankMovementsScopeFromAccessLevel("write")).toBe("write_all");
    expect(bankMovementsScopeFromAccessLevel("admin")).toBe("write_all");
  });

  it("es tolerante a mayúsculas/espacios", () => {
    expect(bankMovementsScopeFromAccessLevel(" INFLOW_READONLY ")).toBe("inflow_readonly");
    expect(bankMovementsScopeFromAccessLevel("Write")).toBe("write_all");
  });

  it("valores desconocidos caen a 'none'", () => {
    expect(bankMovementsScopeFromAccessLevel("bogus")).toBe("none");
  });
});

describe("canReadBankMovementsScope", () => {
  it("permite leer con inflow_readonly, read_all y write_all", () => {
    expect(canReadBankMovementsScope("inflow_readonly")).toBe(true);
    expect(canReadBankMovementsScope("read_all")).toBe(true);
    expect(canReadBankMovementsScope("write_all")).toBe(true);
  });

  it("no permite leer con 'none'", () => {
    expect(canReadBankMovementsScope("none")).toBe(false);
  });
});

describe("canMutateBankMovementRecord", () => {
  it("solo 'write_all' puede mutar", () => {
    expect(canMutateBankMovementRecord("write_all")).toBe(true);
    expect(canMutateBankMovementRecord("read_all")).toBe(false);
    expect(canMutateBankMovementRecord("inflow_readonly")).toBe(false);
    expect(canMutateBankMovementRecord("none")).toBe(false);
  });
});

describe("mustForceBankInflowOnly", () => {
  it("solo 'inflow_readonly' fuerza direction=inflow", () => {
    expect(mustForceBankInflowOnly("inflow_readonly")).toBe(true);
    expect(mustForceBankInflowOnly("read_all")).toBe(false);
    expect(mustForceBankInflowOnly("write_all")).toBe(false);
    expect(mustForceBankInflowOnly("none")).toBe(false);
  });
});

describe("bankMovementsScopeLabel", () => {
  it("etiqueta inflow_readonly como 'Solo ingresos · Solo lectura'", () => {
    expect(bankMovementsScopeLabel("inflow_readonly")).toBe("Solo ingresos · Solo lectura");
  });

  it("etiqueta el resto de los niveles", () => {
    expect(bankMovementsScopeLabel("none")).toBe("No ver");
    expect(bankMovementsScopeLabel("read_all")).toBe("Ver todos");
    expect(bankMovementsScopeLabel("write_all")).toBe("Modificar");
  });
});
