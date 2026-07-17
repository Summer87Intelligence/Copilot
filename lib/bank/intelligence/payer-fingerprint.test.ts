import { describe, it, expect } from "vitest";

import { derivePayerFingerprint, deriveMovementFingerprint, isStableFingerprint, maskAccount } from "@/lib/bank/intelligence/payer-fingerprint";

describe("derivePayerFingerprint", () => {
  it("prioriza el documento/RUT como identidad estable", () => {
    const a = derivePayerFingerprint({ bankName: "Santander", documentId: "21-345678-9", payerName: "PEPITO S.A." });
    const b = derivePayerFingerprint({ bankName: "Santander", documentId: "213456789", payerName: "Otro nombre" });
    expect(a.strength).toBe("document");
    expect(a.hash).toBe(b.hash); // mismo documento → misma huella pese a nombre distinto
  });
  it("NO usa bank_reference como identidad de pagador (es per-operación)", () => {
    // Dos movimientos con la MISMA referencia pero pagadores distintos NO deben
    // compartir identidad de pagador (bank_reference es de la operación, no del pagador).
    const a = derivePayerFingerprint({ bankName: "Santander", payerName: "Pepito SA" });
    const b = derivePayerFingerprint({ bankName: "Santander", payerName: "El Pais" });
    expect(a.hash).not.toBe(b.hash);
  });
  it("usa la cuenta ORIGEN cuando no hay documento; enmascara", () => {
    const fp = derivePayerFingerprint({ bankName: "Santander", accountRaw: "1234567 4821", payerName: "Pepito" });
    expect(fp.strength).toBe("account");
    expect(fp.maskedAccount).toBe("•••• 4821");
    expect(isStableFingerprint(fp)).toBe(true);
  });
  it("cae a nombre solo como último recurso (no estable)", () => {
    const fp = derivePayerFingerprint({ bankName: "Santander", payerName: "Pepito SA" });
    expect(fp.strength).toBe("name");
    expect(isStableFingerprint(fp)).toBe(false);
  });
  it("nombres distintos con misma cuenta comparten huella (no depende del nombre)", () => {
    const a = derivePayerFingerprint({ bankName: "Santander", accountRaw: "cuenta 99994821", payerName: "Pepito" });
    const b = derivePayerFingerprint({ bankName: "Santander", accountRaw: "99994821", payerName: "El Pais" });
    expect(a.hash).toBe(b.hash);
  });
  it("maskAccount devuelve null si no hay 4 dígitos", () => {
    expect(maskAccount("12")).toBeNull();
    expect(maskAccount(null)).toBeNull();
  });
});

describe("deriveMovementFingerprint", () => {
  it("dedup: misma operación (ref+importe+fecha) → misma huella de movimiento", () => {
    const a = deriveMovementFingerprint({ bankName: "Santander", bankReference: "OP-99", amountMinor: 100000, dateYmd: "2026-07-08", currency: "UYU" });
    const b = deriveMovementFingerprint({ bankName: "Santander", bankReference: "OP-99", amountMinor: 100000, dateYmd: "2026-07-08", currency: "UYU" });
    expect(a.hash).toBe(b.hash);
  });
  it("operaciones distintas (importe distinto) → huellas distintas", () => {
    const a = deriveMovementFingerprint({ bankReference: "OP-99", amountMinor: 100000, dateYmd: "2026-07-08" });
    const b = deriveMovementFingerprint({ bankReference: "OP-99", amountMinor: 200000, dateYmd: "2026-07-08" });
    expect(a.hash).not.toBe(b.hash);
  });
});
