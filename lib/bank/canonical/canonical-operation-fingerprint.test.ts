import { describe, it, expect } from "vitest";

import {
  computeCanonicalOperationFingerprint,
  normalizeCanonicalBankReference,
} from "@/lib/bank/canonical/canonical-operation-fingerprint";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BASE = {
  workspaceId: WS,
  accountNumber: "000001211749",
  bankReference: "TR0082544541",
  movementDate: "2026-04-10",
  amount: 7567,
  currency: "UYU",
};

describe("computeCanonicalOperationFingerprint — caso real Nirmex (Excel vs PDF)", () => {
  it("misma huella para la misma operación real vista por Excel y por PDF (descripción distinta)", () => {
    const excel = computeCanonicalOperationFingerprint(BASE);
    const pdf = computeCanonicalOperationFingerprint(BASE); // el parser nunca entra en la huella
    expect(excel).toBe(pdf);
    expect(excel).not.toBeNull();
  });

  it("caso real Harrison: mismo fingerprint pese al sufijo de página '-- 1 of 7 --' en la descripción PDF", () => {
    // La huella no incluye descripción, así que ni siquiera se le pasa una — documenta que es irrelevante.
    const fp = computeCanonicalOperationFingerprint({
      workspaceId: WS,
      accountNumber: "000001211749",
      bankReference: "TR0079611382",
      movementDate: "2026-01-29",
      amount: 43920,
      currency: "UYU",
    });
    expect(fp).not.toBeNull();
  });

  it("caso real Samysol: referencia con espacio extra ('SAMYS OL' vs 'SAMYSOL') no afecta la huella porque no depende de la descripción", () => {
    const a = computeCanonicalOperationFingerprint({ ...BASE, bankReference: "926466" });
    const b = computeCanonicalOperationFingerprint({ ...BASE, bankReference: "926466" });
    expect(a).toBe(b);
  });
});

describe("computeCanonicalOperationFingerprint — discriminación", () => {
  it("distinta fecha -> distinto fingerprint", () => {
    const a = computeCanonicalOperationFingerprint(BASE);
    const b = computeCanonicalOperationFingerprint({ ...BASE, movementDate: "2026-04-11" });
    expect(a).not.toBe(b);
  });

  it("distinto importe -> distinto fingerprint", () => {
    const a = computeCanonicalOperationFingerprint(BASE);
    const b = computeCanonicalOperationFingerprint({ ...BASE, amount: 7568 });
    expect(a).not.toBe(b);
  });

  it("distinta moneda -> distinto fingerprint", () => {
    const a = computeCanonicalOperationFingerprint(BASE);
    const b = computeCanonicalOperationFingerprint({ ...BASE, currency: "USD" });
    expect(a).not.toBe(b);
  });

  it("distinta cuenta -> distinto fingerprint", () => {
    const a = computeCanonicalOperationFingerprint(BASE);
    const b = computeCanonicalOperationFingerprint({ ...BASE, accountNumber: "005101107711" });
    expect(a).not.toBe(b);
  });

  it("distinto workspace -> distinto fingerprint (nunca cruza tenants)", () => {
    const a = computeCanonicalOperationFingerprint(BASE);
    const b = computeCanonicalOperationFingerprint({ ...BASE, workspaceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    expect(a).not.toBe(b);
  });

  it("distinta referencia -> distinto fingerprint", () => {
    const a = computeCanonicalOperationFingerprint(BASE);
    const b = computeCanonicalOperationFingerprint({ ...BASE, bankReference: "TR0000000000" });
    expect(a).not.toBe(b);
  });

  it("sin referencia bancaria -> null, nunca fusiona solo por fecha+importe+moneda", () => {
    expect(computeCanonicalOperationFingerprint({ ...BASE, bankReference: null })).toBeNull();
    expect(computeCanonicalOperationFingerprint({ ...BASE, bankReference: undefined })).toBeNull();
    expect(computeCanonicalOperationFingerprint({ ...BASE, bankReference: "   " })).toBeNull();
  });

  it("importes con distinta precisión decimal que representan el mismo valor producen la misma huella", () => {
    const a = computeCanonicalOperationFingerprint({ ...BASE, amount: 7567 });
    const b = computeCanonicalOperationFingerprint({ ...BASE, amount: 7567.0 });
    expect(a).toBe(b);
  });
});

describe("normalizeCanonicalBankReference", () => {
  it("normaliza mayúsculas y recorta espacios", () => {
    expect(normalizeCanonicalBankReference("  tr0082544541  ")).toBe("TR0082544541");
  });

  it("colapsa espacios internos (artefacto de extracción PDF)", () => {
    expect(normalizeCanonicalBankReference("TR 0082 544541")).toBe("TR0082544541");
  });

  it("null/vacío -> null", () => {
    expect(normalizeCanonicalBankReference(null)).toBeNull();
    expect(normalizeCanonicalBankReference(undefined)).toBeNull();
    expect(normalizeCanonicalBankReference("")).toBeNull();
    expect(normalizeCanonicalBankReference("   ")).toBeNull();
  });
});
