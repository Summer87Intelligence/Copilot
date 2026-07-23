/**
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
 * Tests del fingerprint canónico v1 (PDF/Excel/CSV convergen aquí).
 */
import { describe, expect, it } from "vitest";

import {
  BANK_MOVEMENT_FINGERPRINT_VERSION,
  computeBankMovementFingerprintV1,
  normalizeBankReference,
  normalizeSantanderDescription,
} from "@/lib/bank-movements/bank-movement-fingerprint-v1";

const BASE = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  accountNumber: "000001211749",
  bankName: "Santander",
  movementDate: "2026-07-15",
  currency: "UYU",
  amount: 1500.5,
  direction: "inflow" as const,
  bankReference: "NRR123456",
  description: "TRANSF  ACME SA",
};

describe("bank-movement-fingerprint-v1", () => {
  it("es estable y versionado", () => {
    const a = computeBankMovementFingerprintV1(BASE);
    const b = computeBankMovementFingerprintV1(BASE);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.version).toBe(BANK_MOVEMENT_FINGERPRINT_VERSION);
    expect(a.strength).toBe("bank_reference");
    expect(a.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ignora mayúsculas/espacios en referencia", () => {
    const a = computeBankMovementFingerprintV1(BASE);
    const b = computeBankMovementFingerprintV1({
      ...BASE,
      bankReference: "  nrr 123456 ",
    });
    expect(normalizeBankReference("  nrr 123456 ")).toBe("NRR123456");
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("no depende de descripción cuando hay referencia (cross-parser)", () => {
    const a = computeBankMovementFingerprintV1(BASE);
    const b = computeBankMovementFingerprintV1({
      ...BASE,
      description: `${BASE.description} -- 1 of 7 --`,
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("sin referencia usa composite e incluye descripción normalizada", () => {
    const a = computeBankMovementFingerprintV1({
      ...BASE,
      bankReference: null,
      description: "Pago ACME  -- 2 of 5 --",
    });
    const b = computeBankMovementFingerprintV1({
      ...BASE,
      bankReference: null,
      description: "pago acme",
    });
    expect(a.strength).toBe("composite");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(normalizeSantanderDescription("Pago ACME  -- 2 of 5 --")).toBe("pago acme");
  });

  it("dos transferencias legítimas mismo día/importe con refs distintas no colisionan", () => {
    const a = computeBankMovementFingerprintV1({ ...BASE, bankReference: "AAA001" });
    const b = computeBankMovementFingerprintV1({ ...BASE, bankReference: "BBB002" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("misma ref con formato distinto = mismo movimiento", () => {
    const a = computeBankMovementFingerprintV1({ ...BASE, bankReference: "tt-998877" });
    const b = computeBankMovementFingerprintV1({ ...BASE, bankReference: "TT 998877" });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("importe normaliza signo (absoluto)", () => {
    const a = computeBankMovementFingerprintV1({ ...BASE, amount: -1500.5 });
    const b = computeBankMovementFingerprintV1({ ...BASE, amount: 1500.5 });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("dirección distinta produce fingerprint distinto sin referencia", () => {
    const a = computeBankMovementFingerprintV1({
      ...BASE,
      bankReference: null,
      direction: "inflow",
    });
    const b = computeBankMovementFingerprintV1({
      ...BASE,
      bankReference: null,
      direction: "outflow",
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
