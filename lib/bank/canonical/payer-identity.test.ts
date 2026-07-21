import { describe, expect, it } from "vitest";

import {
  buildPayerLearningPayload,
  buildPayerToken,
  derivePayerFingerprintStrength,
  derivePayerIdentityDisplayStatus,
  extractPayerNameFromDescription,
  hashAccountOrReference,
  isOperationReference,
  maskAccountOrReference,
  normalizePayerName,
} from "@/lib/bank/canonical/payer-identity";

describe("normalizePayerName", () => {
  it("uppercases, strips accents and collapses whitespace", () => {
    expect(normalizePayerName("  Energética  Limitada  ")).toBe("ENERGETICA LIMITADA");
  });

  it("returns null for empty input", () => {
    expect(normalizePayerName(null)).toBeNull();
    expect(normalizePayerName("   ")).toBeNull();
  });
});

describe("buildPayerToken", () => {
  it("derives a stable ascii token from the normalized name", () => {
    expect(buildPayerToken("ENERGETICA LIMITADA")).toBe("ENERGETICA_LIMITADA");
  });

  it("returns null when there is no normalized name", () => {
    expect(buildPayerToken(null)).toBeNull();
  });
});

describe("maskAccountOrReference", () => {
  it("keeps only the last 4 characters visible", () => {
    expect(maskAccountOrReference("000123456789")).toBe("••••••••6789");
  });

  it("masks fully when the value is 4 chars or shorter", () => {
    expect(maskAccountOrReference("1234")).toBe("••••");
  });

  it("returns null for empty input", () => {
    expect(maskAccountOrReference(null)).toBeNull();
  });
});

describe("hashAccountOrReference", () => {
  it("is deterministic for the same input", () => {
    expect(hashAccountOrReference("cuenta-1")).toBe(hashAccountOrReference("cuenta-1"));
  });

  it("differs for different inputs", () => {
    expect(hashAccountOrReference("cuenta-1")).not.toBe(hashAccountOrReference("cuenta-2"));
  });
});

describe("derivePayerFingerprintStrength", () => {
  it("prioriza documento sobre cuenta y nombre", () => {
    expect(
      derivePayerFingerprintStrength({ documentId: "RUT123", accountOrToken: "acc", normalizedName: "X" })
    ).toBe("document");
  });

  it("usa cuenta/token cuando no hay documento", () => {
    expect(derivePayerFingerprintStrength({ accountOrToken: "acc", normalizedName: "X" })).toBe("account");
  });

  it("cae a nombre normalizado como último recurso confiable", () => {
    expect(derivePayerFingerprintStrength({ normalizedName: "X" })).toBe("name");
  });

  it("es 'none' sin ninguna señal confiable (nunca deriva de una referencia puntual)", () => {
    expect(derivePayerFingerprintStrength({})).toBe("none");
  });
});

describe("derivePayerIdentityDisplayStatus", () => {
  it("Revocada cuando el link está inactive o rejected", () => {
    expect(
      derivePayerIdentityDisplayStatus({ status: "inactive", confirmations: 5, linkedToOtherClients: false })
    ).toBe("Revocada");
    expect(
      derivePayerIdentityDisplayStatus({ status: "rejected", confirmations: 5, linkedToOtherClients: false })
    ).toBe("Revocada");
  });

  it("En conflicto cuando el link está conflicted, incluso con muchas confirmaciones", () => {
    expect(
      derivePayerIdentityDisplayStatus({ status: "conflicted", confirmations: 10, linkedToOtherClients: false })
    ).toBe("En conflicto");
  });

  it("Compartida cuando la identidad está vinculada activamente a otros clientes", () => {
    expect(
      derivePayerIdentityDisplayStatus({ status: "confirmed", confirmations: 3, linkedToOtherClients: true })
    ).toBe("Compartida");
  });

  it("Habitual con 2 o más confirmaciones y sin conflicto/comparticion", () => {
    expect(
      derivePayerIdentityDisplayStatus({ status: "confirmed", confirmations: 2, linkedToOtherClients: false })
    ).toBe("Habitual");
  });

  it("Ocasional con menos de 2 confirmaciones", () => {
    expect(
      derivePayerIdentityDisplayStatus({ status: "confirmed", confirmations: 1, linkedToOtherClients: false })
    ).toBe("Ocasional");
  });
});

describe("isOperationReference / extractPayerNameFromDescription / buildPayerLearningPayload", () => {
  it("reconoce referencias puntuales TT/LR/TR/LE/NRR", () => {
    expect(isOperationReference("TR0078809027")).toBe(true);
    expect(isOperationReference("LR123")).toBe(true);
    expect(isOperationReference("ENERGETIA_LIMITADA")).toBe(false);
    expect(extractPayerNameFromDescription("TRANSFERENCIA RECIBIDA /FIORELLA Y CIA. S.A. /CALLE")).toBe(
      "FIORELLA Y CIA. S.A."
    );
    const payload = buildPayerLearningPayload({
      description: "TRANSFERENCIA RECIBIDA /ENERGETIA LIMITADA /X",
      bankReference: "TR0078809027",
      bankName: "Santander",
      clientCompanyId: "c1",
    });
    expect(payload).not.toBeNull();
    expect(payload!.normalizedName).toBe("ENERGETIA LIMITADA");
    expect(payload!.accountHash).not.toEqual(expect.stringContaining("TR007"));
    expect(payload!.fingerprintStrength).toBe("name");

    const a = buildPayerLearningPayload({ description: "RECIBIDA /Acme SA /A", bankReference: "TR1" });
    const b = buildPayerLearningPayload({ description: "RECIBIDA /Acme SA /B", bankReference: "TR2" });
    expect(a!.accountHash).toBe(b!.accountHash);

    expect(
      buildPayerLearningPayload({ description: "SUELDOS", bankReference: "TR999", metadata: {} })
    ).toBeNull();
  });
});
