import { describe, it, expect } from "vitest";

import { derivePayerFingerprint, isStableFingerprint, maskAccount } from "@/lib/bank/intelligence/payer-fingerprint";

describe("derivePayerFingerprint", () => {
  it("prioriza la referencia bancaria estable sobre el nombre", () => {
    const a = derivePayerFingerprint({ bankName: "Santander", bankReference: "OP-998877", payerName: "PEPITO S.A." });
    const b = derivePayerFingerprint({ bankName: "Santander", bankReference: "OP-998877", payerName: "Otro nombre" });
    expect(a.strength).toBe("reference");
    expect(a.hash).toBe(b.hash); // misma referencia → misma huella pese a nombre distinto
  });
  it("usa la cuenta cuando no hay referencia; enmascara", () => {
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
